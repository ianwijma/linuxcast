"""Owned, memory-only discovery. Never connects to a host settings service."""
import os

import dbus
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib

DBusGMainLoop(set_as_default=True)
bus = dbus.SessionBus()
name = dbus.service.BusName("org.a11y.Bus", bus=bus, do_not_queue=True)


class Discovery(dbus.service.Object):
    @dbus.service.method("org.a11y.Bus", out_signature="s")
    def GetAddress(self):
        return os.environ["AT_SPI_BUS_ADDRESS"]

    @dbus.service.method("org.freedesktop.DBus.Properties", in_signature="ss", out_signature="v")
    def Get(self, interface, prop):
        if interface == "org.a11y.Status" and prop in ("IsEnabled", "ScreenReaderEnabled"):
            return dbus.Boolean(True)
        raise dbus.exceptions.DBusException("Unsupported private property")

    @dbus.service.method("org.freedesktop.DBus.Properties", in_signature="s", out_signature="a{sv}")
    def GetAll(self, interface):
        return {"IsEnabled": dbus.Boolean(True), "ScreenReaderEnabled": dbus.Boolean(True)} if interface == "org.a11y.Status" else {}


status = Discovery(bus, "/org/a11y/bus")
print('{"status":"ready"}', flush=True)
GLib.MainLoop().run()
