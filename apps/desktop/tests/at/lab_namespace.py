"""Guest-only F1-02 preparation. Inert on import; REVIEW BEFORE REAL INVOCATION.

Not a production service, generic command runner, native proof or outer lab owner.
The CLI has no path/command/UID overrides. Root must provision the exact sealed
permit/layout described in lab-wrapper-preparation/README.md. Tests inject only
synthetic adapters; the CLI always constructs the real adapter.
"""
import argparse
import ctypes
import fcntl
import errno
import hashlib
import json
import os
from pathlib import Path
import platform
import resource
import selectors
import signal
import stat
import time
from dataclasses import dataclass

APPROVED_TREE = "265bfc3b57a2cbd580456ce8004eb00c4cc6434d"  # cd7bf0e5, NOT coordinator F2 HEAD
BASE = Path("/opt/linuxcast-f102-lab")
STAGING = BASE / "staging"
NODE = BASE / "node/bin/node"
PERMIT = Path("/etc/linuxcast-f102-lab/permit.json")
INSTALLED = Path("/usr/local/libexec/linuxcast-f102-lab/lab_namespace.py")
UID = GID = 20000
ENV = {"PATH": "/usr/bin:/bin", "LANG": "en_US.UTF-8", "LC_ALL": "en_US.UTF-8",
       "HOME": "/home/at", "TMPDIR": "/tmp", "XDG_RUNTIME_DIR": "/run",
       "DBUS_SYSTEM_BUS_ADDRESS": "unix:path=/run/no-system-bus"}
# Fixed CLI copied from product_controller.main; isolated Python admits only
# its pinned sibling module directory. Absolute staging/link placement survives
# unchanged across the namespace boundary.
CONTROLLER = str(STAGING / "apps/desktop/tests/at/product_controller.py")
BOOTSTRAP = ("import runpy,sys;sys.path.insert(0," + repr(str(STAGING / "apps/desktop/tests/at")) + ");"
             "sys.argv=" + repr([CONTROLLER, '--reviewed-controller', '--staging', str(STAGING),
                                 '--node', str(NODE), '--new-evidence', '/output/controller', '--display', '193']) + ";"
             "runpy.run_path(sys.argv[0],run_name='__main__')")
CONTROLLER_ARGV = ("/usr/bin/python3", "-I", "-B", "-c", BOOTSTRAP)
# Linux amd64 constants, checked against linux/{sched,mount}.h and mount(2).
NEWNS, NEWUTS, NEWIPC, NEWNET = 0x20000, 0x4000000, 0x8000000, 0x40000000
RDONLY, NOSUID, NODEV, NOEXEC = 1, 2, 4, 8
REMOUNT, BIND, REC, PRIVATE = 32, 4096, 16384, 1 << 18
SAFE = NOSUID | NODEV | NOEXEC
RO = RDONLY | NOSUID | NODEV
STEPS = ("preflight", "reserve", "cgroup", "start", "admit", "release", "wait", "report")
SETUP = ("unshare", "private", "root", "layout", "binds", "proc", "sys", "devices",
         "writable", "loopback", "seal", "chroot", "drop", "verify", "exec")
REASONS = {"none", "prerequisite", "setup", "deadline", "controller", "cleanup", "interrupted"}


class Rejected(Exception):
    """Fixed failure category; never print underlying exception data."""


def require(condition):
    if not condition:
        raise Rejected("prerequisite")


def unique_json(raw, maximum=65536):
    def pairs(items):
        value = {}
        for key, item in items:
            require(key not in value)
            value[key] = item
        return value
    require(type(raw) is bytes and len(raw) <= maximum)
    return json.loads(raw, object_pairs_hook=pairs)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def validate_permit(value, facts):
    keys = {"schema", "machineIdSha256", "productUuidSha256", "sourceTree", "archiveSha256",
            "receiptSha256", "nodeSha256", "wrapperSha256"}
    require(type(value) is dict and set(value) == keys and type(value["schema"]) is int and value["schema"] == 1)
    require(value["sourceTree"] == APPROVED_TREE)
    for key in keys - {"schema", "sourceTree"}:
        require(type(value[key]) is str and len(value[key]) == 64 and all(c in "0123456789abcdef" for c in value[key]))
    require(facts["os"] == ("debian", "13", "x86_64") and facts["uids"] == (0, 0, 0))
    require(facts["gids"] == (0, 0, 0) and facts["dedicatedUidIdle"] is True)
    require(facts["vendor"] == "QEMU" and facts["product"].startswith("Standard PC ("))
    require(facts["sameInitialNamespaces"] is True)
    require(value["machineIdSha256"] == sha(facts["machineId"]) and value["productUuidSha256"] == sha(facts["productUuid"]))
    return value


