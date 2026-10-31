#!/usr/bin/python3
"""Private synthetic D-Bus tests. Never use bus_get or inherited bus addresses.

Run in a disposable, network-disabled, cap-dropped container. Root *inside* the
container supplies a root-owned synthetic peer without a production bypass.
Requires distro python3-gi and dbus-daemon; no downloaded Python dependencies.
"""
import ctypes
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import tempfile
import time

LOGIN = "org.freedesktop.login1"
MANAGER = LOGIN + ".Manager"
SESSION = LOGIN + ".Session"
PROPS = "org.freedesktop.DBus.Properties"
BUS = "org.freedesktop.DBus"
ROOT = "/org/freedesktop/login1"
OBJECT = ROOT + "/session/synthetic"
SENTINEL = "SYNTHETIC_PRIVATE_CONTENT_DO_NOT_EMIT"


def environment(directory, address):
    # subprocess env is an explicit allowlist, equivalent to clearenv(). No host
    # HOME, credentials, display, session bus or runtime directory is inherited.
    return {
        "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "HOME": str(directory),
        "XDG_RUNTIME_DIR": str(directory), "DBUS_SYSTEM_BUS_ADDRESS": address,
        "DBUS_SESSION_BUS_ADDRESS": "unix:path=/nonexistent-session-bus",
    }


