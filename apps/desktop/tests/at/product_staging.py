"""Private build receipt for an already extracted immutable Git source archive.

No checkout, dependency install, downloads or host Electron override. Coordinator
supplies a fresh archive and a frozen installed dependency tree INSIDE staging.
Preparation is separate from (and never starts) a native/display/reader run.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
from collections import Counter

from controller_protocol import ControllerRejected
from session_owner import Deadline, SessionOwner

OUTPUTS = ("apps/desktop/dist/main.cjs", "apps/desktop/dist/preload.cjs", "apps/desktop/dist/platform",
           "apps/desktop/dist/sqlite/better_sqlite3.node", "apps/desktop/dist/renderer/index.html")


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
    # Product build uses the staging cwd/module resolution. No parent dist/addon.
    owner = SessionOwner()
    owner.env.update(PATH=str(Path(node).parent) + ":/usr/bin:/bin", CARGO_NET_OFFLINE="true")
    try:
        for script in ("apps/desktop/setup-sqlite.ts", "apps/desktop/build.ts"):
            owner.run([str(node), script], Deadline(180, total), cwd=staging)
    finally:
        if not owner.cleanup():
            raise ControllerRejected("cleanup")
    after = inventory(staging, total)
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