def identity(info):
    return info.st_dev, info.st_ino, stat.S_IFMT(info.st_mode), info.st_uid, info.st_gid


def check_info(info, uid, *, directory=False, immutable=True, single=False):
    require((stat.S_ISDIR if directory else stat.S_ISREG)(info.st_mode) and info.st_uid == uid)
    require(not info.st_mode & (stat.S_ISUID | stat.S_ISGID | 0o022))
    if immutable:
        require(not info.st_mode & 0o222)
    if single:
        require(info.st_nlink == 1)


def open_chain(path, *, uid=0, directory=False, immutable=False):
    """No-follow descriptor walk. Ancestors must be root-owned, non-writable by others.

    Leaf may belong to the dedicated UID; its root-owned parent prevents rename.
    Nothing here chmods, unlinks or follows a preexisting symlink.
    """
    path = Path(path)
    require(path.is_absolute() and '..' not in path.parts and str(path) == os.path.normpath(str(path)))
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        for index, name in enumerate(path.parts[1:]):
            leaf = index == len(path.parts) - 2
            check_info(os.fstat(fd), 0, directory=True, immutable=False)
            flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK
            if not leaf or directory:
                flags |= os.O_DIRECTORY
            new = os.open(name, flags, dir_fd=fd)
            os.close(fd)
            fd = new
        check_info(os.fstat(fd), uid, directory=directory, immutable=immutable, single=not directory)
        return fd
    except BaseException:
        os.close(fd)
        raise


def read_fd(fd, maximum=65536):
    require(os.fstat(fd).st_size <= maximum)
    data = os.pread(fd, maximum + 1, 0)
    require(len(data) <= maximum)
    return data


def validate_node_header(header, info):
    check_info(info, 0, immutable=True, single=True)
    require(info.st_mode & 0o005 == 0o005 and len(header) == 64 and header[:6] == b'\x7fELF\x02\x01'
            and int.from_bytes(header[18:20], 'little') == 62)  # ELF64 little-endian AMD64


def file_hash(path):
    fd = open_chain(path, immutable=True)
    try:
        result = hashlib.sha256()
        while chunk := os.read(fd, 1024 * 1024):
            result.update(chunk)
        return result.hexdigest()
    finally:
        os.close(fd)


def remove_tree_at(parent, name, expected, owner, budget=None, depth=0):
    """Descriptor-only removal of this invocation's private output, after death.

    Unknown owner/type/replacement or excessive content is preserved as a cleanup
    failure. Never follows a symlink or changes permissions. Compatible with the
    offline host's Python3.10 as well as Debian13's Python3.13.
    """
    budget = [512] if budget is None else budget
    require(depth <= 8 and budget[0] > 0)
    info = os.stat(name, dir_fd=parent, follow_symlinks=False)
    require(identity(info) == expected and info.st_uid == owner)
    if not stat.S_ISDIR(info.st_mode):
        require(stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode))
        os.unlink(name, dir_fd=parent)
        budget[0] -= 1
        return
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
    try:
        require(identity(os.fstat(fd)) == expected)
        for child in os.listdir(fd):
            entry = os.stat(child, dir_fd=fd, follow_symlinks=False)
            remove_tree_at(fd, child, identity(entry), owner, budget, depth + 1)
        require(identity(os.stat(name, dir_fd=parent, follow_symlinks=False)) == expected)
        os.rmdir(name, dir_fd=parent)
        budget[0] -= 1
    finally:
        os.close(fd)


def close_inherited():
    for name in os.listdir('/proc/self/fd'):
        if name.isdecimal() and int(name) > 2:
            try:
                os.close(int(name))
            except OSError as error:
                if error.errno != errno.EBADF:
                    raise  # only listdir's already-closed enumeration fd may vanish


def staged_file(rootfd, relative, maximum):
    require(type(relative) is str and relative and not relative.startswith('/')
            and all(p not in ('', '.', '..') for p in relative.split('/')))
    fd = os.dup(rootfd)
    try:
        parts = relative.split('/')
        for index, part in enumerate(parts):
            flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC
            directory = index != len(parts) - 1
            if directory:
                flags |= os.O_DIRECTORY
            new = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = new
            check_info(os.fstat(fd), UID, directory=directory, immutable=True, single=not directory)
        return read_fd(fd, maximum)
    finally:
        os.close(fd)


