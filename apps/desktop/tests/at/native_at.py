#!/usr/bin/python3
"""Read-only product observer for a future controller-owned Debian AT session.

Does not launch Electron, Orca or a bus; does not synthesize any key. No native
imports occur until the private-session envelope passes. Run --check-envelope
without connecting to a bus. The controller must separately attest the product
URL, source/build hashes, sandbox and target process lifetime (see README).
"""
import json
import os
from pathlib import Path
import re
import stat
import sys

from observations import Observer, Rejected


def xvfb_arguments(arguments, display, authority):
    if (len(arguments) < 2 or Path(arguments[0]).name != "Xvfb" or arguments[1] != display
            or arguments.count(display) != 1 or arguments.count("-auth") != 1
            or arguments[arguments.index("-auth") + 1:arguments.index("-auth") + 2] != [authority]
            or "-ac" in arguments or "-listen" in arguments
            or not any(arguments[index:index + 2] == ["-nolisten", "tcp"] for index in range(len(arguments)))):
        raise Rejected("owned-xvfb-required")


def envelope(env):
    root = Path(env.get("LINUXCAST_F102_AT_ROOT", ""))
    if (root.parent != Path("/tmp") or not re.fullmatch(r"linuxcast-f102-at-[a-z0-9]{8,32}", root.name)
            or root.is_symlink() or not root.is_dir()):
        raise Rejected("private-root-required")
    info = root.stat()
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise Rejected("private-root-required")
    for key, suffix in {"HOME": "home", "XDG_RUNTIME_DIR": "runtime", "XDG_CONFIG_HOME": "config",
                        "XDG_CACHE_HOME": "cache", "XDG_DATA_HOME": "data"}.items():
        path = root / suffix
        if env.get(key) != str(path) or path.is_symlink() or not path.is_dir():
            raise Rejected("private-profile-required")
        info = path.stat()
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise Rejected("private-profile-required")
    if (env.get("XDG_SESSION_TYPE") != "x11" or env.get("WAYLAND_DISPLAY")
            or not re.fullmatch(r":[1-9][0-9]{2,4}", env.get("DISPLAY", ""))):
        raise Rejected("private-display-required")
    authority = root / "runtime/Xauthority"
    if env.get("XAUTHORITY") != str(authority) or authority.is_symlink() or not authority.is_file():
        raise Rejected("private-authority-required")
    info = authority.stat()
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
        raise Rejected("private-authority-required")
    for key, suffix in {"DBUS_SESSION_BUS_ADDRESS": "session-bus", "AT_SPI_BUS_ADDRESS": "at-bus"}.items():
        if env.get(key) != f"unix:path={root}/runtime/{suffix}":
            raise Rejected("private-bus-required")
        path = root / "runtime" / suffix
        if path.is_symlink() or not path.is_socket() or path.stat().st_uid != os.getuid():
            raise Rejected("private-bus-required")
    if env.get("GSETTINGS_BACKEND") != "memory":
        raise Rejected("private-settings-required")
    pid = env.get("LINUXCAST_F102_XVFB_PID", "")
    if not re.fullmatch(r"[1-9][0-9]{0,8}", pid):
        raise Rejected("owned-xvfb-required")
    process = Path("/proc") / pid
    if process.stat().st_uid != os.getuid():
        raise Rejected("owned-xvfb-required")
    arguments = process.joinpath("cmdline").read_bytes().decode().rstrip("\0").split("\0")
    xvfb_arguments(arguments, env["DISPLAY"], str(authority))


def main():
    def output(value):
        print(json.dumps(value), flush=True)

    try:
        envelope(os.environ)
        if sys.argv[1:] == ["--check-envelope"]:
            output({"status": "prepared-envelope-only", "nativeRun": False})
            return 0
        if len(sys.argv) != 3 or not all(re.fullmatch(r"[1-9][0-9]{0,8}", value) for value in sys.argv[1:]):
            raise Rejected("invalid-target")
        target, reader = map(int, sys.argv[1:])
        # No host fallback. Exact runtime/source attestation remains the controller's job.
        import platform
        if platform.freedesktop_os_release().get("ID") != "debian" or platform.freedesktop_os_release().get("VERSION_ID") != "13":
            raise Rejected("unsupported-platform")
        for pid in (target, reader):
            if Path(f"/proc/{pid}").stat().st_uid != os.getuid():
                raise Rejected("invalid-target")
        import pyatspi
        from gi.repository import GLib
        observer = Observer(target, os.getpid(), reader)
        roles = {getattr(pyatspi, enum, None): name for enum, name in (
            ("ROLE_ENTRY", "entry"), ("ROLE_LIST_BOX", "listbox"), ("ROLE_LIST_ITEM", "option"),
            ("ROLE_PUSH_BUTTON", "button"), ("ROLE_HEADING", "heading"),
            ("ROLE_DIALOG", "dialog"), ("ROLE_STATUS_BAR", "status"))}
        states = {name: getattr(pyatspi, "STATE_" + name.upper())
                  for name in ("focused", "selected", "showing", "visible")}

        class Node:
            def __init__(self, obj):
                self.obj = obj

            def pid(self):
                return self.obj.getApplication().get_process_id()

            def name(self):
                return self.obj.name

            def kind(self):
                return roles.get(self.obj.getRole(), "other")

            def state(self, name):
                return self.obj.getState().contains(states[name])

            def children(self):
                return (Node(child) for child in self.obj)

        failed = False

        def fail(reason):
            nonlocal failed
            if not failed:
                failed = True
                output({"status": "incomplete", "reason": reason})
            pyatspi.Registry.stop()
            return False

        def event(value):
            try:
                if value.type.startswith("object:active-descendant-changed"):
                    if Node(value.source).pid() == target:
                        observer.event(Node(value.any_data), "active-descendant")
                else:
                    kind = "focus" if value.type.startswith("object:state-changed:focused") else "selection"
                    observer.event(Node(value.source), kind, value.detail1 == 1)
            except Exception:
                fail("native-event-unavailable")

        def inspect():
            try:
                output(observer.snapshot([Node(app) for app in pyatspi.Registry.getDesktop(0)]))
            except Rejected as error:
                fail(str(error))
            except Exception:
                fail("native-observation-unavailable")
            return False

        # GLib watches stdin: no lingering command thread. EOF is a clean stop.
        def command(channel, condition):
            if condition & (GLib.IO_HUP | GLib.IO_ERR):
                pyatspi.Registry.stop()
                return False
            line = sys.stdin.readline(32)
            if line == "inspect\n":
                inspect()
                return not failed
            if line == "quit\n" or not line:
                pyatspi.Registry.stop()
                return False
            return fail("invalid-command")

        pyatspi.Registry.registerEventListener(event, "object:state-changed:focused",
                                              "object:state-changed:selected", "object:active-descendant-changed")
        GLib.io_add_watch(sys.stdin, GLib.IO_IN | GLib.IO_HUP | GLib.IO_ERR, command)
        GLib.timeout_add_seconds(120, lambda: fail("observer-deadline"))
        output({"status": "ready", "nativeRun": True})
        pyatspi.Registry.start()
        return 3 if failed else 0
    except Rejected as error:
        output({"status": "unavailable", "reason": str(error), "nativeRun": False})
        return 3
    except Exception:
        output({"status": "unavailable", "reason": "native-precondition-unavailable", "nativeRun": False})
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
