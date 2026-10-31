"""Strict controller/observer boundary and exclusive public publication."""
import json
import os
from pathlib import Path

STEPS = ("search", "result", "away", "back", "actions", "form", "save", "cancel",
         "restore", "hide", "reopen", "loading", "error", "recovery")
IDS = {"search", "action-search", "actions-dialog", "edit-alias", "alias-field", "save-alias",
       "cancel", "fallback-hide", "quit", "application-heading", "error-heading", "loading", "public-result"}
KINDS = {"entry", "listbox", "option", "button", "heading", "dialog", "status"}
EVENTS = {"focus", "selection", "active-descendant"}
FLAGS = {"native", "freshEvent", "generated", "attempt", "completion", "geometry", "operation"}
SPEECH_STEPS = set(STEPS) - {"away", "hide", "loading"}
FAILURES = {"none", "prerequisite", "deadline", "child", "protocol", "native", "orca", "product", "cleanup"}


class ControllerRejected(Exception):
    """Fixed reason only; raw exceptions never cross publication."""


def integer(value, maximum):
    return type(value) is int and 0 <= value <= maximum


def enum(value, choices):
    return type(value) is str and value in choices


def decode(line):
    def unique(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                raise ControllerRejected("protocol")
            value[key] = item
        return value
    if type(line) is not bytes or len(line) > 65536 or not line.endswith(b"\n"):
        raise ControllerRejected("protocol")
    try:
        return json.loads(line, object_pairs_hook=unique)
    except (ValueError, UnicodeError, RecursionError):
        raise ControllerRejected("protocol") from None


def snapshot(value, previous=0):
    if (type(value) is not dict or set(value) != {"status", "sequence", "controls", "events"}
            or value["status"] != "observed" or not integer(value["sequence"], 100000)
            or value["sequence"] < previous or type(value["controls"]) is not list
            or len(value["controls"]) > 128 or type(value["events"]) is not list or len(value["events"]) > 64):
        raise ControllerRejected("protocol")
    for item in value["controls"]:
        if (type(item) is not dict or set(item) != {"id", "kind", "focused", "selected", "showing", "visible"}
                or not enum(item["id"], IDS) or not enum(item["kind"], KINDS)
                or any(type(item[key]) is not bool for key in ("focused", "selected", "showing", "visible"))):
            raise ControllerRejected("protocol")
    last = value["sequence"] - len(value["events"])
    for item in value["events"]:
        if (type(item) is not dict or set(item) != {"sequence", "event", "id", "kind"}
                or not integer(item["sequence"], value["sequence"]) or item["sequence"] == 0 or item["sequence"] != last + 1
                or not enum(item["id"], IDS) or not enum(item["kind"], KINDS) or not enum(item["event"], EVENTS)):
            raise ControllerRejected("protocol")
        last = item["sequence"]
    if value["sequence"] and (not value["events"] or last != value["sequence"]):
        raise ControllerRejected("protocol")
    return value


class Report:
    def __init__(self):
        self.failure = "none"
        self.failed_step = "setup"
        self.steps = []
        self.cleaned = False
        self.native_runs = 0
        self.pending = None

    def begin(self, step):
        if self.failure != "none" or self.pending is not None or step != STEPS[len(self.steps)]:
            raise ControllerRejected("protocol")
        self.pending = {"id": step, **{flag: False for flag in FLAGS}}
        return self.pending

    def fail(self, reason, step):
        if reason not in FAILURES - {"none"} or step not in (*STEPS, "setup"):
            raise ControllerRejected("protocol")
        if self.failure == "none":
            self.failure, self.failed_step = reason, step

    def add(self, step, flags):
        if (self.failure != "none" or len(self.steps) >= len(STEPS) or step != STEPS[len(self.steps)]
                or type(flags) is not dict or set(flags) != FLAGS
                or any(type(v) is not bool for v in flags.values()) or not valid_flags(step, flags)):
            raise ControllerRejected("protocol")
        self.steps.append({"id": step, **flags})
        self.pending = None

    def public(self):
        value = {"schema": "f102-native-controller-v1", "status": "incomplete",
                 "firstFailure": self.failure, "failedStep": self.failed_step,
                 "steps": self.steps, "pending": self.pending, "cleanup": self.cleaned,
                 "injectedStates": True, "mediaEmulated": False, "audible": False,
                 "completionValidated": False, "nativeRuns": self.native_runs}
        # A whole sequence is still only bounded private-session evidence.
        if len(self.steps) == len(STEPS) and self.failure == "none" and self.cleaned:
            value["status"] = "observed-private-sequence"
            value["failedStep"] = "none"
        return value


def validate_public(value):
    keys = {"schema", "status", "firstFailure", "failedStep", "steps", "pending", "cleanup", "injectedStates",
            "mediaEmulated", "audible", "completionValidated", "nativeRuns"}
    if (type(value) is not dict or set(value) != keys or value["schema"] != "f102-native-controller-v1"
            or not enum(value["status"], {"incomplete", "observed-private-sequence"})
            or not enum(value["firstFailure"], FAILURES) or not enum(value["failedStep"], (*STEPS, "setup", "none"))
            or type(value["steps"]) is not list or len(value["steps"]) > len(STEPS)
            or type(value["cleanup"]) is not bool or value["injectedStates"] is not True
            or value["mediaEmulated"] is not False or value["audible"] is not False
            or value["completionValidated"] is not False or type(value["nativeRuns"]) is not int
            or value["nativeRuns"] not in (0, 1)):
        raise ControllerRejected("protocol")
    for index, item in enumerate(value["steps"]):
        if (type(item) is not dict or set(item) != {"id", *FLAGS} or item["id"] != STEPS[index]
                or any(type(item[k]) is not bool for k in FLAGS) or not valid_flags(item["id"], item)):
            raise ControllerRejected("protocol")
    item = value["pending"]
    if item is not None and (type(item) is not dict or set(item) != {"id", *FLAGS}
            or len(value["steps"]) >= len(STEPS) or item["id"] != STEPS[len(value["steps"])]
            or any(type(item[k]) is not bool for k in FLAGS) or item["completion"]
            or item["id"] != value["failedStep"] or value["firstFailure"] == "none"):
        raise ControllerRejected("protocol")
    if value["status"] == "observed-private-sequence" and (
            len(value["steps"]) != len(STEPS) or value["firstFailure"] != "none"
            or value["failedStep"] != "none" or value["cleanup"] is not True or value["nativeRuns"] != 1
            or value["pending"] is not None):
        raise ControllerRejected("protocol")


def valid_flags(step, flags):
    return (flags["native"] is True and flags["operation"] is True and flags["completion"] is False
            and flags["freshEvent"] is (step in SPEECH_STEPS)
            and flags["geometry"] is (step != "hide")
            and flags["generated"] is (step in SPEECH_STEPS) and flags["attempt"] is (step in SPEECH_STEPS))


def publish(directory, value):
    validate_public(value)  # Validate before touching the filesystem.
    directory = Path(directory)
    directory.mkdir(mode=0o700, parents=False, exist_ok=False)
    fd = os.open(directory / "report.json", os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
