#!/usr/bin/python3
"""Real private D-Bus round trip; fixed synthetic peers, not a KWin runtime."""
import json
import os
import sys

import gi

gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib

NAME = "io.github.ianwijma.Linuxcast.Spike.Desktop1"
PATH = "/io/github/ianwijma/Linuxcast/Spike/Desktop1"
XML = """<node><interface name="io.github.ianwijma.Linuxcast.Spike.Desktop1">
<method name="Handshake"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
<method name="NextCommand"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
<method name="Ack"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
</interface></node>"""


def main():
    loop = GLib.MainLoop()
    report = {"kind": "private-Gio-DBus-fixture-not-KWin", "singlePending": False,
              "acknowledged": False, "freshGeneration": False, "noReplay": False}
    state = {"generation": 0, "peer": None, "pending": None, "command": None, "delivered": False}
    server = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    client = Gio.DBusConnection.new_for_address_sync(
        os.environ["DBUS_SESSION_BUS_ADDRESS"],
        Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
        None, None)
    failure = []

    def reply(invocation, data):
        invocation.return_value(GLib.Variant("(s)", (json.dumps(data),)))

    def method(_connection, sender, _path, _interface, name, params, invocation):
        try:
            encoded = params.unpack()[0]
            if len(encoded.encode()) > 65536:
                raise ValueError("FRAME_LIMIT")
            value = json.loads(encoded)
            if value.get("protocolVersion") != 1:
                raise ValueError("PROTOCOL_VERSION")
            if name == "Handshake":
                if state["pending"]:
                    reply(state["pending"], {"kind": "reconnect", "reason": "NEW_GENERATION"})
                state.update(generation=state["generation"] + 1, peer=sender, pending=None,
                             command=None, delivered=False)
                reply(invocation, {"protocolVersion": 1, "generation": state["generation"]})
            elif sender != state["peer"] or value.get("generation") != state["generation"]:
                raise ValueError("STALE_PEER_OR_GENERATION")
            elif name == "NextCommand":
                if state["pending"] is not None or state["command"] is not None:
                    reply(invocation, {"kind": "error", "reason": "ONE_PENDING_ONLY"})
                    return
                state["pending"] = invocation

                def deliver():
                    pending = state["pending"]
                    if pending is None:
                        return False
                    state["pending"] = None
                    if state["generation"] == 1 and not state["delivered"]:
                        state.update(command="1-1", delivered=True)
                        reply(pending, {"kind": "command", "id": "1-1", "generation": 1,
                                        "operation": "geometry", "expiresInMs": 500})
                    else:
                        reply(pending, {"kind": "empty", "reason": "POLL_DEADLINE"})
                    return False

                GLib.timeout_add(50, deliver)
            elif name == "Ack":
                if value.get("id") != state["command"] or value.get("outcome") != "ok":
                    raise ValueError("STALE_ACK")
                state["command"] = None
                report["acknowledged"] = True
                reply(invocation, {"kind": "ack"})
        except (ValueError, TypeError, KeyError):
            reply(invocation, {"kind": "error", "reason": "INVALID_REQUEST"})

    node = Gio.DBusNodeInfo.new_for_xml(XML)
    registration = server.register_object(PATH, node.interfaces[0], method, None, None)

    def call(method_name, value, callback):
        def completed(connection, result):
            try:
                callback(json.loads(connection.call_finish(result).unpack()[0]))
            except Exception:
                failure.append("WIRE_FIXTURE_FAILED")
                loop.quit()
        client.call(NAME, PATH, NAME, method_name, GLib.Variant("(s)", (json.dumps(value),)),
                    GLib.VariantType.new("(s)"), Gio.DBusCallFlags.NONE, 2000, None, completed)

    def versioned(generation, **values):
        return {"protocolVersion": 1, "generation": generation, **values}

    def final_poll(value):
        report["noReplay"] = value.get("kind") == "empty"
        loop.quit()

    def fresh(value):
        report["freshGeneration"] = value.get("generation") == 2
        call("NextCommand", versioned(2), final_poll)

    def acknowledged(value):
        if value.get("kind") != "ack":
            raise ValueError("ACK_FAILED")
        call("Handshake", {"protocolVersion": 1}, fresh)

    def command(value):
        if value.get("kind") != "command":
            raise ValueError("COMMAND_FAILED")
        call("Ack", versioned(1, id=value["id"], outcome="ok"), acknowledged)

    def duplicate(value):
        report["singlePending"] = value.get("reason") == "ONE_PENDING_ONLY"

    def first(value):
        call("NextCommand", versioned(value["generation"]), command)
        call("NextCommand", versioned(value["generation"]), duplicate)

    owner = Gio.bus_own_name_on_connection(server, NAME, Gio.BusNameOwnerFlags.NONE,
        lambda *_args: call("Handshake", {"protocolVersion": 1}, first),
        lambda *_args: (failure.append("PRIVATE_NAME_UNAVAILABLE"), loop.quit()))
    timeout = GLib.timeout_add(3000, lambda: (failure.append("WIRE_DEADLINE"), loop.quit(), False)[-1])
    try:
        loop.run()
    finally:
        GLib.source_remove(timeout)
        Gio.bus_unown_name(owner)
        server.unregister_object(registration)
        client.close_sync(None)
    report["state"] = "passed" if not failure and all(report[key] for key in ("singlePending", "acknowledged", "freshGeneration", "noReplay")) else "failed"
    print(json.dumps(report, sort_keys=True))
    return 0 if report["state"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
