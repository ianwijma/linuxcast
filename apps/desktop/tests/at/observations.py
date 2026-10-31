"""Product AT-SPI projection. Pure adapters; no display/bus/import side effects.

Only fixed synthetic names become public IDs. Unknown text, values, descriptions,
PIDs, object paths and exceptions never enter a report. This is test preparation,
not an acceptance result or a general accessibility/content inspection API.
"""

NAMES = {
    "Search commands": "search",  # Native role distinguishes entry and listbox.
    "Find an action": "action-search",
    "Actions": "actions-dialog",
    "Edit search alias": "edit-alias",
    "Search alias": "alias-field",
    "Save alias": "save-alias",
    "Cancel": "cancel",
    "Hide": "fallback-hide",
    "Quit Linuxcast": "quit",
    "Linuxcast": "application-heading",
    "Linuxcast could not connect": "error-heading",
    "Opening Linuxcast…": "loading",
    "Public AT result Installed application": "public-result",
}
KINDS = {"entry", "listbox", "option", "button", "heading", "dialog", "status"}
STATES = ("focused", "selected", "showing", "visible")
EVENTS = {"focus", "selection", "active-descendant"}


class Rejected(Exception):
    """Fixed public failure only; never attach private native data."""


class Observer:
    def __init__(self, target_pid, observer_pid, reader_pid):
        if any(type(pid) is not int or pid <= 0 for pid in (target_pid, observer_pid, reader_pid)):
            raise Rejected("invalid-target")
        if len({target_pid, observer_pid, reader_pid}) != 3:
            raise Rejected("invalid-target")
        self.target = target_pid
        self.allowed = {target_pid, observer_pid, reader_pid}
        self.sequence = 0
        self.events = []

    def identify(self, obj):
        # Ownership precedes all name/state/child reads, including event payloads.
        if obj.pid() != self.target:
            return None
        name = obj.name()
        identifier = NAMES.get(name)
        kind = obj.kind()
        if identifier is None or kind not in KINDS:
            return None
        return identifier, kind

    def event(self, obj, kind, gain=True):
        if kind not in EVENTS or gain is not True:
            return
        identity = self.identify(obj)
        if identity is None:
            return
        self.sequence += 1
        self.events.append({"sequence": self.sequence, "event": kind,
                            "id": identity[0], "kind": identity[1]})
        self.events = self.events[-64:]

    def snapshot(self, applications):
        # Inspect every application PID before traversing ANY content.
        if any(app.pid() not in self.allowed for app in applications):
            raise Rejected("foreign-application")
        targets = [app for app in applications if app.pid() == self.target]
        if len(targets) != 1:
            raise Rejected("target-unavailable")
        controls = []
        budget = 5000

        def walk(obj, depth):
            nonlocal budget
            budget -= 1
            if depth > 30 or budget < 0:
                raise Rejected("tree-limit")
            if obj.pid() != self.target:
                raise Rejected("foreign-node")
            identity = self.identify(obj)
            if identity:
                controls.append({"id": identity[0], "kind": identity[1],
                                 **{state: obj.state(state) is True for state in STATES}})
                if len(controls) > 128:
                    raise Rejected("control-limit")
            for child in obj.children():
                walk(child, depth + 1)

        walk(targets[0], 0)
        return {"status": "observed", "sequence": self.sequence,
                "controls": controls, "events": list(self.events)}


def checkpoint(snapshot, identifier, kind, after, event="focus"):
    """A fresh event AND a unique current native state are required.

    Result selection uses selection/active-descendant events and separately
    requires a focused native listbox. DOM focus is never substituted here.
    """
    if identifier not in NAMES.values() or kind not in KINDS or event not in EVENTS:
        return False
    if type(after) is not int or after < 0 or snapshot.get("status") != "observed":
        return False
    candidates = [control for control in snapshot["controls"]
                  if control["id"] == identifier and control["kind"] == kind]
    state = "focused" if event == "focus" else "selected"
    if len(candidates) != 1 or not all(candidates[0][key] is True for key in (state, "visible", "showing")):
        return False
    if not any(item["sequence"] > after and item["id"] == identifier
               and item["kind"] == kind and item["event"] == event for item in snapshot["events"]):
        return False
    if event != "focus":
        lists = [control for control in snapshot["controls"] if control["id"] == "search"
                 and control["kind"] == "listbox" and control["focused"] is True
                 and control["visible"] is True and control["showing"] is True]
        return len(lists) == 1
    return True
