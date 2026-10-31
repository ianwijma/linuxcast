"""Linux lifetime ownership, deadlines, private paths and bounded child IO.

Run only in a dedicated isolated guest network namespace. Subreaping handles
double-fork/setsid descendants; pidfds prevent identity reuse when signaling.
"""
import ctypes
import os
from pathlib import Path
import selectors
import shutil
import signal
import socket
import stat
import struct
import subprocess
import time

from controller_protocol import ControllerRejected


class Deadline:
    def __init__(self, seconds, parent=None, clock=time.monotonic):
        self.clock = clock
        self.end = min(clock() + seconds, parent.end if parent else float("inf"))

    def remaining(self):
        remaining = self.end - self.clock()
        if remaining <= 0:
            raise ControllerRejected("deadline")
        return remaining


class Channel:
    def __init__(self, child):
        self.child = child
        self.buffer = b""
        self.total = 0

    def line(self, deadline):
        while b"\n" not in self.buffer:
            with selectors.DefaultSelector() as selector:
                selector.register(self.child.stdout, selectors.EVENT_READ)
                if not selector.select(deadline.remaining()):
                    raise ControllerRejected("deadline")
            data = os.read(self.child.stdout.fileno(), 4096)
            self.total += len(data)
            if not data or self.total > 2 * 1024 * 1024 or len(self.buffer) + len(data) > 65536:
                raise ControllerRejected("protocol")
            self.buffer += data
        line, self.buffer = self.buffer.split(b"\n", 1)
        return line + b"\n"

    def send(self, command):
        if self.child.poll() is not None:
            raise ControllerRejected("child")
        self.child.stdin.write(command.encode("ascii") + b"\n")
        self.child.stdin.flush()