def serve(address, scenario, expected_parent):
    from gi.repository import Gio, GLib
    connection = Gio.DBusConnection.new_for_address_sync(
        address, Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT |
        Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION, None, None)
    connection.set_exit_on_close(False)
    loop = GLib.MainLoop()

    def bus_call(method, value, reply):
        return connection.call_sync(BUS, "/org/freedesktop/DBus", BUS, method,
                                    value, GLib.VariantType.new(reply),
                                    Gio.DBusCallFlags.NO_AUTO_START, 500, None)

    bus_call("RequestName", GLib.Variant("(su)", (LOGIN, 0)), "(u)")
    xml = """<node><interface name="org.freedesktop.login1.Manager">
      <method name="GetSessionByPID"><arg type="u" direction="in"/>
      <arg type="o" direction="out"/></method></interface>
      <interface name="org.freedesktop.DBus.Properties">
      <method name="GetAll"><arg type="s" direction="in"/>
      <arg type="a{sv}" direction="out"/></method></interface></node>"""
    info = Gio.DBusNodeInfo.new_for_xml(xml)
    state = {"locked": False, "active": True, "changed": False, "scheduled": False}

    def emit(interface, member, body, path=OBJECT, peer=None):
        (peer or connection).emit_signal(None, path, interface, member, body)

    def change():
        state["changed"] = True
        if scenario in ("lock", "invalidated", "stale-signal", "inflight-lock"):
            state["locked"] = True
            invalidated = ["LockedHint"] if scenario == "invalidated" else []
            changes = {} if invalidated else {"LockedHint": GLib.Variant("b", True)}
            emit(PROPS, "PropertiesChanged", GLib.Variant("(sa{sv}as)", (SESSION, changes, invalidated)))
            if scenario == "stale-signal":
                emit(PROPS, "PropertiesChanged", GLib.Variant("(sa{sv}as)", (SESSION, {"LockedHint": GLib.Variant("b", False)}, [])))
        elif scenario == "inactive":
            state["active"] = False
            emit(PROPS, "PropertiesChanged", GLib.Variant("(sa{sv}as)", (SESSION, {}, ["Active"])))
        elif scenario in ("owner-cycle", "inflight-owner"):
            bus_call("ReleaseName", GLib.Variant("(s)", (LOGIN,)), "(u)")
            bus_call("RequestName", GLib.Variant("(su)", (LOGIN, 0)), "(u)")
            emit(PROPS, "PropertiesChanged", GLib.Variant("(sa{sv}as)", (SESSION, {"LockedHint": GLib.Variant("b", False)}, [])))
        elif scenario == "removed":
            emit(MANAGER, "SessionRemoved", GLib.Variant("(so)", ("synthetic", OBJECT)), ROOT)
        elif scenario == "sleep":
            emit(MANAGER, "PrepareForSleep", GLib.Variant("(b)", (True,)), ROOT)
        elif scenario == "malformed-signal":
            emit(PROPS, "PropertiesChanged", GLib.Variant("(sb)", (SESSION, False)))
        elif scenario == "spurious-peer":
            other = Gio.DBusConnection.new_for_address_sync(address,
                Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT |
                Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION, None, None)
            emit(PROPS, "PropertiesChanged", GLib.Variant("(sa{sv}as)", (SESSION, {"LockedHint": GLib.Variant("b", True)}, [])), peer=other)
            other.flush_sync(None)
            other.close_sync(None)
        return False

    def method(_, sender, path, interface, name, params, invocation):
        if name == "GetSessionByPID":
            pid, = params.unpack()
            if expected_parent and pid != expected_parent:
                invocation.return_dbus_error("org.freedesktop.DBus.Error.AccessDenied", SENTINEL)
                return
            target = OBJECT + "_drift" if scenario == "session-drift" and state["scheduled"] else OBJECT
            invocation.return_value(GLib.Variant("(o)", (target,)))
            return
        assert name == "GetAll" and params.unpack() == (SESSION,)
        if scenario in ("timeout", "term-pending", "eof-pending"):
            return  # Deliberately withhold the reply; production deadline must win.
        if scenario == "refresh-timeout" and state["scheduled"]:
            return  # A live process must not heartbeat its previous unlocked state.
        if scenario == "denial":
            invocation.return_dbus_error("org.freedesktop.DBus.Error.AccessDenied", SENTINEL)
            return
        if scenario == "wrong-reply":
            reply = Gio.DBusMessage.new_method_reply(invocation.get_message())
            reply.set_body(GLib.Variant("(s)", (SENTINEL,)))
            connection.send_message(reply, Gio.DBusSendMessageFlags.NONE)
            return
        values = {
            "User": GLib.Variant("(uo)", (os.getuid(), ROOT + "/user/synthetic")),
            "Class": GLib.Variant("s", "user"), "Type": GLib.Variant("s", "wayland"),
            "Active": GLib.Variant("b", state["active"]),
            "Remote": GLib.Variant("b", False),
            "LockedHint": GLib.Variant("b", state["locked"]),
            "Name": GLib.Variant("s", SENTINEL),
        }
        if scenario == "foreign-uid": values["User"] = GLib.Variant("(uo)", (os.getuid() + 1, ROOT + "/user/foreign"))
        if scenario == "remote": values["Remote"] = GLib.Variant("b", True)
        if scenario == "tty": values["Type"] = GLib.Variant("s", "tty")
        if scenario == "greeter": values["Class"] = GLib.Variant("s", "greeter")
        if scenario == "x11": values["Type"] = GLib.Variant("s", "x11")
        if scenario == "initial-locked": values["LockedHint"] = GLib.Variant("b", True)
        if scenario == "initial-inactive": values["Active"] = GLib.Variant("b", False)
        if scenario == "missing": del values["LockedHint"]
        if scenario == "idle-only":
            del values["LockedHint"]
            values["IdleHint"] = GLib.Variant("b", False)
        if scenario == "wrong-type": values["LockedHint"] = GLib.Variant("s", SENTINEL)
        if scenario == "invalidated-missing" and state["changed"]: del values["LockedHint"]
        if not state["scheduled"]:
            state["scheduled"] = True
            if scenario.startswith("inflight-"):
                change()  # Before returning a captured, now stale initial snapshot.
            elif scenario == "invalidated-missing":
                def invalidate_missing():
                    state["changed"] = True
                    emit(PROPS, "PropertiesChanged", GLib.Variant("(sa{sv}as)", (SESSION, {}, ["LockedHint"])))
                    return False
                GLib.timeout_add(80, invalidate_missing)
            else:
                GLib.timeout_add(80, change)
        invocation.return_value(GLib.Variant("(a{sv})", (values,)))

    registrations = [
        connection.register_object(ROOT, info.interfaces[0], method, None, None),
        connection.register_object(OBJECT, info.interfaces[1], method, None, None),
    ]
    print("READY", flush=True)
    try:
        loop.run()
    finally:
        for registration in registrations: connection.unregister_object(registration)
        connection.close_sync(None)