def pinned_infrastructure(stagefd, pin):
    # Before ANY staging import, bind trusted infrastructure bytes to the
    # externally retained receipt pin. The controller still validates everything
    # as nonroot before/after its sequence. No root import or execution of stage.
    raw = staged_file(stagefd, 'f102-build-receipt.json', 16 * 1024 * 1024)
    require(sha(raw) == pin['receiptSha256'])
    receipt = unique_json(raw, 16 * 1024 * 1024)
    require(set(receipt) == {'schema', 'sourceTree', 'archiveSha256', 'nodeSha256', 'files'}
            and type(receipt['schema']) is int and receipt['schema'] == 1
            and receipt['sourceTree'] == APPROVED_TREE and receipt['archiveSha256'] == pin['archiveSha256']
            and receipt['nodeSha256'] == pin['nodeSha256'] and type(receipt['files']) is dict)
    for name in ('product_staging.py', 'controller_protocol.py', 'session_owner.py', 'product_controller.py'):
        relative = 'apps/desktop/tests/at/' + name
        require(sha(staged_file(stagefd, relative, 1024 * 1024)) == receipt['files'].get(relative))


def project_report(value, code):
    # Root parses data only; it never imports staged modules. No raw field is
    # forwarded. This independently closes the envelope used for the projection.
    keys = {'schema', 'status', 'firstFailure', 'failedStep', 'steps', 'pending', 'cleanup',
            'injectedStates', 'mediaEmulated', 'audible', 'completionValidated', 'nativeRuns'}
    steps = ('search', 'result', 'away', 'back', 'final', 'actions', 'form', 'save', 'cancel',
             'restore', 'hide', 'reopen', 'loading', 'error', 'recovery')
    failures = {'none', 'prerequisite', 'deadline', 'child', 'protocol', 'native', 'orca', 'product', 'cleanup'}
    flags = {'native', 'freshEvent', 'generated', 'attempt', 'completion', 'geometry', 'operation'}
    require(type(value) is dict and set(value) == keys and value['schema'] == 'f102-native-controller-v2')
    require(value['status'] in {'incomplete', 'observed-private-sequence'} and value['firstFailure'] in failures
            and value['failedStep'] in (*steps, 'setup', 'none'))
    require(type(value['cleanup']) is bool and value['injectedStates'] is True and value['mediaEmulated'] is False
            and value['audible'] is False and value['completionValidated'] is False
            and type(value['nativeRuns']) is int and value['nativeRuns'] in (0, 1))
    require(type(value['steps']) is list and len(value['steps']) <= len(steps))
    for index, item in enumerate(value['steps']):
        require(type(item) is dict and set(item) == {'id', *flags} and item['id'] == steps[index]
                and all(type(item[k]) is bool for k in flags))
        speech = item['id'] not in ('hide', 'loading')
        require(item['native'] and item['operation'] and not item['completion']
                and item['geometry'] is (item['id'] != 'hide')
                and all(item[k] is speech for k in ('freshEvent', 'generated', 'attempt')))
    pending = value['pending']
    if pending is not None:
        require(type(pending) is dict and set(pending) == {'id', *flags}
                and len(value['steps']) < len(steps) and pending['id'] == steps[len(value['steps'])]
                and all(type(pending[k]) is bool for k in flags) and not pending['completion']
                and pending['id'] == value['failedStep'] and value['firstFailure'] != 'none')
    if value['status'] == 'observed-private-sequence':
        require(code == 0 and value['cleanup'] and value['firstFailure'] == 'none'
                and value['failedStep'] == 'none' and pending is None and value['nativeRuns'] == 1
                and len(value['steps']) == len(steps))
    else:
        require(code == 3)
    return {key: value[key] for key in ('status', 'firstFailure', 'failedStep', 'cleanup')}


@dataclass(frozen=True)
class Mount:
    target: str
    source: str
    kind: str
    flags: int
    options: str = ""


def mount_plan():
    """No host /sys or /proc bind, no recursive source bind, no PID namespace."""
    return (
        Mount("/usr", "/usr", "bind", RO),
        Mount("/etc/os-release", "/usr/lib/os-release", "bind", RO | NOEXEC),
        Mount("/etc/fonts", "/etc/fonts", "bind", RO | NOEXEC),
        Mount(str(STAGING), str(STAGING), "bind", RO),
        Mount(str(BASE / "node"), str(BASE / "node"), "bind", RO),
        Mount("/proc", "proc", "proc", RDONLY | SAFE),
        Mount("/sys", "sysfs", "sysfs", RDONLY | SAFE),
        *(Mount("/dev/" + name, "/dev/" + name, "bind", RDONLY | NOSUID | NOEXEC)
          for name in ("null", "zero", "random", "urandom")),
        *(Mount(name, "tmpfs", "tmpfs", SAFE, f"mode=0700,uid={UID},gid={GID},size={size},nr_inodes=16384")
          for name, size in (("/tmp", "512m"), ("/run", "16m"), ("/home/at", "16m"), ("/dev/shm", "256m"))),
        Mount("/output", "OUTPUT", "bind", SAFE),
    )


