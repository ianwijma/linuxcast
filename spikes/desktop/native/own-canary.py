#!/usr/bin/python3
"""Own GTK/X11 window + private named selection. Never accesses CLIPBOARD."""
import json
import sys
import uuid

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
gi.require_version("GdkX11", "3.0")
from gi.repository import Gdk, GdkX11, GLib, Gtk


def main():
    initialized, _arguments = Gtk.init_check([])
    display = Gdk.Display.get_default()
    if not initialized or display is None or not isinstance(display, GdkX11.X11Display):
        print(json.dumps({"state": "unavailable", "reason": "AUTHORIZED_X11_DISPLAY_REQUIRED",
                          "action": "Run on the authorized X11 test session; this is not native Wayland proof"}))
        return 3

    # A fresh private selection cannot read or replace the user's real clipboard.
    atom = Gdk.Atom.intern("LINUXCAST_S0_02_PRIVATE_" + uuid.uuid4().hex, False)
    if Gdk.selection_owner_get_for_display(display, atom) is not None:
        raise RuntimeError("Unexpected owner of newly generated private selection")
    clipboard = Gtk.Clipboard.get_for_display(display, atom)
    result = {"state": "running", "backend": "GTK3/GDK-X11 own-window/private-selection",
              "ownerEvents": 0, "clipboardTouched": False, "privateSelectionTextMatches": False,
              "privateSelectionReleased": False, "initialGeometry": None, "finalGeometry": None,
              "configureEvents": [], "configureEventCount": 0, "invalidOwnConfigureObserved": False}
    clipboard.connect("owner-change", lambda *_args: result.update(ownerEvents=result["ownerEvents"] + 1))
    clipboard.set_text("public Linuxcast private-selection canary", -1)
    owned = Gdk.selection_owner_get_for_display(display, atom)
    if owned is None:
        raise RuntimeError("Private canary selection ownership was not established")

    def content(_clipboard, text, *_args):
        result["privateSelectionTextMatches"] = text == "public Linuxcast private-selection canary"

    def targets(_clipboard, atoms, *_args):
        result["privateSelectionMimes"] = sorted(item.name() for item in atoms)

    clipboard.request_text(content)
    clipboard.request_targets(targets)
    window = Gtk.Window(title="Linuxcast public integration canary")
    window.set_accept_focus(False)
    window.set_focus_on_map(False)
    window.set_skip_taskbar_hint(True)
    window.set_default_size(280, 120)
    window.add(Gtk.Label(label="Public integration canary\nNo user clipboard or window content is read"))
    mapped_by_server = False
    def mapped(*_args):
        nonlocal mapped_by_server
        mapped_by_server = True
        return False
    window.connect("map-event", mapped)
    def configured(_window, event):
        result["configureEventCount"] = min(255, result["configureEventCount"] + 1)
        client = tuple(window.get_size())
        values = (event.width, event.height, *client)
        if any(not isinstance(value, int) or not 0 < value <= 16384 for value in values):
            result["invalidOwnConfigureObserved"] = True
            return False
        if len(result["configureEvents"]) < 8:
            state = window.get_window().get_state()
            result["configureEvents"].append({
                "width": event.width, "height": event.height,
                "clientWidth": client[0], "clientHeight": client[1],
                "requestSent": result["initialGeometry"] is not None,
                "maximized": bool(state & Gdk.WindowState.MAXIMIZED),
                "fullscreen": bool(state & Gdk.WindowState.FULLSCREEN),
                "iconified": bool(state & Gdk.WindowState.ICONIFIED),
                "resizable": window.get_resizable()})
        return False
    window.connect("configure-event", configured)
    window.show_all()

    def rectangle():
        rect = window.get_window().get_frame_extents()
        return {"x": rect.x, "y": rect.y, "width": rect.width, "height": rect.height}

    requested = (360, 180)
    started = GLib.get_monotonic_time()
    def finish():
        result["finalGeometry"] = rectangle()
        result["mappedByServer"] = mapped_by_server
        result["requestedClientSize"] = {"width": requested[0], "height": requested[1]}
        result["clientSizeApplied"] = tuple(window.get_size()) == requested
        # Never clear a newer owner, even for this private test selection.
        if Gdk.selection_owner_get_for_display(display, atom) == owned:
            clipboard.clear()
            result["privateSelectionReleased"] = True
        else:
            result["preservedNewerOwner"] = True
        before, after = result["initialGeometry"], result["finalGeometry"]
        result["liveGeometryChanged"] = bool(before and after and (before["width"], before["height"]) != (after["width"], after["height"]))
        result["state"] = "passed" if result["liveGeometryChanged"] and result["clientSizeApplied"] and result["privateSelectionTextMatches"] else "failed"
        window.destroy()
        Gtk.main_quit()
        return False

    def observe():
        if result["initialGeometry"] is None and mapped_by_server:
            result["initialGeometry"] = rectangle()
            # Exactly one client resize request after actual X11 MapNotify.
            window.resize(*requested)
        elif result["initialGeometry"] is not None:
            current = rectangle()
            before = result["initialGeometry"]
            changed = (current["width"], current["height"]) != (before["width"], before["height"])
            if changed and tuple(window.get_size()) == requested and result["privateSelectionTextMatches"]:
                return finish()
        if GLib.get_monotonic_time() - started >= 3500000:
            return finish()
        return True

    GLib.timeout_add(100, observe)
    try:
        Gtk.main()
    finally:
        if Gdk.selection_owner_get_for_display(display, atom) == owned:
            clipboard.clear()
        window.destroy()
    print(json.dumps(result, sort_keys=True))
    return 0 if result["state"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