class Fixture:
    def __init__(self, helper, scenario, expected_parent=None):
        self.directory = tempfile.TemporaryDirectory(prefix="linuxcast-session-")
        self.root = Path(self.directory.name)
        os.chmod(self.root, 0o700)
        config = self.root / "bus.conf"
        config.write_text("""<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN"
          "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
          <busconfig><type>system</type><listen>unix:tmpdir=""" + str(self.root) + """</listen>
          <auth>EXTERNAL</auth><policy context="default"><allow send_destination="*"/>
          <allow receive_sender="*"/><allow own="*"/></policy></busconfig>""")
        clean = environment(self.root, "unix:path=/nonexistent-before-private-bus")
        self.bus = subprocess.Popen(["/usr/bin/dbus-daemon", "--nofork", "--config-file=" + str(config), "--print-address=1"], env=clean, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.address = self.bus.stdout.readline().decode().strip()
        assert self.address.startswith("unix:"), "private bus failed"
        self.env = environment(self.root, self.address)
        self.service = subprocess.Popen(["/usr/bin/python3", __file__, "service", self.address, scenario, str(os.getpid() if expected_parent is None else expected_parent)], env=self.env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        assert select.select([self.service.stdout], [], [], 2)[0], "fixture service startup timeout"
        assert self.service.stdout.readline() == b"READY\n", self.service.stderr.read().decode()
        self.helper = helper
        self.child = None
        self.frames = []
        self.pending = b""

    def start(self):
        self.started = time.monotonic()
        self.child = subprocess.Popen([self.helper], env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return self.child

    def ingest(self, data):
        self.pending += data
        while b"\n" in self.pending:
            line, self.pending = self.pending.split(b"\n", 1)
            assert len(line) + 1 <= 512
            frame = json.loads(line)
            assert frame["schemaVersion"] == 1
            assert type(frame["sequence"]) is int and 0 < frame["sequence"] <= 9007199254740991
            assert not self.frames or frame["sequence"] > self.frames[-1][1]["sequence"]
            keys = {"schemaVersion", "sequence", "state"}
            if frame["state"] == "observed":
                assert set(frame) == keys | {"active", "lockedHint", "localGraphical", "ownerMatches"}
                assert all(type(frame[k]) is bool for k in ("active", "lockedHint", "localGraphical", "ownerMatches"))
            else:
                assert frame["state"] == "unavailable" and set(frame) == keys | {"reason"}
                assert frame["reason"] in ("unavailable", "denied", "invalid-session", "invalid-response", "peer-changed", "transport-lost")
            assert SENTINEL.encode() not in line
            assert not self.frames or self.frames[-1][1]["state"] != "unavailable", "frame after terminal failure"
            self.frames.append((time.monotonic(), frame))
        assert len(self.pending) < 512

    def assert_terminal(self, errors):
        assert self.frames and self.frames[-1][1]["state"] == "unavailable", self.frames
        assert sum(f[1]["state"] == "unavailable" for f in self.frames) == 1
        assert not self.pending and errors == b""

    def collect(self, seconds, terminal=False):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if select.select([self.child.stdout], [], [], min(.02, max(0, deadline - time.monotonic())))[0]:
                data = os.read(self.child.stdout.fileno(), 4096)
                if not data: break
                self.ingest(data)
            if self.child.poll() is not None and not select.select([self.child.stdout], [], [], 0)[0]: break
        if terminal:
            self.child.wait(timeout=.4)
            self.collect(.05)
            self.assert_terminal(self.child.stderr.read())
        return [f for _, f in self.frames]

    def close(self):
        if self.child:
            if self.child.poll() is None:
                self.child.stdin.close()
            # Every successful observation case also checks its final EOF frame,
            # line privacy and bounded exit, rather than ignoring teardown output.
            self.collect(.5, terminal=True)
        for process in (self.service, self.bus):
            if process.poll() is None: process.terminate()
            process.wait(timeout=1)
        self.directory.cleanup()


def run_tests(helper, denied_only=False):
    checks = []

    def run(name, assertion, seconds=.7, terminal=False, scenario=None):
        fixture = Fixture(helper, scenario or name)
        try:
            fixture.start()
            frames = fixture.collect(seconds, terminal)
            assertion(frames, fixture)
            checks.append(name)
            print("PASS", name, flush=True)
        finally:
            fixture.close()

    def reason(expected, allow_observed=False):
        def check(frames, fixture):
            assert frames[-1]["reason"] == expected, frames
            if not allow_observed: assert len(frames) == 1, frames
        return check

    if denied_only:
        assert os.getuid() != 0
        run("untrusted-peer-uid", reason("denied"), terminal=True, scenario="healthy")
        return
    assert os.getuid() == 0, "positive peer attestation requires container-root; never bypass production check"

    def healthy(frames, fixture):
        assert len(frames) >= 4 and all(f["state"] == "observed" and f["active"] and not f["lockedHint"] for f in frames), frames
        assert all(b[0] - a[0] < 1 for a, b in zip(fixture.frames, fixture.frames[1:])), fixture.frames
    run("healthy", healthy, seconds=1.1)
    run("x11", healthy, seconds=1.1)
    run("spurious-peer", healthy, seconds=1.1)
    for name, field, value in [("lock", "lockedHint", True), ("invalidated", "lockedHint", True), ("stale-signal", "lockedHint", True), ("inactive", "active", False)]:
        def changed(frames, fixture, field=field, value=value):
            assert frames[0][field] != value and any(f.get(field) == value for f in frames[1:]), frames
            first = next(i for i, f in enumerate(frames) if f.get(field) == value)
            assert all(f.get(field) == value for f in frames[first:]), frames
            assert fixture.frames[first][0] - fixture.frames[0][0] < .5
        run(name, changed)
    for name, field in [("initial-locked", "lockedHint"), ("initial-inactive", "active")]:
        run(name, lambda frames, _, field=field: check_initial(frames, field))
    for name in ("foreign-uid", "remote", "tty", "greeter", "session-drift"):
        run(name, reason("invalid-session"), terminal=True)
    for name in ("missing", "idle-only", "wrong-type"):
        run(name, reason("invalid-response"), terminal=True)
    run("wrong-reply", lambda f, _: assert_one_failure(f), terminal=True)
    run("denial", reason("denied"), terminal=True)
    def timeout_check(frames, fixture):
        reason("unavailable")(frames, fixture)
        assert fixture.frames[-1][0] - fixture.started < .9, fixture.frames
    run("timeout", timeout_check, seconds=1, terminal=True)
    def refresh_timeout_check(frames, fixture):
        assert len(frames) == 2 and frames[0]["state"] == "observed", frames
        assert frames[1]["state"] == "unavailable" and frames[1]["reason"] == "unavailable", frames
        assert fixture.frames[1][0] - fixture.frames[0][0] < 1, fixture.frames
    run("refresh-timeout", refresh_timeout_check, seconds=1.2, terminal=True)
    run("owner-cycle", reason("peer-changed", True), terminal=True)
    run("inflight-owner", reason("peer-changed"), terminal=True)
    run("inflight-lock", lambda f, _: check_all_locked(f))
    for name, expected in [("removed", "invalid-session"), ("sleep", "invalid-session"), ("malformed-signal", "invalid-response"), ("invalidated-missing", "invalid-response")]:
        run(name, reason(expected, True), terminal=True)

    for action in ("eof", "term", "bus-loss", "stdin-data", "term-pending", "eof-pending"):
        fixture = Fixture(helper, action if action.endswith("pending") else "healthy")
        try:
            fixture.start()
            fixture.collect(.08)
            before = time.monotonic()
            if action in ("eof", "eof-pending"): fixture.child.stdin.close()
            elif action in ("term", "term-pending"): fixture.child.send_signal(signal.SIGTERM)
            elif action == "bus-loss": fixture.bus.terminate(); fixture.bus.wait(timeout=1)
            else: fixture.child.stdin.write(b"untrusted identity\n"); fixture.child.stdin.flush()
            fixture.collect(.5, terminal=True)
            assert time.monotonic() - before < .7
            # The daemon may deliver owner loss before its transport closes.
            if action == "bus-loss": assert fixture.frames[-1][1]["reason"] in ("transport-lost", "peer-changed"), fixture.frames
            if action == "stdin-data": assert fixture.frames[-1][1]["reason"] == "invalid-response"
            checks.append(action); print("PASS", action, flush=True)
        finally: fixture.close()

    # Test-only subreaper adopts exactly the helper started by the dying parent;
    # production never adopts, enumerates or kills unrelated descendants.
    assert ctypes.CDLL(None).prctl(36, 1, 0, 0, 0) == 0
    fixture = Fixture(helper, "healthy", expected_parent=0)
    reader, writer = os.pipe()
    parent = None
    child_pid = None
    reaped = False
    try:
        parent = subprocess.Popen(["/usr/bin/python3", __file__, "parent", helper, str(fixture.root), str(reader)], env=fixture.env, pass_fds=(reader,), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        os.close(reader); reader = None
        assert select.select([parent.stdout], [], [], 2)[0], "parent startup timeout"
        child_pid = int(parent.stdout.readline())
        offset = 0
        output = fixture.root / "parent-output"

        def collect_output():
            nonlocal offset
            data = output.read_bytes()
            fixture.ingest(data[offset:])
            offset = len(data)

        deadline = time.monotonic() + 2
        while not fixture.frames:
            collect_output()
            assert time.monotonic() < deadline, "no eligible observation before parent exit"
            time.sleep(.01)
        first = fixture.frames[0][1]
        assert first["state"] == "observed" and first["active"] and not first["lockedHint"]
        assert first["localGraphical"] and first["ownerMatches"]
        # This controller retains writer until AFTER helper exit: no EOF can
        # satisfy this parent-lifetime case when the original parent dies.
        parent.stdin.close(); parent.wait(timeout=.5)
        deadline = time.monotonic() + .7
        while time.monotonic() < deadline:
            pid, status = os.waitpid(child_pid, os.WNOHANG)
            if pid:
                reaped = True
                break
            time.sleep(.01)
        else: raise AssertionError("original parent gone: helper not reaped")
        assert os.WIFEXITED(status)
        collect_output()
        fixture.assert_terminal((fixture.root / "parent-errors").read_bytes())
        assert fixture.frames[-1][1]["reason"] == "invalid-session"
        checks.append("original-parent-gone"); print("PASS original-parent-gone", flush=True)
    finally:
        os.close(writer)
        if reader is not None: os.close(reader)
        if parent is not None:
            if parent.poll() is None: parent.kill()
            parent.wait(timeout=1)
        if child_pid is not None and not reaped:
            try: os.kill(child_pid, signal.SIGKILL)
            except ProcessLookupError: pass
            deadline = time.monotonic() + 1
            while time.monotonic() < deadline:
                try:
                    if os.waitpid(child_pid, os.WNOHANG)[0]: break
                except ChildProcessError: break
                time.sleep(.01)
            else: raise AssertionError("parent-death fixture fallback did not reap exact child")
        fixture.close()
    print(json.dumps({"syntheticChecks": len(checks), "checks": checks, "desktopAcceptance": False}, sort_keys=True))


def check_initial(frames, field):
    assert frames and all(f["state"] == "observed" and f[field] == (field == "lockedHint") for f in frames), frames


def check_all_locked(frames):
    assert frames and all(f["state"] == "observed" and f["lockedHint"] for f in frames), frames


def assert_one_failure(frames):
    assert len(frames) == 1 and frames[0]["state"] == "unavailable", frames


if __name__ == "__main__":
    if sys.argv[1] == "service": serve(sys.argv[2], sys.argv[3], int(sys.argv[4]))
    elif sys.argv[1] == "parent":
        with open(Path(sys.argv[3]) / "parent-output", "wb") as output, open(Path(sys.argv[3]) / "parent-errors", "wb") as errors:
            child = subprocess.Popen([sys.argv[2]], env=environment(sys.argv[3], os.environ["DBUS_SYSTEM_BUS_ADDRESS"]), stdin=int(sys.argv[4]), stdout=output, stderr=errors)
            print(child.pid, flush=True)
            sys.stdin.buffer.read(1)
            os._exit(0)
    else: run_tests(str(Path(sys.argv[1]).resolve()), "--denied-only" in sys.argv)
