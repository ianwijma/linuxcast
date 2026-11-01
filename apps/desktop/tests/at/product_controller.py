"""Review-before-execution product AT controller. Import is offline and inert.

CLI refuses host/nonisolated environments. No fallback display, bus, reader,
dependency, product executable, catalogue, timeout extension or input retry.
"""
import argparse
import ctypes
import hashlib
import fcntl
import stat
import json
import os
from pathlib import Path
import platform
import signal
import subprocess
import time

from controller_protocol import ControllerRejected, FAILURES, Report, STEPS, decode, publish, snapshot
from orca_output import FreshOutput, OutputRejected
from session_owner import Channel, Deadline, SessionOwner, socket_ready

HERE = Path(__file__).resolve().parent
# Coordinator's fresh preflight, independently re-read parser sources31Oct.
ORCA_HASHES = {
    "scripts/default.py": "a00ffb60f6bea89094bb4f493bc17096254f2a7a3546241f10958db27efb5eb3",
    "scripts/web/script.py": "ac044208aeeb138cb4a8ddf46e8aecd98edde3ef59e0f2135a64e859cb07aee5",
    "settings.py": "48dc0833fae4e5c908496ecd92a406c8a0bae399e233f4623c3c4797c7f239ce",
    "settings_manager.py": "c2a7534b6881cc920959e1fa151c7c38d3b5b7c3533b10378f2f5d5358e35a85",
    "backends/json_backend.py": "ec485b5da86a9af816a51515da5b90c09edc00850ff58622bf8b4fb6fd021042",
    "speech.py": "88ef3fb73c8984968c71460af8410344384e4f73ea4cf022e9015589ed38c5a4",
    "speechserver.py": "bc966bdff543dd5877c0961c091446e3f25e6d31fe49dd5e23c30049a2e2f33a",
    "speechdispatcherfactory.py": "47f584dfeb47a0988a7bd34586d29f7c45bbd2ffaba3dfa9ea9798d82622d7e6",
    "ssml.py": "0bb7896a48b4ce4cad8e73b52c263efa856105bb2d802dd2f181d6bffe4f293f",
    "input_event.py": "953665d9129070a901cccc73ab6f16365ebadf4cce517dd0112bc7ae85575185",
    "speech_and_verbosity_manager.py": "7194efaffd8a75c5955a64f7936050661fc7c052fd13634bbe4b96f673cbc290",
    "debug.py": "ca2159aba7c42282b65235e493c67f092b893fc0b7e9b00c602a4705c995ffd8",
    "ax_utilities_debugging.py": "c21b12c5e7ff1fa5120f9073f3b2a9478826623fed581279c2e77b267a3c6482",
}
TARGETS = {
    "search": ("search", "entry"), "result": ("public-result", "option"),
    "away": ("public-alternate", "option"), "final": ("public-final", "option"),
    "back": ("public-result", "option"), "actions": ("action-search", "entry"),
    "form": ("alias-field", "entry"), "save": ("save-alias", "button"),
    "cancel": ("cancel", "button"), "restore": ("search", "entry"),
    "reopen": ("search", "entry"), "error": ("fallback-hide", "button"),
    "recovery": ("search", "entry"),
}


# Independent, closed verifier for the root wrapper's data-only handoff. No
# wrapper import, namespace FD, caller path, environment override or fallback.
NS_TYPES = {'net': 0x40000000, 'mnt': 0x20000, 'pid': 0x20000000, 'user': 0x10000000}
PROOF_SEALS = fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL


def proof_require(condition):
    if not condition:
        raise ControllerRejected('prerequisite')



def proc_mount(fd, lib):
    # Linux amd64 ABI: statfs.f_type at0; statx mask at0, mount ID at0x90.
    # Require the returned STATX_MNT_ID bit: unavailable is never equivalent.
    fs = ctypes.create_string_buffer(256)
    proof_require(lib.fstatfs(fd, ctypes.byref(fs)) == 0)
    proof_require(ctypes.c_long.from_buffer(fs).value == 0x9fa0)  # PROC_SUPER_MAGIC
    sx = ctypes.create_string_buffer(256)
    proof_require(lib.statx(fd, b'', 0x1000, 0x1000, ctypes.byref(sx)) == 0)  # AT_EMPTY_PATH, STATX_MNT_ID
    proof_require(ctypes.c_uint32.from_buffer(sx).value & 0x1000)
    mount = ctypes.c_uint64.from_buffer(sx, 0x90).value
    proof_require(mount > 0)
    return mount


