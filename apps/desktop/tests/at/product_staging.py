"""Private build receipt for an already extracted immutable Git source archive.

No checkout, dependency install, downloads or host Electron override. Coordinator
supplies a fresh archive and a frozen installed dependency tree INSIDE staging.
Preparation is separate from (and never starts) a native/display/reader run.
"""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
from collections import Counter

from controller_protocol import ControllerRejected
from session_owner import Deadline, SessionOwner

OUTPUTS = ("apps/desktop/dist/main.cjs", "apps/desktop/dist/preload.cjs", "apps/desktop/dist/platform",
           "apps/desktop/dist/sqlite/better_sqlite3.node", "apps/desktop/dist/renderer/index.html")
BUILD_INPUTS = "node_modules/.cache/f102-offline-build"
BUILD_INPUT_LIMIT = 512 * 1024 * 1024


def _read_offline_inputs(staging, deadline):
    """Validate public pre-provisioned caches, never a caller HOME or credentials.

    The cache manifest is an independently prepared input, not proof of compiler
    identity. The caller still pins/inventories the actual Debian toolchain.
    Its bytes and all cache inputs also enter the existing immutable receipt.
    """
    root = Path(staging) / BUILD_INPUTS
    info = root.lstat()
    if (root.resolve(strict=True) != root or not stat.S_ISDIR(info.st_mode)
            or info.st_uid != os.getuid() or info.st_mode & 0o222):
        raise ControllerRejected("prerequisite")
    manifest = root / "manifest.json"
    descriptor = os.open(manifest, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1
                or info.st_mode & 0o222 or not 0 < info.st_size <= 4 * 1024 * 1024):
            raise ControllerRejected("prerequisite")
        raw = bytearray()
        while chunk := os.read(descriptor, 65536):
            deadline.remaining()
            raw.extend(chunk)
            if len(raw) > 4 * 1024 * 1024:
                raise ControllerRejected("prerequisite")
    finally:
        os.close(descriptor)

    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                raise ControllerRejected("prerequisite")
            value[key] = item
        return value

    try:
        value = json.loads(raw, object_pairs_hook=pairs)
    except (ValueError, UnicodeError):
        raise ControllerRejected("prerequisite") from None
    if (type(value) is not dict or set(value) != {"schema", "rustVersion", "electronVersion", "files"}
            or type(value["schema"]) is not int or value["schema"] != 1
            or value["rustVersion"] != "1.95.0" or value["electronVersion"] != "45.0.0"
            or type(value["files"]) is not dict or not 1 <= len(value["files"]) <= 30000):
        raise ControllerRejected("prerequisite")
    for name, item in value["files"].items():
        if (type(name) is not str or type(item) is not dict or set(item) != {"sha256", "executable"}
                or type(item["sha256"]) is not str or not re.fullmatch(r"[0-9a-f]{64}", item["sha256"])
                or type(item["executable"]) is not bool):
            raise ControllerRejected("prerequisite")
    entries = inventory(root, deadline)
    files = {}
    total = 0
    for name, hashed in entries.items():
        path = root / name
        info = path.lstat()
        if (info.st_uid != os.getuid() or info.st_mode & 0o222 or path.is_symlink()
                or len(name.encode("utf-8")) > 1024
                or any(part in {"", ".", ".."} for part in name.split("/"))
                or any(ord(character) < 32 or ord(character) == 127 for character in name)):
            raise ControllerRejected("prerequisite")
        if name == "manifest.json":
            continue
        allowed = (name == ".cargo" or name.startswith(".cargo/registry/") or name == ".cargo/registry"
                   or name == ".electron-gyp" or name == ".electron-gyp/45.0.0"
                   or name.startswith(".electron-gyp/45.0.0/"))
        if not allowed:
            raise ControllerRejected("prerequisite")
        if name in {".cargo", ".cargo/registry", ".electron-gyp", ".electron-gyp/45.0.0"} and hashed != "directory":
            raise ControllerRejected("prerequisite")
        if hashed == "directory":
            continue
        total += info.st_size
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or total > BUILD_INPUT_LIMIT:
            raise ControllerRejected("prerequisite")
        files[name] = {"sha256": hashed, "executable": bool(info.st_mode & 0o111)}
    required = {".electron-gyp/45.0.0/include/node/node.h", ".electron-gyp/45.0.0/include/node/config.gypi",
                ".electron-gyp/45.0.0/include/node/common.gypi"}
    if (files != value["files"] or not required.issubset(files)
            or not any(name.startswith(".cargo/registry/") for name in files)):
        raise ControllerRejected("prerequisite")
    return root, files, entries