def transact(adapter):
    """All setup faults enter cleanup, including partial acquisition faults."""
    result = {"schema": "f102-lab-wrapper-v1", "firstFailure": "none", "failedStep": "none",
              "cleanup": False, "controllerMayHaveRun": False, "controllerStatus": "unavailable",
              "controllerFirstFailure": "unavailable", "controllerFailedStep": "unavailable", "controllerCleanup": None,
              "outerLabCleanup": "outstanding", "acceptance": "pending"}
    try:
        for step in STEPS:
            if step == "release":
                # Conservative, even if exec never happens. Not a native-run count.
                result["controllerMayHaveRun"] = True
            value = getattr(adapter, step)()
            if step == "report":
                # Adapter.report returns only project_report's validated fields.
                result.update(controllerStatus=value['status'], controllerFirstFailure=value['firstFailure'],
                              controllerFailedStep=value['failedStep'], controllerCleanup=value['cleanup'])
                if value['status'] == 'incomplete':
                    raise Rejected('controller')
    except BaseException as error:
        reason = str(error) if isinstance(error, Rejected) and str(error) in REASONS - {"none"} else "setup"
        result.update(firstFailure=reason, failedStep=step)
    finally:
        try:
            result["cleanup"] = adapter.cleanup() is True
        except BaseException:
            result["cleanup"] = False
        if not result["cleanup"] and result["firstFailure"] == "none":
            result.update(firstFailure="cleanup", failedStep="cleanup")
    return result


class Kernel:
    """Real syscalls. Instantiated only after explicit CLI review acknowledgements."""
    def __init__(self):
        self.lib = ctypes.CDLL(None, use_errno=True)

    def call(self, name, *args):
        if getattr(self.lib, name)(*args) != 0:
            raise Rejected("setup")

    def mount(self, source, target, kind, flags, options=""):
        def encoded(value):
            return value.encode() if value else None
        self.call("mount", encoded(source), encoded(str(target)), encoded(kind), ctypes.c_ulong(flags), encoded(options))

    def filesystem_type(self, fd):
        buffer = ctypes.create_string_buffer(256)  # larger than amd64 struct statfs
        self.call('fstatfs', fd, ctypes.byref(buffer))
        return ctypes.c_long.from_buffer(buffer).value

    def prctl(self, option, value):
        self.call("prctl", option, ctypes.c_ulong(value), 0, 0, 0)