def proc_text(name):
    """Read only current maps/stat from genuine proc, with no file bind overlay.

    Anchoring to proc root inode1 plus equal kernel mount IDs defeats both a
    fabricated mapping file and a real proc file bound from a different task.
    There is no fdinfo/mountinfo text whose authority could itself be overlaid.
    """
    proof_require(name in ('uid_map', 'gid_map', 'stat'))
    lib = ctypes.CDLL(None, use_errno=True)
    root = os.open('/proc', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        base = os.fstat(root)
        proof_require(stat.S_ISDIR(base.st_mode) and base.st_ino == 1)
        mount = proc_mount(root, lib)
        fd = os.open('self/' + name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=root)
        try:
            info = os.fstat(fd)
            proof_require(stat.S_ISREG(info.st_mode) and info.st_dev == base.st_dev and proc_mount(fd, lib) == mount)
            raw = b''
            while True:
                chunk = os.pread(fd, 4097 - len(raw), len(raw))
                proof_require(type(chunk) is bytes and len(raw) + len(chunk) <= 4096)
                if not chunk:
                    break
                raw += chunk
            return raw.decode('ascii')
        finally:
            os.close(fd)
    finally:
        os.close(root)


def identity_maps():
    for name in ('uid_map', 'gid_map'):
        proof_require([row.split() for row in proc_text(name).splitlines()]
                      == [['0', '0', '4294967295']])


def own_namespaces():
    pairs = {}
    for name, kind in NS_TYPES.items():
        fd = os.open('/proc/self/ns/' + name, os.O_RDONLY | os.O_CLOEXEC)
        try:
            info = os.fstat(fd)
            proof_require(fcntl.ioctl(fd, 0xb703) == kind)  # NS_GET_NSTYPE
            pairs[name] = [info.st_dev, info.st_ino]
        finally:
            os.close(fd)
    return pairs


def proof_descriptor():
    info = os.fstat(3)
    proof_require(stat.S_ISREG(info.st_mode) and stat.S_IMODE(info.st_mode) == 0o400
                  and info.st_uid == info.st_gid == 0 and info.st_nlink == 0
                  and 0 < info.st_size <= 4096)
    proof_require(fcntl.fcntl(3, fcntl.F_GETFL) & os.O_ACCMODE == os.O_RDONLY)
    proof_require(fcntl.fcntl(3, fcntl.F_GET_SEALS) == PROOF_SEALS)
    proof_require(os.readlink('/proc/self/fd/3') == '/memfd:linuxcast-f102-namespace (deleted)')
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid, info.st_nlink, info.st_size)


def consume_attestation():
    """FD3 is consumed even for invalid proof; closure precedes any stage work."""
    try:
        try:
            os.set_inheritable(3, False)
            identity_maps()  # root ownership alone is spoofable inside a userns
            before = proof_descriptor()
            raw = b''
            while len(raw) < before[-1]:
                part = os.pread(3, before[-1] - len(raw), len(raw))
                proof_require(type(part) is bytes and 0 < len(part) <= before[-1] - len(raw))
                raw += part
            proof_require(os.pread(3, 1, len(raw)) == b'' and proof_descriptor() == before)

            def unique(items):
                value = {}
                for key, item in items:
                    proof_require(key not in value)
                    value[key] = item
                return value

            value = json.loads(raw, object_pairs_hook=unique)
            proof_require(type(value) is dict and set(value) == {'schema', 'initial', 'isolated', 'subject'}
                          and value['schema'] == 'f102-namespace-v1')
            for field in ('initial', 'isolated'):
                proof_require(type(value[field]) is dict and set(value[field]) == set(NS_TYPES))
                for pair in value[field].values():
                    proof_require(type(pair) is list and len(pair) == 2
                                  and all(type(n) is int and 0 < n < 2 ** 64 for n in pair))
            for name in NS_TYPES:
                proof_require((value['initial'][name] == value['isolated'][name]) is (name in ('pid', 'user')))
            subject = value['subject']
            proof_require(type(subject) is dict and set(subject) == {'pid', 'startTicks'}
                          and type(subject['pid']) is int and 0 < subject['pid'] < 2 ** 31
                          and type(subject['startTicks']) is int and 0 < subject['startTicks'] < 2 ** 64)
            process = proc_text('stat')
            pid, tail = process.split(' (', 1)
            proof_require(subject == {'pid': os.getpid(), 'startTicks': int(tail.rsplit(')', 1)[1].split()[19])}
                          and int(pid) == os.getpid())
            proof_require(own_namespaces() == value['isolated'])
            identity_maps()
            proof_require(proof_descriptor() == before)
        finally:
            os.close(3)  # including malformed/absent proof and failed close-on-exec
    except BaseException:
        raise ControllerRejected('prerequisite') from None