def offline_inputs(staging, deadline):
    """Keep filesystem/JSON input failures in the fixed prerequisite category."""
    try:
        return _read_offline_inputs(staging, deadline)
    except (OSError, ValueError, TypeError, RecursionError):
        raise ControllerRejected("prerequisite") from None


def seed_build_home(owner, source, files, deadline):
    """Copy only verified caches into the newly owned profile before children."""
    home = Path(owner.env["HOME"])
    if home != owner.root / "home" or home.resolve(strict=True) != home or any(home.iterdir()):
        raise ControllerRejected("prerequisite")
    for name, expected in files.items():
        deadline.remaining()
        target = home / PurePosixPath(name)
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        source_fd = os.open(source / name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            info = os.fstat(source_fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_mode & 0o222:
                raise ControllerRejected("prerequisite")
            output = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o700 if expected["executable"] else 0o600)
            try:
                hashed = hashlib.sha256()
                size = 0
                while chunk := os.read(source_fd, 65536):
                    deadline.remaining()
                    size += len(chunk)
                    if size > BUILD_INPUT_LIMIT:
                        raise ControllerRejected("prerequisite")
                    hashed.update(chunk)
                    view = memoryview(chunk)
                    while view:
                        written = os.write(output, view)
                        if written <= 0:
                            raise ControllerRejected("prerequisite")
                        view = view[written:]
                if hashed.hexdigest() != expected["sha256"]:
                    raise ControllerRejected("prerequisite")
            finally:
                os.close(output)
        finally:
            os.close(source_fd)
    owner.env.update(CARGO_HOME=str(home / ".cargo"), CARGO_NET_OFFLINE="true",
                     npm_config_nodedir=str(home / ".electron-gyp/45.0.0"), npm_config_offline="true")


def digest(path, deadline=None):
    hashed = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            if deadline:
                deadline.remaining()
            hashed.update(chunk)
    return hashed.hexdigest()


def inventory(root, deadline=None):
    result = {}
    inode_counts = Counter()
    link_counts = {}
    receipt = root / "f102-build-receipt.json"
    for path in sorted(root.rglob("*")):
        if deadline:
            deadline.remaining()
        relative = str(path.relative_to(root))
        if relative == "f102-build-receipt.json":
            continue
        if path.is_symlink():
            if not path.resolve().is_relative_to(root) or path.resolve() == receipt:
                raise ControllerRejected("prerequisite")
            result[relative] = "link:" + os.readlink(path)
        elif path.is_file():
            info = path.stat()
            identity = info.st_dev, info.st_ino
            inode_counts[identity] += 1
            link_counts[identity] = info.st_nlink
            result[relative] = digest(path, deadline)
        elif path.is_dir():
            result[relative] = "directory"
        else:
            raise ControllerRejected("prerequisite")
    # Chmod below must not alter a global package cache or any outside file.
    # Internal build hardlinks are allowed only when every link is inventoried.
    if any(inode_counts[identity] != count for identity, count in link_counts.items()):
        raise ControllerRejected("prerequisite")
    return result


def prepare(staging, node, source_tree, archive_sha256):
    """Call only after independent review, on a fresh private staging tree.

    Caller records reviewed tree/archive verification and honest signature status
    (unsigned test preparation is allowed; release signing is unchanged); these identifiers are
    private provenance, not claims that this function verifies Git signatures.
    """
    staging = Path(staging).resolve(strict=True)
    if (not re.fullmatch(r"[0-9a-f]{40}", source_tree) or not re.fullmatch(r"[0-9a-f]{64}", archive_sha256)
            or (staging / "apps/desktop/dist").exists() or (staging / "f102-build-receipt.json").exists()
            or (staging / ".git").exists()
            or staging.stat().st_uid != os.getuid() or stat.S_IMODE(staging.stat().st_mode) != 0o700):
        raise ControllerRejected("prerequisite")
    total = Deadline(360)
    before = inventory(staging, total)
    inputs, input_files, input_inventory = offline_inputs(staging, total)
    if {name[len(BUILD_INPUTS) + 1:]: hashed for name, hashed in before.items()
            if name.startswith(BUILD_INPUTS + "/")} != input_inventory:
        raise ControllerRejected("prerequisite")
    # Product build uses the staging cwd/module resolution. No parent dist/addon.
    owner = SessionOwner()
    owner.env.update(PATH=str(Path(node).parent) + ":/usr/bin:/bin", CARGO_NET_OFFLINE="true")
    try:
        seed_build_home(owner, inputs, input_files, total)
        if inventory(inputs, total) != input_inventory:
            raise ControllerRejected("prerequisite")
        for script in ("apps/desktop/setup-sqlite.ts", "apps/desktop/build.ts"):
            owner.run([str(node), script], Deadline(180, total), cwd=staging)
    finally:
        if not owner.cleanup():
            raise ControllerRejected("cleanup")
    after = inventory(staging, total)
    if offline_inputs(staging, total)[2] != input_inventory:
        raise ControllerRejected("prerequisite")
    # Source and lockfiles must survive the build unchanged. Only known build
    # output/dependency rebuild locations may change.
    mutable = ("node_modules/", "packages/storage/node_modules/", "target/", "apps/desktop/dist/")
    def rebuild_location(name):
        return any(name == prefix.rstrip("/") or name.startswith(prefix) for prefix in mutable)
    if any(before.get(name) != after.get(name) for name in before.keys() | after.keys()
           if not rebuild_location(name)):
        raise ControllerRejected("prerequisite")
    for name in OUTPUTS:
        if not re.fullmatch(r"[0-9a-f]{64}", after.get(name, "")):
            raise ControllerRejected("prerequisite")
    receipt = {"schema": 1, "sourceTree": source_tree, "archiveSha256": archive_sha256,
               "nodeSha256": digest(Path(node)), "files": after}
    with (staging / "f102-build-receipt.json").open("x") as stream:
        json.dump(receipt, stream, sort_keys=True)
    # Source/build/dependencies become read-only together. Writable runtime
    # state belongs exclusively under the controller's private root.
    for path in staging.rglob("*"):
        if not path.is_symlink():
            mode = stat.S_IMODE(path.stat().st_mode)
            path.chmod(mode & ~0o222)
    staging.chmod(0o500)


def receipt_bytes(staging, deadline=None):
    descriptor = os.open(Path(staging) / "f102-build-receipt.json", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_size > 16 * 1024 * 1024:
            raise ControllerRejected("prerequisite")
        result = bytearray()
        while chunk := os.read(descriptor, 65536):
            if deadline:
                deadline.remaining()
            result.extend(chunk)
            if len(result) > 16 * 1024 * 1024:
                raise ControllerRejected("prerequisite")
        return bytes(result)
    finally:
        os.close(descriptor)


def receipt_digest(staging, deadline=None):
    return hashlib.sha256(receipt_bytes(staging, deadline)).hexdigest()


def validate(staging, node, deadline=None, *, receipt_sha256):
    staging = Path(staging).resolve(strict=True)
    raw = receipt_bytes(staging, deadline)
    if not re.fullmatch(r"[0-9a-f]{64}", receipt_sha256) or hashlib.sha256(raw).hexdigest() != receipt_sha256:
        raise ControllerRejected("prerequisite")
    receipt = json.loads(raw)
    if (set(receipt) != {"schema", "sourceTree", "archiveSha256", "nodeSha256", "files"}
            or receipt["schema"] != 1 or receipt["nodeSha256"] != digest(Path(node), deadline)
            or not re.fullmatch(r"[0-9a-f]{40}", receipt["sourceTree"])
            or not re.fullmatch(r"[0-9a-f]{64}", receipt["archiveSha256"])
            or any(name not in receipt["files"] for name in OUTPUTS)
            or inventory(staging, deadline) != receipt["files"]):
        raise ControllerRejected("prerequisite")
    for path in (staging, *staging.rglob("*")):
        if deadline:
            deadline.remaining()
        if not path.is_symlink() and path.stat().st_mode & 0o222:
            raise ControllerRejected("prerequisite")
    return receipt
