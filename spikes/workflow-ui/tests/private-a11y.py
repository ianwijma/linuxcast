"""Private test-session accessibility discovery, never a global settings service.

The real Electron ATK bridge needs org.a11y.Bus discovery and enabled status.
This process supplies these in-memory values only on our disposable session bus;
the separate actual dbus-daemon/AT-SPI registry carries native accessibility data.
"""
import json
import os

import dbus
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib

DBusGMainLoop(set_as_default=True)
session = dbus.SessionBus()
name = dbus.service.BusName("org.a11y.Bus", bus=session)


class Discovery(dbus.service.Object):
    @dbus.service.method("org.a11y.Bus", out_signature="s")
    def GetAddress(self):
        return os.environ["AT_SPI_BUS_ADDRESS"]


class Status(Discovery):
    @dbus.service.method("org.freedesktop.DBus.Properties", in_signature="ss", out_signature="v")
    def Get(self, interface, prop):
        if interface == "org.a11y.Status" and prop in ("IsEnabled", "ScreenReaderEnabled"):
            return dbus.Boolean(True)
        raise dbus.exceptions.DBusException("Unsupported private status property")

    @dbus.service.method("org.freedesktop.DBus.Properties", in_signature="s", out_signature="a{sv}")
    def GetAll(self, interface):
        if interface != "org.a11y.Status":
            return {}
        return {"IsEnabled": dbus.Boolean(True), "ScreenReaderEnabled": dbus.Boolean(True)}


status = Status(session, "/org/a11y/bus")
print(json.dumps({"status": "ready"}), flush=True)
GLib.MainLoop().run()
