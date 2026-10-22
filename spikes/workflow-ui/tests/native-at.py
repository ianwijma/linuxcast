"""Native AT-SPI observer, bounded to the synthetic Electron process.

Actual Orca is tested separately on Xvfb. This observer never starts Orca,
changes settings, grabs keys, synthesizes events or reads other apps' content.
"""
import json
import os
import sys
import threading
import traceback

try:
    import pyatspi
    from gi.repository import GLib
except Exception as error:
    print(json.dumps({"status": "import-unavailable", "error_class": type(error).__name__}), flush=True)
    sys.exit(3)

target_pid = int(sys.argv[1])
expected = {"Node label", "Apply configuration", "Move node down", "Search palette"}
events = []
allowed_pids = {target_pid, os.getpid()}
if len(sys.argv) > 2:
    allowed_pids.add(int(sys.argv[2]))  # The exact separately launched test Orca PID.


def owned(obj):
    try:
        return obj.getApplication().get_process_id() == target_pid
    except Exception:
        return False


def output(value):
    print(json.dumps(value), flush=True)


def focused(event):
    if owned(event.source) and event.detail1 and event.source.name in expected:
        events.append(event.source.name)
        del events[:-64]


pyatspi.Registry.registerEventListener(focused, "object:state-changed:focused")


def inspect():
    try:
        desktop = pyatspi.Registry.getDesktop(0)
        applications = list(desktop)
        # Refuse to inspect/log content if this supposedly private bus contains
        # another app. Only process identifiers are checked before this boundary.
        if any(app.get_process_id() not in allowed_pids for app in applications):
            output({"status": "isolation-failed", "applications": len(applications)})
            return False
        found = []
        budget = [5000]

        def walk(obj, depth=0):
            budget[0] -= 1
            if depth > 30 or budget[0] < 0:
                raise RuntimeError("bounded-tree-exceeded")
            if obj.name in expected:
                found.append({"label": obj.name, "role": obj.getRoleName(),
                              "focused": obj.getState().contains(pyatspi.STATE_FOCUSED)})
            for child in obj:
                walk(child, depth + 1)

        for app in applications:
            if app.get_process_id() != target_pid:
                continue  # The GTK observer may register itself; never traverse it.
            walk(app)
        output({"status": "observed", "applications": len(applications), "controls": found,
                "focus_events": list(events)})
    except Exception as error:
        output({"status": "unavailable", "error_class": type(error).__name__,
                "frames": [{"file": os.path.basename(frame.filename), "line": frame.lineno,
                            "method": frame.name} for frame in traceback.extract_tb(error.__traceback__)]})
    return False


def commands():
    for line in sys.stdin:
        if line.strip() == "inspect":
            GLib.idle_add(inspect)
        elif line.strip() == "quit":
            GLib.idle_add(pyatspi.Registry.stop)
            return
    GLib.idle_add(pyatspi.Registry.stop)


threading.Thread(target=commands, daemon=True).start()
output({"status": "ready", "private_bus": bool(os.environ.get("DBUS_SESSION_BUS_ADDRESS"))})
pyatspi.Registry.start()