class Guest:
    def __init__(self):
        self.fds = []
        self.rootfd = self.cgfd = self.basefd = self.cgbase = self.outfd = None
        self.root_name = self.cg_name = None
        self.root_identity = self.cg_identity = None
        self.pid = self.pidfd = self.gate = None
        self.parent_pid = os.getpid()
        self.reaped = False
        self.code = None
        self.pin = None
        self.out_identity = None
        self.kernel = None

    def keep(self, fd):
        self.fds.append(fd)
        return fd

    def preflight(self):
        # Do not inspect unrelated user homes, SSH identities or guest endpoints.
        import sys
        require(sys.flags.isolated == 1 and Path(__file__).absolute() == INSTALLED)
        self.keep(open_chain(INSTALLED, immutable=True))
        permitfd = self.keep(open_chain(PERMIT, immutable=True))
        fcntl.flock(permitfd, fcntl.LOCK_EX | fcntl.LOCK_NB)  # serialize this exact permit
        self.pin = unique_json(read_fd(permitfd))
        release = platform.freedesktop_os_release()
        idle = True
        for entry in Path("/proc").iterdir():
            if entry.name.isdecimal():
                try:
                    lines = (entry / "status").read_text().splitlines()
                except FileNotFoundError:
                    continue  # only confirmed disappearance
                uids = next(line.split()[1:] for line in lines if line.startswith("Uid:"))
                if str(UID) in uids:
                    idle = False
        facts = {"os": (release.get("ID"), release.get("VERSION_ID"), platform.machine()),
                 "uids": os.getresuid(), "gids": os.getresgid(), "dedicatedUidIdle": idle,
                 "vendor": Path("/sys/class/dmi/id/sys_vendor").read_text().strip(),
                 "product": Path("/sys/class/dmi/id/product_name").read_text().strip(),
                 "machineId": Path("/etc/machine-id").read_bytes(),
                 "productUuid": Path("/sys/class/dmi/id/product_uuid").read_bytes(),
                 "sameInitialNamespaces": all(Path('/proc/self/ns/' + n).stat().st_ino == Path('/proc/1/ns/' + n).stat().st_ino
                                              for n in ('net', 'mnt', 'pid', 'user'))}
        validate_permit(self.pin, facts)
        require(file_hash(INSTALLED) == self.pin["wrapperSha256"])
        require(file_hash(NODE) == self.pin["nodeSha256"])
        nodefd = self.keep(open_chain(NODE, immutable=True))
        validate_node_header(os.pread(nodefd, 64, 0), os.fstat(nodefd))
        self.keep(open_chain('/usr/bin/python3.13'))  # Debian13 packaged interpreter
        # Parse the public local file directly; no NSS/network lookup.
        records = [line.split(':') for line in Path('/etc/passwd').read_text().splitlines()]
        require(all(len(record) == 7 for record in records))
        accounts = [record for record in records if record[2] == str(UID)]
        require(len(accounts) == 1 and accounts[0][3] == str(GID) and accounts[0][5] == '/nonexistent'
                and accounts[0][6] == '/usr/sbin/nologin')
        for name in ('/usr', str(BASE / 'node')):
            self.keep(open_chain(name, directory=True))
        self.stagefd = self.keep(open_chain(STAGING, uid=UID, directory=True, immutable=True))
        # Exactly one standalone pinned Node executable; no inherited runtime
        # tree, outside symlinks or scripts alongside it.
        require({str(p.relative_to(BASE / 'node')) for p in (BASE / 'node').rglob('*')} == {'bin', 'bin/node'})
        pinned_infrastructure(self.stagefd, self.pin)
        self.basefd = self.keep(open_chain('/run', directory=True))
        self.cgbase = self.keep(open_chain('/sys/fs/cgroup', directory=True))
        self.kernel = Kernel()
        require(self.kernel.filesystem_type(self.cgbase) == 0x63677270)  # CGROUP2_SUPER_MAGIC
        require({'memory', 'pids', 'cpu'} <= set(Path('/sys/fs/cgroup/cgroup.subtree_control').read_text().split()))
        require(Path('/sys/fs/cgroup/cgroup.controllers').is_file())
        # Validate staging as its owner, never import/execute staging code as root.
        # Full receipt validation occurs again AFTER read-only binds and UID drop.
        self.kernel.prctl(36, 1)  # subreaper before any child
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

    def reserve(self):
        self.root_name = 'linuxcast-f102-ns-' + os.urandom(16).hex()
        os.mkdir(self.root_name, 0o700, dir_fd=self.basefd)
        self.rootfd = self.keep(os.open(self.root_name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.basefd))
        self.root_identity = identity(os.fstat(self.rootfd))
        for name in ('root', 'output'):
            os.mkdir(name, 0o700, dir_fd=self.rootfd)
        self.outfd = self.keep(os.open('output', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.rootfd))
        os.fchown(self.outfd, UID, GID)  # only the directory just exclusively created
        self.out_identity = identity(os.fstat(self.outfd))

    def write_cgroup(self, name, value):
        fd = os.open(name, os.O_WRONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.cgfd)
        try:
            require(os.write(fd, value.encode()) == len(value))
        finally:
            os.close(fd)

    def cgroup(self):
        self.cg_name = self.root_name
        os.mkdir(self.cg_name, 0o700, dir_fd=self.cgbase)
        self.cgfd = self.keep(os.open(self.cg_name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.cgbase))
        self.cg_identity = identity(os.fstat(self.cgfd))
        for name, value in (('pids.max', '256'), ('memory.max', '2147483648'),
                            ('memory.swap.max', '0'), ('cpu.max', '100000 100000')):
            self.write_cgroup(name, value)

    def start(self):
        read, write = os.pipe2(os.O_CLOEXEC)
        self.gate = write
        try:
            pid = os.fork()
        except BaseException:
            os.close(read)
            raise
        if pid == 0:
            try:
                os.close(write)
                # EOF/parent loss means stop BEFORE namespace setup or any exec.
                require(os.read(read, 1) == b'G')
                os.close(read)
                close_inherited()
                os.setsid()
                null = os.open('/dev/null', os.O_RDWR | os.O_CLOEXEC)
                for fd in (0, 1, 2):
                    os.dup2(null, fd)
                if null > 2:
                    os.close(null)
                self.kernel.prctl(1, signal.SIGKILL)  # PDEATHSIG; reasserted after setuid
                require(os.getppid() == self.parent_pid)
                worker(self)
            except BaseException:
                os._exit(3)
            os._exit(3)
        self.pid = pid  # retained BEFORE fallible pidfd acquisition
        os.close(read)
        self.pidfd = os.pidfd_open(pid)

    def admit(self):
        self.write_cgroup('cgroup.procs', str(self.pid))
        fd = os.open('cgroup.procs', os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.cgfd)
        try:
            require(read_fd(fd).split() == [str(self.pid).encode()])
        finally:
            os.close(fd)

    def release(self):
        require(os.write(self.gate, b'G') == 1)
        os.close(self.gate)
        self.gate = None

    def wait(self):
        with selectors.DefaultSelector() as selector:
            selector.register(self.pidfd, selectors.EVENT_READ)
            if not selector.select(275):  # setup+240 controller+6 cleanup; never extended
                raise Rejected('deadline')
        _, status = os.waitpid(self.pid, 0)
        self.reaped = True
        self.code = os.waitstatus_to_exitcode(status)
        require(self.cgroup_empty())
        if self.code not in (0, 3):
            raise Rejected('controller')

    def report(self):
        fd = os.open('controller', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.outfd)
        try:
            check_info(os.fstat(fd), UID, directory=True, immutable=False)
            reportfd = os.open('report.json', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=fd)
            try:
                check_info(os.fstat(reportfd), UID, immutable=False, single=True)
                value = unique_json(read_fd(reportfd))
            finally:
                os.close(reportfd)
        finally:
            os.close(fd)
        return project_report(value, self.code)

    def cleanup(self):
        # Finalizers cannot handle wrapper SIGKILL/VM loss. Outer owner MUST shut
        # down/reap the reserved guest and verify its baseline even after success.
        for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            signal.signal(sig, signal.SIG_IGN)
        signal.setitimer(signal.ITIMER_REAL, 10)
        clean = True
        if self.gate is not None:
            try:
                os.close(self.gate)
            except OSError:
                clean = False
            self.gate = None
        try:
            if self.cgfd is not None:
                self.write_cgroup('cgroup.kill', '1')  # exact owned subtree; never name-wide
        except BaseException:
            clean = False
        if self.pid is not None and not self.reaped:
            try:
                # pid retained even if acquisition/admission failed; unreaped PID
                # cannot be reused. pidfd preferred whenever acquired.
                if self.pidfd is not None:
                    signal.pidfd_send_signal(self.pidfd, signal.SIGKILL)
                else:
                    os.kill(self.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            except BaseException:
                clean = False
        end = time.monotonic() + 8
        verified = False
        while True:
            try:
                if self.pid is None:
                    verified = self.cgfd is None or self.cgroup_empty()
                    break
                # Reap direct and adopted children in this dedicated wrapper only.
                no_children = False
                while True:
                    try:
                        pid, _ = os.waitpid(-1, os.WNOHANG)
                        if pid == 0:
                            break
                    except ChildProcessError:
                        no_children = True
                        break
                empty = self.cgfd is None or self.cgroup_empty()
                verified = no_children and empty
                if verified:
                    break
            except BaseException:
                clean = False
                break  # unknown is never absence
            if time.monotonic() >= end:
                break
            time.sleep(0.01)
        try:
            if verified:
                self.remove_owned()
            else:
                clean = False  # preserve unknown resources for outer owner
        except BaseException:
            clean = False
        finally:
            for fd in (*self.fds, *((self.pidfd,) if self.pidfd is not None else ())):
                try:
                    os.close(fd)
                except OSError:
                    clean = False
        return clean and verified

    def cgroup_empty(self):
        fd = os.open('cgroup.events', os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.cgfd)
        try:
            pairs = [line.split() for line in read_fd(fd).decode('ascii').splitlines()]
            require(all(len(pair) == 2 for pair in pairs))
            fields = dict(pairs)
            require(len(fields) == len(pairs) and set(fields) <= {'populated', 'frozen'}
                    and fields.get('populated') in {'0', '1'} and all(v in {'0', '1'} for v in fields.values()))
            return fields['populated'] == '0'
        finally:
            os.close(fd)

    def remove_owned(self):
        # No chmod/rmtree on staging, Node, permit, or any preexisting path.
        # All descendants are confirmed dead before descriptor-relative deletion.
        if self.cg_name is not None:
            require(self.cg_identity is not None and identity(os.stat(self.cg_name, dir_fd=self.cgbase, follow_symlinks=False)) == self.cg_identity)
            os.rmdir(self.cg_name, dir_fd=self.cgbase)
        if self.root_name is not None:
            require(self.root_identity is not None and identity(os.stat(self.root_name, dir_fd=self.basefd, follow_symlinks=False)) == self.root_identity)
            require(identity(os.stat('output', dir_fd=self.rootfd, follow_symlinks=False)) == self.out_identity)
            remove_tree_at(self.rootfd, 'output', self.out_identity, UID)
            os.rmdir('root', dir_fd=self.rootfd)  # refuses unknown mount/content
            os.rmdir(self.root_name, dir_fd=self.basefd)


def worker(guest):
    """Fixed setup steps, injectable only through Python objects in offline tests."""
    os.umask(0o022)  # only fresh namespace tmpfs layout; payload later restores077
    setup = Setup(guest)
    for step in SETUP:
        getattr(setup, step)()


class Setup:
    def __init__(self, guest):
        self.guest = guest
        self.k = guest.kernel
        self.root_path = Path('/run') / guest.root_name / 'root'

    def at(self, path):
        return self.root_path / path.lstrip('/')

    def unshare(self):
        self.k.call('unshare', NEWNS | NEWNET | NEWIPC | NEWUTS)  # deliberately NO NEWPID/NEWUSER

    def private(self):
        self.k.mount('', '/', '', PRIVATE | REC)

    def root(self):
        self.k.mount('tmpfs', self.root_path, 'tmpfs', NOSUID | NODEV, 'mode=0755,size=32m,nr_inodes=4096')

    def layout(self):
        for path in ('usr', 'opt', 'opt/linuxcast-f102-lab', 'opt/linuxcast-f102-lab/staging', 'opt/linuxcast-f102-lab/node', 'proc', 'sys', 'dev', 'dev/shm', 'tmp', 'run', 'home', 'home/at', 'output', 'etc', 'etc/fonts'):
            self.at(path).mkdir(mode=0o755)
        for name, target in (('bin', 'usr/bin'), ('sbin', 'usr/sbin'), ('lib', 'usr/lib'), ('lib64', 'usr/lib64')):
            self.at(name).symlink_to(target)
        for name in ('null', 'zero', 'random', 'urandom'):
            self.at('/dev/' + name).touch(mode=0o600, exist_ok=False)
        # Copy only public OS/font/audio-null configuration, never the real /etc.
        self.at('/etc/os-release').touch(mode=0o444, exist_ok=False)
        self.at('/etc/machine-id').write_text(os.urandom(16).hex() + '\n')
        self.at('/etc/passwd').write_text('root:x:0:0:root:/:/usr/sbin/nologin\nat:x:20000:20000:AT:/home/at:/usr/sbin/nologin\n')
        self.at('/etc/group').write_text('root:x:0:\nat:x:20000:\n')
        self.at('/etc/nsswitch.conf').write_text('passwd: files\ngroup: files\nhosts: files\n')
        self.at('/etc/hosts').write_text('127.0.0.1 localhost\n::1 localhost\n')
        self.at('/etc/asound.conf').write_text('pcm.!default { type null }\nctl.!default { type null }\n')
        for path in self.at('/etc').iterdir():
            path.chmod(0o555 if path.is_dir() else 0o444)  # only exclusively created tmpfs files

    def bind(self, source, target, flags):
        self.k.mount(str(source), target, '', BIND)
        self.k.mount('', target, '', REMOUNT | BIND | flags)

    def binds(self):
        for item in mount_plan():
            if item.kind == 'bind' and item.target in ('/usr', '/etc/os-release', '/etc/fonts', str(STAGING), str(BASE / 'node')):
                self.bind(item.source, self.at(item.target), item.flags)

    def proc(self):
        self.k.mount('proc', self.at('/proc'), 'proc', RDONLY | SAFE)

    def sys(self):
        self.k.mount('sysfs', self.at('/sys'), 'sysfs', RDONLY | SAFE)

    def devices(self):
        for item in mount_plan():
            if item.target.startswith('/dev/') and item.kind == 'bind':
                info = os.stat(item.source)
                require(stat.S_ISCHR(info.st_mode))
                self.bind(item.source, self.at(item.target), item.flags)
        self.at('/dev/fd').symlink_to('/proc/self/fd')

    def writable(self):
        for item in mount_plan():
            if item.kind == 'tmpfs':
                self.k.mount(item.source, self.at(item.target), item.kind, item.flags, item.options)
        output = Path('/run') / self.guest.root_name / 'output'
        self.bind(output, self.at('/output'), SAFE)

    def loopback(self):
        # Fixed ioctl sets only IFF_UP on lo. No ip/shell subprocess or forwarding.
        import socket
        import struct
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            request = struct.pack('16sH22x', b'lo', 0)
            current = fcntl.ioctl(sock, 0x8913, request)  # SIOCGIFFLAGS
            flags = struct.unpack('16sH22x', current)[1] | 1
            fcntl.ioctl(sock, 0x8914, struct.pack('16sH22x', b'lo', flags))  # SIOCSIFFLAGS

    def seal(self):
        self.k.mount('', self.root_path, '', REMOUNT | RDONLY | NOSUID | NODEV)

    def chroot(self):
        # No outside descriptors survive, no privilege survives the next step.
        os.chroot(self.root_path)
        os.chdir('/')

    def drop(self):
        # Empty bounding set, groups, ambient/permitted/effective caps; no setuid
        # regain. RLIMITs and cgroup limits apply to all subsequent children.
        last = int(Path('/proc/sys/kernel/cap_last_cap').read_text())
        require(0 <= last <= 63)
        for capability in range(last + 1):
            self.k.prctl(24, capability)  # PR_CAPBSET_DROP
        self.k.prctl(47, 4)  # PR_CAP_AMBIENT_CLEAR_ALL
        self.k.prctl(38, 1)  # PR_SET_NO_NEW_PRIVS
        os.setgroups([])
        os.setresgid(GID, GID, GID)
        os.setresuid(UID, UID, UID)
        self.k.prctl(4, 0)  # PR_SET_DUMPABLE
        self.k.prctl(1, signal.SIGKILL)
        require(os.getppid() == self.guest.parent_pid)
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        resource.setrlimit(resource.RLIMIT_NOFILE, (1024, 1024))
        resource.setrlimit(resource.RLIMIT_FSIZE, (32 * 1024 * 1024, 32 * 1024 * 1024))
        os.umask(0o077)

    def verify(self):
        require(os.getresuid() == (UID,) * 3 and os.getresgid() == (GID,) * 3 and not os.getgroups())
        status = dict(line.split(':', 1) for line in Path('/proc/self/status').read_text().splitlines() if ':' in line)
        require(all(int(status[key].strip(), 16) == 0 for key in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb')))
        require(status['NoNewPrivs'].strip() == '1')
        require(Path('/proc/self/ns/net').stat().st_ino != Path('/proc/1/ns/net').stat().st_ino)
        require(Path('/proc/self/ns/pid').stat().st_ino == Path('/proc/1/ns/pid').stat().st_ino)
        require({p.name for p in Path('/sys/class/net').iterdir()} == {'lo'})
        require(not any(Path(p).exists() for p in ('/dev/input', '/dev/uinput', '/dev/snd', '/run/dbus', '/tmp/.X11-unix')))
        require(int(Path('/sys/class/net/lo/flags').read_text(), 16) & 1)
        # Fixed receipt check as nonroot, isolated process; importing only pinned
        # staging infrastructure here is safe after dropping all privilege.
        import sys
        sys.path.insert(0, str(STAGING / 'apps/desktop/tests/at'))
        from product_staging import validate
        receipt = validate(STAGING, NODE, receipt_sha256=self.guest.pin['receiptSha256'])
        require(receipt['sourceTree'] == APPROVED_TREE and receipt['archiveSha256'] == self.guest.pin['archiveSha256']
                and receipt['nodeSha256'] == self.guest.pin['nodeSha256'])
        with NODE.open('rb') as stream:
            require(stream.read(4) == b'\x7fELF')

    def exec(self):
        os.execve(CONTROLLER_ARGV[0], CONTROLLER_ARGV, ENV)


class ClosedParser(argparse.ArgumentParser):
    def error(self, _message):
        self.exit(3, 'Lab wrapper incomplete: both review acknowledgements are required; overrides are unavailable.\n')


def main(argv=None):
    parser = ClosedParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--reviewed-wrapper', action='store_true', required=True)
    parser.add_argument('--reviewed-controller', action='store_true', required=True)
    parser.parse_args(argv)
    # No environment switch or test backend selectable through this CLI.
    close_inherited()
    os.environ.clear()
    os.environ.update(ENV)
    os.umask(0o077)
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, lambda *_: (_ for _ in ()).throw(Rejected('interrupted')))
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(Rejected('deadline')))
    signal.setitimer(signal.ITIMER_REAL, 300)
    try:
        result = transact(Guest())
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
    print(json.dumps(result, sort_keys=True))
    return 0 if result['firstFailure'] == 'none' and result['cleanup'] else 3


if __name__ == '__main__':
    raise SystemExit(main())