class SessionOwner:
    def __init__(self, parent=Path("/tmp")):
        # Must be installed before any children; CLI is a dedicated process.
        if ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0) != 0:
            raise ControllerRejected("prerequisite")
        self.old_umask = os.umask(0o077)
        self.root = parent / ("linuxcast-f102-at-" + os.urandom(8).hex())
        try:
            self.root.mkdir(mode=0o700)
        except BaseException:
            os.umask(self.old_umask)
            raise
        self.children = []
        self.required = []
        self.handles = {}
        self.identities = {}
        self.external = []
        self.external_identities = {}
        self.env = {"PATH": "/usr/bin:/bin", "LANG": "en_US.UTF-8", "LC_ALL": "en_US.UTF-8",
                    "LINUXCAST_F102_AT_ROOT": str(self.root), "XDG_SESSION_TYPE": "x11",
                    "GSETTINGS_BACKEND": "memory", "NO_AT_BRIDGE": "0", "GTK_A11Y": "atspi"}
        try:
            for key, suffix in {"HOME": "home", "XDG_CONFIG_HOME": "config", "XDG_CACHE_HOME": "cache",
                                "XDG_DATA_HOME": "data", "XDG_RUNTIME_DIR": "runtime",
                                "XDG_DATA_DIRS": "system", "TMPDIR": "tmp"}.items():
                self.directory(suffix)
                self.env[key] = str(self.root / suffix)
        except BaseException:
            shutil.rmtree(self.root)
            os.umask(self.old_umask)
            raise
        self.env["XDG_CONFIG_DIRS"] = self.env["XDG_CONFIG_HOME"]
        self.env["DBUS_SYSTEM_BUS_ADDRESS"] = f"unix:path={self.root}/runtime/no-system-bus"
        for key, suffix in {"DBUS_SESSION_BUS_ADDRESS": "session-bus", "AT_SPI_BUS_ADDRESS": "at-bus"}.items():
            self.env[key] = f"unix:path={self.root}/runtime/{suffix}"

    def directory(self, suffix):
        path = self.root / suffix
        path.mkdir(mode=0o700)
        return path

    def write(self, suffix, text):
        path = self.root / suffix
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w") as stream:
            stream.write(text)
        return path

    def spawn(self, arguments, cwd=None, protocol=False, required=True):
        self.refresh()
        child = subprocess.Popen(arguments, cwd=cwd or self.root, env=self.env, start_new_session=True,
                                 stdin=subprocess.PIPE if protocol else subprocess.DEVNULL,
                                 stdout=subprocess.PIPE if protocol else subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL, close_fds=True)
        self.children.append(child)  # Retain even on later setup failure.
        if required:
            self.required.append(child)
        self.refresh()
        return child

    def refresh(self):
        # Descendants are found by ancestry, never command-name/PID guessing.
        parents = {}
        starts = {}
        for entry in Path("/proc").iterdir():
            if entry.name.isdecimal():
                try:
                    data = (entry / "stat").read_text().rsplit(")", 1)[1].split()
                    parents[int(entry.name)] = int(data[1])
                    starts[int(entry.name)] = data[19]
                except (OSError, ValueError, IndexError):
                    continue
        owned = {os.getpid()}
        while True:
            more = {pid for pid, parent in parents.items() if parent in owned}
            if more <= owned:
                break
            owned |= more
        for pid in owned - {os.getpid()}:
            if self.identities.get(pid) == starts[pid]:
                continue
            fd = None
            try:
                fd = os.pidfd_open(pid)
                # Bind acquisition to the same /proc identity captured above.
                # Never signal a reused PID based on an earlier ancestry scan.
                current = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19]
                if current != starts[pid]:
                    os.close(fd)
                    continue
                if pid in self.handles:
                    os.close(self.handles[pid])
                self.handles[pid] = fd
                self.identities[pid] = current
                if len(self.handles) > 512:
                    raise ControllerRejected("child")
            except (ProcessLookupError, FileNotFoundError):
                if fd is not None:
                    os.close(fd)
                pass

    def alive(self):
        self.refresh()
        return not any(child.poll() is not None for child in self.required)

    @staticmethod
    def filesystem_identity(info):
        return info.st_dev, info.st_ino, stat.S_IFMT(info.st_mode), info.st_uid

    def bind_x_server_paths(self, child, lock_path, socket_path):
        """Bind the two expected paths to a live retained X server, not its UID alone."""
        if child not in self.children or child.poll() is not None or child.pid not in self.handles:
            raise ControllerRejected("prerequisite")
        if self.external != [lock_path, socket_path]:
            raise ControllerRejected("prerequisite")
        lock_info, socket_info = lock_path.lstat(), socket_path.lstat()
        if (not stat.S_ISREG(lock_info.st_mode) or lock_info.st_nlink != 1 or lock_info.st_size > 32
                or not stat.S_ISSOCK(socket_info.st_mode)
                or any(info.st_uid != os.getuid() for info in (lock_info, socket_info))):
            raise ControllerRejected("prerequisite")
        descriptor = os.open(lock_path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            if (self.filesystem_identity(os.fstat(descriptor)) != self.filesystem_identity(lock_info)
                    or os.read(descriptor, 33).strip() != str(child.pid).encode("ascii")):
                raise ControllerRejected("prerequisite")
        finally:
            os.close(descriptor)
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(1)
            client.connect(str(socket_path))
            peer_pid, peer_uid, _ = struct.unpack("3i", client.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            if peer_pid != child.pid or peer_uid != os.getuid():
                raise ControllerRejected("prerequisite")
        for path, info in ((lock_path, lock_info), (socket_path, socket_info)):
            if self.filesystem_identity(path.lstat()) != self.filesystem_identity(info):
                raise ControllerRejected("prerequisite")
        if child.poll() is not None:
            raise ControllerRejected("prerequisite")
        self.external_identities = {path: self.filesystem_identity(info)
                                    for path, info in ((lock_path, lock_info), (socket_path, socket_info))}

    def run(self, arguments, deadline, cwd=None):
        child = self.spawn(arguments, cwd=cwd, required=False)
        try:
            code = child.wait(timeout=deadline.remaining())
        except subprocess.TimeoutExpired:
            raise ControllerRejected("deadline") from None
        if code != 0:
            raise ControllerRejected("child")

    def cleanup(self):
        end = time.monotonic() + 5
        clean = True
        verified = False
        try:
            while True:
                # Already-retained ownership does not depend on /proc discovery.
                # A failed refresh must never skip terminating known children.
                for child in self.children:
                    try:
                        if child.poll() is None:
                            child.kill()
                    except OSError:
                        clean = False
                live = []
                for pid, fd in list(self.handles.items()):
                    try:
                        with selectors.DefaultSelector() as selector:
                            selector.register(fd, selectors.EVENT_READ)
                            dead = bool(selector.select(0))
                        if not dead:
                            live.append(pid)
                            signal.pidfd_send_signal(fd, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    except OSError:
                        clean = False
                # Popen owns its direct children; then reap adopted descendants.
                for child in self.children:
                    child.poll()
                while True:
                    try:
                        pid, _ = os.waitpid(-1, os.WNOHANG)
                        if pid == 0:
                            break
                    except ChildProcessError:
                        break
                try:
                    # Retry discovery after reaping, which can also release scarce
                    # descriptors. Any earlier error remains a cleanup failure.
                    self.refresh()
                    with selectors.DefaultSelector() as selector:
                        for fd in self.handles.values():
                            selector.register(fd, selectors.EVENT_READ)
                        dead_count = len(selector.select(0))
                    verified = (not live and dead_count == len(self.handles)
                                and all(child.poll() is not None for child in self.children))
                    if verified:
                        break
                except Exception:
                    clean = False
                    verified = False
                if time.monotonic() >= end:
                    clean = False
                    break
                time.sleep(0.01)
        finally:
            for fd in self.handles.values():
                try:
                    os.close(fd)
                except OSError:
                    clean = False
            for child in self.children:
                for stream in (child.stdin, child.stdout):
                    if stream:
                        try:
                            stream.close()
                        except OSError:
                            clean = False
            try:
                if verified:
                    shutil.rmtree(self.root)
                    for path in self.external:
                        # X server owns these two exact paths; never sweep /tmp.
                        try:
                            identity = self.filesystem_identity(path.lstat())
                        except FileNotFoundError:
                            continue
                        if identity:
                            if self.external_identities.get(path) != identity:
                                clean = False
                            else:
                                path.unlink()
                    clean = clean and not self.root.exists() and not any(p.exists() for p in self.external)
                else:
                    # Preserve the private tree for the outer lab owner rather
                    # than unlink profiles/sockets beneath unverified children.
                    clean = False
            except OSError:
                clean = False
            os.umask(self.old_umask)
        return clean


def socket_ready(path):
    try:
        info = Path(path).lstat()
        return stat.S_ISSOCK(info.st_mode) and info.st_uid == os.getuid()
    except OSError:
        return False