def receipt_digest(*args, **kwargs):
    from product_staging import receipt_digest as digest
    return digest(*args, **kwargs)


def validate(*args, **kwargs):
    from product_staging import validate as validate_stage
    return validate_stage(*args, **kwargs)


def preflight(staging, node, total):
    consume_attestation()
    # The network namespace is prepared by the reviewed lab wrapper. Refuse to
    # create it here or to run on the normal guest/host network as a fallback.
    release = platform.freedesktop_os_release()
    if (release.get("ID") != "debian" or release.get("VERSION_ID") != "13" or platform.machine() != "x86_64"
            or os.getresuid() != (20000,) * 3 or os.getresgid() != (20000,) * 3 or os.getgroups()
            or set(p.name for p in Path("/sys/class/net").iterdir()) != {"lo"}
            or Path("/dev/input").exists() or Path("/dev/snd").exists() or Path("/dev/uinput").exists()):
        raise ControllerRejected("prerequisite")
    status = dict(line.split(':', 1) for line in Path('/proc/self/status').read_text().splitlines() if ':' in line)
    if (any(int(status[key].strip(), 16) != 0 for key in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb'))
            or status['NoNewPrivs'].strip() != '1'):
        raise ControllerRejected('prerequisite')
    if HERE != staging / "apps/desktop/tests/at":
        raise ControllerRejected("prerequisite")
    expected = {"native_at.py": "43621e33f07e165ad29a17bc2e23860ecafeb8f40a5537f201413aadb9600d5b",
                "observations.py": "93e618b4cd2d9a0405c75f7b9ab4779707a6eb1194a5889978b32694dcdc29c6"}
    if any(hashlib.sha256((HERE / name).read_bytes()).hexdigest() != digest for name, digest in expected.items()):
        raise ControllerRejected("prerequisite")
    base = Path("/usr/lib/python3/dist-packages/orca")
    if any(hashlib.sha256((base / name).read_bytes()).hexdigest() != digest for name, digest in ORCA_HASHES.items()):
        raise ControllerRejected("prerequisite")
    receipt_pin = receipt_digest(staging, total)
    validate(staging, node, total, receipt_sha256=receipt_pin)
    return receipt_pin


def wait(owner, deadline, predicate):
    while True:
        deadline.remaining()
        if not owner.alive():
            raise ControllerRejected("child")
        if predicate():
            return
        time.sleep(min(0.02, deadline.remaining()))


def catalogue(owner):
    owner.directory("data/applications")
    entries = [("result", "Public AT result"), ("alternate", "Public AT result alternate")]
    entries += [(f"filler-{index:03}", f"Public AT filler {index:03}") for index in range(120)]
    for identity, title in entries:
        # No Comment: canonical complete accessible name uses Installed application.
        # GLib requires an installed executable to index the catalogue. No root
        # result is ever invoked; Enter is guarded inside actions/form only.
        owner.write(f"data/applications/{identity}.desktop",
                    f"[Desktop Entry]\nType=Application\nName={title}\nExec=/usr/bin/false\n")


def launch_reader(owner, arguments, report):
    def started(_child):
        # Popen succeeded even if later identity registration fails.
        report.native_runs = 1
    return owner.spawn(arguments, on_started=started)


def infrastructure(owner, total, display, report):
    ready = Deadline(10, total)
    runtime = owner.root / "runtime"
    owner.env.update(DISPLAY=f":{display}", XAUTHORITY=str(runtime / "Xauthority"))
    external = [Path(f"/tmp/.X{display}-lock"), Path(f"/tmp/.X11-unix/X{display}")]
    if any(p.exists() or p.is_symlink() for p in external):
        raise ControllerRejected("prerequisite")
    owner.external = external
    owner.write("runtime/Xauthority", "")
    owner.run(["/usr/bin/xauth", "-f", owner.env["XAUTHORITY"], "add", owner.env["DISPLAY"],
               "MIT-MAGIC-COOKIE-1", os.urandom(16).hex()], ready)
    xvfb = owner.spawn(["/usr/bin/Xvfb", owner.env["DISPLAY"], "-screen", "0", "1280x900x24", "-dpi", "96",
                        "-nolisten", "tcp", "-auth", owner.env["XAUTHORITY"], "-noreset"])
    owner.env["LINUXCAST_F102_XVFB_PID"] = str(xvfb.pid)
    wait(owner, ready, lambda: socket_ready(external[1]) and external[0].is_file())
    owner.bind_x_server_paths(xvfb, *external)
    owner.directory("services")
    for kind, name in (("session", "session-bus"), ("accessibility", "at-bus")):
        path = owner.write(f"{name}.conf", f'<busconfig><type>{kind}</type><listen>unix:path={runtime}/{name}</listen>'
                           f'<auth>EXTERNAL</auth><servicedir>{owner.root}/services</servicedir>'
                           '<policy context="default"><allow send_destination="*"/><allow receive_sender="*"/>'
                           '<allow own="*"/></policy></busconfig>')
        owner.spawn(["/usr/bin/dbus-daemon", "--nofork", "--config-file", str(path)])
        wait(owner, ready, lambda: socket_ready(runtime / name))
    owner.spawn(["/usr/libexec/at-spi2-registryd"])
    discovery = Channel(owner.spawn(["/usr/bin/python3", "-B", str(HERE / "private_discovery.py")], protocol=True))
    if decode(discovery.line(ready)) != {"status": "ready"}:
        raise ControllerRejected("protocol")
    owner.run(["/usr/bin/dbus-send", "--bus=" + owner.env["AT_SPI_BUS_ADDRESS"], "--print-reply", "--reply-timeout=1000",
               "--dest=org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus.GetNameOwner",
               "string:org.a11y.atspi.Registry"], ready)
    owner.directory("speech")
    owner.directory("orca")
    owner.directory("profile")
    owner.write("speech/speechd.conf", 'AddModule "dummy" "sd_dummy" ""\nDefaultModule dummy\nDisableAutoSpawn\n'
                'LogLevel 0\nAudioOutputMethod "alsa"\nAudioALSADevice "null"\n')
    owner.env["SPEECHD_ADDRESS"] = f"unix_socket:{runtime}/speech.sock"
    owner.spawn(["/usr/bin/speech-dispatcher", "--run-single", "--config-dir", str(owner.root / "speech"),
                 "--communication-method", "unix_socket", "--socket-path", str(runtime / "speech.sock"),
                 "--pid-file", str(runtime / "speech.pid"), "--timeout", "60", "--module-dir",
                 "/usr/lib/speech-dispatcher-modules", "--log-dir", str(owner.root / "speech")])
    wait(owner, ready, lambda: socket_ready(runtime / "speech.sock"))
    version = Channel(owner.spawn(["/usr/bin/orca", "--version"], protocol=True, required=False))
    if version.line(ready).strip() != b"48.1":
        raise ControllerRejected("prerequisite")
    try:
        version.child.wait(timeout=ready.remaining())
    except subprocess.TimeoutExpired:
        raise ControllerRejected("deadline") from None
    if version.child.returncode != 0:
        raise ControllerRejected("child")
    # Known fresh settings; no first-use profile copied from an existing reader.
    owner.write("orca/user-settings.conf", json.dumps({"general": {"enableSpeech": True, "enableBraille": False,
        "enableKeyEcho": False, "enableEchoByCharacter": False, "enableEchoByWord": False,
        "enableEchoBySentence": False, "startingProfile": ["Default", "default"]},
        "profiles": {"default": {"profile": ["Default", "default"]}}, "keybindings": {}, "pronunciations": {}}))
    log = owner.write("orca.log", "")
    reader = launch_reader(owner, ["/usr/bin/orca", "--user-prefs", str(owner.root / "orca"), "--enable", "speech",
                                   "--disable", "braille", "--debug-file", str(log)], report)
    def startup():
        if log.stat().st_size > 8 * 1024 * 1024:
            raise ControllerRejected("orca")
        data = log.read_bytes()
        return b"ORCA: Startup complete" in data or b"ORCA: Starting Atspi main event loop" in data
    wait(owner, Deadline(10, total), startup)
    catalogue(owner)
    return reader, log


def visible(native, identifier, kind, **states):
    candidates = [c for c in native["controls"] if c["id"] == identifier and c["kind"] == kind]
    return len(candidates) == 1 and all(candidates[0][key] is value for key, value in
                                      {"showing": True, "visible": True, **states}.items())


def sequence(owner, total, staging, node, reader, log, report):
    # Dependency imported only here. Offline pure checks do not need GI/observer.
    from observations import checkpoint
    driver = Channel(owner.spawn([str(node), str(HERE / "product_driver.ts"), str(staging)], cwd=staging, protocol=True))
    if decode(driver.line(Deadline(10, total))) != {"status": "ready"}:
        raise ControllerRejected("protocol")

    def drive(command, deadline):
        driver.send(command)
        response = decode(driver.line(deadline))
        if (type(response) is not dict or set(response) != {"status", "operation", "geometry"}
                or response["status"] != "ok" or response["operation"] is not True
                or type(response["geometry"]) is not bool):
            raise ControllerRejected("product")
        return response

    deadline = Deadline(10, total)
    driver.send("attest")
    attested = decode(driver.line(deadline))
    if (type(attested) is not dict or set(attested) != {"status", "pid", "windowId", "secure"}
            or attested["status"] != "attested" or attested["secure"] is not True
            or any(type(attested[k]) is not int or not 0 < attested[k] < 2 ** 32 for k in ("pid", "windowId"))):
        raise ControllerRejected("product")
    owner.refresh()
    if attested["pid"] not in owner.handles:
        raise ControllerRejected("product")
    observer = Channel(owner.spawn(["/usr/bin/python3", "-B", str(HERE / "native_at.py"),
                                    str(attested["pid"]), str(reader.pid)], protocol=True))
    if decode(observer.line(deadline)) != {"status": "ready", "nativeRun": True}:
        raise ControllerRejected("native")
    previous = 0

    def inspect(bound):
        nonlocal previous
        observer.send("inspect")
        value = snapshot(decode(observer.line(bound)), previous)
        previous = value["sequence"]
        return value

    owner.run(["/usr/bin/xdotool", "windowfocus", "--sync", str(attested["windowId"])], deadline)
    drive("anchor", deadline)
    wait(owner, deadline, lambda: visible(inspect(deadline), "search", "listbox", focused=True))
    for step in STEPS:
        report.failed_step = step if report.failure == "none" else report.failed_step
        pending = report.begin(step)
        deadline = Deadline(10, total)  # Saved once; never extended by a poll.
        # Typing is preparation; the presentation offset is taken immediately
        # before the single transition under test, excluding typed-key echoes.
        if step == "result":
            drive("query", deadline)
        if step == "final":
            drive("final-query", deadline)
        if step == "form":
            drive("filter-action", deadline)
        before_native = inspect(deadline)
        if step == "final" and not visible(before_native, "search", "listbox", focused=True):
            raise ControllerRejected("native")
        if step == "form" and not (visible(before_native, "action-search", "entry", focused=True)
                                    and visible(before_native, "actions-dialog", "dialog")
                                    and visible(before_native, "edit-alias", "button")):
            raise ControllerRejected("native")
        if step == "restore" and not visible(before_native, "cancel", "button", focused=True):
            raise ControllerRejected("native")
        before = before_native["sequence"]
        speech = FreshOutput(log)
        if step in TARGETS:
            speech.arm(TARGETS[step][0])
        response = drive(step, deadline)
        flags = {"native": False, "freshEvent": False, "generated": False, "attempt": False, "completion": False,
                 "geometry": response["geometry"], "operation": True}
        pending.update(flags)
        if step != "hide" and not flags["geometry"]:
            raise ControllerRejected("product")

        def observed():
            native = inspect(deadline)
            if step in TARGETS:
                identity, kind = TARGETS[step]
                native_ok = any(checkpoint(native, identity, kind, before, event)
                                for event in (("selection", "active-descendant") if kind == "option" else ("focus",)))
                parsed = speech.observe()
                flags.update(freshEvent=native_ok, generated=parsed["generated"], attempt=parsed["attempt"])
                if step == "actions":
                    native_ok = native_ok and visible(native, "actions-dialog", "dialog")
                if step == "error":
                    native_ok = native_ok and visible(native, "error-heading", "heading")
                flags["native"] = native_ok
                pending.update(flags)
                return native_ok and parsed["generated"] and parsed["attempt"] and parsed["completeLines"]
            if step == "loading":
                flags["native"] = visible(native, "application-heading", "heading") and visible(native, "loading", "status")
            else:  # Hide: absence of every showing control, main still owned.
                flags["native"] = not any(c["showing"] for c in native["controls"])
            pending.update(flags)
            return flags["native"]

        wait(owner, deadline, observed)
        report.add(step, flags)


def run(staging, node, destination, display):
    report = Report()
    owner = None
    proof_pending = True
    try:
        total = Deadline(240)
        proof_pending = False  # preflight now owns consumption on every exit
        receipt_pin = preflight(staging, node, total)
        owner = SessionOwner()
        reader, log = infrastructure(owner, total, display, report)
        sequence(owner, total, staging, node, reader, log, report)
        # Detect any modification to immutable product inputs during the run.
        validate(staging, node, total, receipt_sha256=receipt_pin)
    except OutputRejected:
        report.fail("orca", report.failed_step)
    except ControllerRejected as error:
        report.fail(str(error) if str(error) in FAILURES - {"none"} else "protocol", report.failed_step)
    except BaseException:
        report.fail("prerequisite", report.failed_step)
    finally:
        if proof_pending:
            try:
                os.close(3)  # even an early clock/deadline-construction fault
            except OSError:
                report.fail('prerequisite', report.failed_step)
        signal.setitimer(signal.ITIMER_REAL, 0)
        # A second termination signal cannot interrupt verification halfway.
        for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            signal.signal(sig, signal.SIG_IGN)
        def cleanup_deadline(*_):
            raise ControllerRejected("cleanup")
        signal.signal(signal.SIGALRM, cleanup_deadline)
        signal.setitimer(signal.ITIMER_REAL, 6)
        try:
            report.cleaned = owner.cleanup() if owner else True
        except BaseException:
            report.cleaned = False
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
        if not report.cleaned:
            report.fail("cleanup", report.failed_step)
    publish(destination, report.public())
    return 0 if report.public()["status"] == "observed-private-sequence" else 3


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reviewed-controller", action="store_true", required=True)
    parser.add_argument("--staging", type=Path, required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--new-evidence", type=Path, required=True)
    parser.add_argument("--display", type=int, default=193)
    try:
        args = parser.parse_args()
        if not 100 <= args.display <= 99999:
            raise ControllerRejected('prerequisite')
        staging, node = args.staging.resolve(), args.node.resolve()
        for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            signal.signal(sig, lambda *_: (_ for _ in ()).throw(ControllerRejected("child")))
        signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(ControllerRejected("deadline")))
        signal.setitimer(signal.ITIMER_REAL, 240)
    except BaseException:
        try:
            os.close(3)
        except OSError:
            pass  # failure still returns3; never retry an ambiguously closed fd
        return 3
    try:
        result = run(staging, node, args.new_evidence, args.display)
    except BaseException:
        print("Controller incomplete: private publication or cleanup unavailable. Review the protocol prerequisites.")
        return 3
    print("Private sequence observed; acceptance remains pending." if result == 0 else
          "Controller incomplete. Review the fixed firstFailure in the new report and the protocol prerequisites.")
    return result


if __name__ == "__main__":
    raise SystemExit(main())
