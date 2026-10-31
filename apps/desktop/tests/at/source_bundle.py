"""Private, nonexecuting extraction of a pinned Git source tar for F1-02.

This is not a build receipt, Git signature verifier, namespace launcher or native
acceptance. The coordinator separately verifies the reviewed Git tree/signature
and pins this archive's SHA256. No dependency install or executable is started.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tarfile
import tempfile

MAX_BYTES = 256 * 1024 * 1024
MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_MEMBERS = 20000
REQUIRED = {"package.json", "bun.lock", "Cargo.lock", "apps/desktop/build.ts", "apps/desktop/setup-sqlite.ts"}


class BundleRejected(Exception):
    def __init__(self, reason, cleanup=True):
        super().__init__(reason)
        self.reason = reason
        self.cleanup = cleanup


def _snapshot(archive, expected):
    """Hash and seal one bounded snapshot; never reread a mutable input later."""
    descriptor = os.open(archive, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    frozen = None
    try:
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1
                or stat.S_IMODE(info.st_mode) not in {0o400, 0o600} or not 0 < info.st_size <= MAX_BYTES):
            raise BundleRejected("archive")
        frozen = os.memfd_create("linuxcast-source-bundle", os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
        digest = hashlib.sha256()
        size = 0
        while chunk := os.read(descriptor, 65536):
            size += len(chunk)
            if size > MAX_BYTES:
                raise BundleRejected("archive")
            digest.update(chunk)
            view = memoryview(chunk)
            while view:
                count = os.write(frozen, view)
                if count <= 0:
                    raise BundleRejected("archive")
                view = view[count:]
        if size != info.st_size or digest.hexdigest() != expected:
            raise BundleRejected("archive")
        seals = fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL
        fcntl.fcntl(frozen, fcntl.F_ADD_SEALS, seals)
        os.lseek(frozen, 0, os.SEEK_SET)
        result, frozen = frozen, None
        return result, size
    finally:
        os.close(descriptor)
        if frozen is not None:
            os.close(frozen)


def _members(contents, source_revision, expected_files):
    if contents.pax_headers.get("comment") != source_revision:
        raise BundleRejected("layout")
    result = {}
    total = 0
    end = 0
    for index, member in enumerate(contents):
        if index >= MAX_MEMBERS:
            raise BundleRejected("layout")
        name = member.name.rstrip("/") if member.isdir() else member.name
        pieces = name.split("/")
        if (not name or len(name.encode("utf-8")) > 1024 or any(part in {"", ".", "..", ".git", "node_modules"}
                or len(part.encode("utf-8")) > 255 for part in pieces) or name in result
                or PurePosixPath(name).is_absolute() or member.type not in {tarfile.DIRTYPE, tarfile.REGTYPE, tarfile.AREGTYPE}
                or member.issparse() or any(key.startswith("GNU.sparse.") for key in member.pax_headers)
                or any(ord(character) < 32 or ord(character) == 127 for character in name)
                or member.size < 0 or member.size > MAX_FILE_BYTES or member.isdir() and member.size != 0
                or name == "target" or name.startswith("target/") or name == "f102-build-receipt.json"
                or name == "apps/desktop/dist" or name.startswith("apps/desktop/dist/")):
            # Git source currently has no links. Dependency symlinks are installed
            # later inside staging and checked by the existing build receipt.
            raise BundleRejected("layout")
        total += member.size
        if total > MAX_BYTES:
            raise BundleRejected("layout")
        result[name] = member
        end = max(end, member.offset_data + ((member.size + 511) // 512) * 512)
    files = {name for name, member in result.items() if member.isfile()}
    if len(files) != expected_files or not REQUIRED.issubset(files):
        raise BundleRejected("layout")
    paths = set(result)
    for name in result:
        parent = PurePosixPath(name).parent
        while str(parent) != ".":
            if str(parent) in files:
                raise BundleRejected("layout")
            paths.add(str(parent))
            if len(paths) > MAX_MEMBERS:
                raise BundleRejected("layout")
            parent = parent.parent
    contents.fileobj.seek(end)
    while chunk := contents.fileobj.read(65536):
        if chunk.strip(b"\0"):
            raise BundleRejected("layout")
    return result


def _directory(root, pieces, identities, *, create=True):
    """Return an owned directory FD; never resolve output through a moving root."""
    current = os.dup(root)
    path = ()
    try:
        for piece in pieces:
            path += (piece,)
            if create:
                try:
                    os.mkdir(piece, mode=0o700, dir_fd=current)
                except FileExistsError:
                    if path not in identities:
                        raise BundleRejected("destination", cleanup=False) from None
            info = os.stat(piece, dir_fd=current, follow_symlinks=False)
            identity = info.st_dev, info.st_ino
            if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid()
                    or stat.S_IMODE(info.st_mode) != 0o700
                    or path in identities and identities[path] != identity
                    or not create and path not in identities):
                raise BundleRejected("destination")
            child = os.open(piece, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=current)
            try:
                opened = os.fstat(child)
                if ((opened.st_dev, opened.st_ino) != identity or not stat.S_ISDIR(opened.st_mode)
                        or opened.st_uid != os.getuid() or stat.S_IMODE(opened.st_mode) != 0o700):
                    raise BundleRejected("destination")
            except Exception:
                os.close(child)
                raise
            identities[path] = identity
            os.close(current)
            current = child
        result, current = current, None
        return result
    finally:
        if current is not None:
            os.close(current)


def _verify_binding(parent, parent_fd, staging, identity, root, identities):
    """Publication/cleanup must still refer to the captured private source tree."""
    def identity_of(info):
        return info.st_dev, info.st_ino
    try:
        info = os.stat(parent, follow_symlinks=False)
        retained = os.fstat(root)
        if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700
                or identity_of(info) != identity_of(os.fstat(parent_fd))
                or os.readlink(f"/proc/self/fd/{parent_fd}") != str(parent)
                or identity_of(os.stat(staging.name, dir_fd=parent_fd, follow_symlinks=False)) != identity
                or identity_of(retained) != identity or not stat.S_ISDIR(retained.st_mode)
                or retained.st_uid != os.getuid() or stat.S_IMODE(retained.st_mode) != 0o700):
            raise BundleRejected("destination", cleanup=False)
        for pieces in identities:
            descriptor = _directory(root, pieces, identities, create=False)
            os.close(descriptor)
    except Exception:
        # Unknown custody is never grounds to traverse/delete a replacement.
        raise BundleRejected("destination", cleanup=False) from None


def _remove_owned_stage(staging, expected):
    """Bind cleanup to the opened directory, not an earlier pathname check."""
    def checked_directory(info, identity):
        if (not stat.S_ISDIR(info.st_mode) or (info.st_dev, info.st_ino) != identity
                or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700):
            raise OSError("unverified cleanup directory")

    remaining = MAX_MEMBERS
    def remove_contents(directory):
        nonlocal remaining
        for name in os.listdir(directory):
            remaining -= 1
            if remaining < 0:
                raise OSError("cleanup entry bound")
            info = os.stat(name, dir_fd=directory, follow_symlinks=False)
            if stat.S_ISDIR(info.st_mode):
                identity = info.st_dev, info.st_ino
                child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory)
                try:
                    checked_directory(os.fstat(child), identity)
                    remove_contents(child)
                    checked_directory(os.stat(name, dir_fd=directory, follow_symlinks=False), identity)
                    os.rmdir(name, dir_fd=directory)
                    if os.fstat(child).st_nlink != 0:
                        raise OSError("cleanup directory retained")
                finally:
                    os.close(child)
            elif (stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and info.st_nlink == 1
                    and stat.S_IMODE(info.st_mode) in {0o600, 0o700}):
                os.unlink(name, dir_fd=directory)
            else:
                # Extraction creates no links, devices or nonprivate entries.
                raise OSError("unknown cleanup entry")

    checked_directory(staging.lstat(), expected)
    directory = os.open(staging, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        checked_directory(os.fstat(directory), expected)
        remove_contents(directory)
        checked_directory(staging.lstat(), expected)
        os.rmdir(staging)
        if os.fstat(directory).st_nlink != 0:
            raise OSError("cleanup root retained")
    finally:
        os.close(directory)


def extract_source(archive, destination_parent, *, archive_sha256, source_revision, source_tree, expected_files):
    """Create only a new private tree; never extract into an existing checkout.

    source_tree is caller provenance, not independently derivable from tar. The
    pinned archive digest and Git comment bind the previously verified input.
    """
    if (not re.fullmatch(r"[0-9a-f]{64}", archive_sha256)
            or not re.fullmatch(r"[0-9a-f]{40}", source_revision)
            or not re.fullmatch(r"[0-9a-f]{40}", source_tree)
            or type(expected_files) is not int or not 1 <= expected_files <= MAX_MEMBERS):
        raise BundleRejected("archive")
    parent = Path(destination_parent)
    if os.getuid() == 0 or not parent.is_absolute() or parent != parent.resolve(strict=True):
        raise BundleRejected("destination")
    parent_fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    frozen = None
    staging = None
    identity = None
    root = None
    identities = {}
    try:
        info = os.fstat(parent_fd)
        if (info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700
                or os.readlink(f"/proc/self/fd/{parent_fd}") != str(parent)):
            raise BundleRejected("destination")
        frozen, size = _snapshot(archive, archive_sha256)
        with os.fdopen(frozen, "rb", closefd=False) as stream, tarfile.open(fileobj=stream, mode="r:") as contents:
            members = _members(contents, source_revision, expected_files)
            owned_parent = Path(f"/proc/self/fd/{parent_fd}")
            staging = Path(tempfile.mkdtemp(prefix="linuxcast-f102-source-", dir=owned_parent))
            info = staging.stat()
            identity = info.st_dev, info.st_ino
            root = os.open(staging, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
            opened = os.fstat(root)
            if (opened.st_dev, opened.st_ino) != identity:
                raise BundleRejected("destination", cleanup=False)
            for name, member in sorted(members.items(), key=lambda item: (len(PurePosixPath(item[0]).parts), item[0])):
                if member.isdir():
                    descriptor = _directory(root, PurePosixPath(name).parts, identities)
                    os.close(descriptor)
                    continue
                directory = _directory(root, PurePosixPath(name).parts[:-1], identities)
                mode = 0o700 if member.mode & 0o111 else 0o600
                try:
                    descriptor = os.open(PurePosixPath(name).name, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW | os.O_CLOEXEC, mode, dir_fd=directory)
                finally:
                    os.close(directory)
                try:
                    with contents.extractfile(member) as data:
                        remaining = member.size
                        while remaining:
                            chunk = data.read(min(remaining, 65536))
                            if not chunk:
                                raise BundleRejected("archive")
                            remaining -= len(chunk)
                            view = memoryview(chunk)
                            while view:
                                count = os.write(descriptor, view)
                                if count <= 0:
                                    raise BundleRejected("archive")
                                view = view[count:]
                    os.fsync(descriptor)
                finally:
                    os.close(descriptor)
            _verify_binding(parent, parent_fd, staging, identity, root, identities)
            os.fsync(parent_fd)
            return {"schemaVersion": 1, "status": "extracted", "directory": str(parent / staging.name),
                    "sourceRevision": source_revision, "sourceTree": source_tree, "archiveSha256": archive_sha256,
                    "archiveBytes": size, "sourceFiles": expected_files, "productBuildPerformed": False, "nativeRuns": 0}
    except Exception as error:
        reason = error.reason if isinstance(error, BundleRejected) else "archive"
        cleanup = True
        if staging is not None:
            try:
                if isinstance(error, BundleRejected) and not error.cleanup:
                    raise OSError("unverified source custody")
                if root is not None:
                    _verify_binding(parent, parent_fd, staging, identity, root, identities)
                _remove_owned_stage(staging, identity)
                if staging.exists() or staging.is_symlink():
                    raise OSError()
            except Exception:
                cleanup = False
        raise BundleRejected(reason, cleanup) from None
    finally:
        if root is not None:
            os.close(root)
        if frozen is not None:
            os.close(frozen)
        os.close(parent_fd)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive")
    parser.add_argument("destination_parent")
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--source-tree", required=True)
    parser.add_argument("--expected-files", required=True, type=int)
    args = parser.parse_args()
    try:
        result = extract_source(args.archive, args.destination_parent, archive_sha256=args.sha256,
                                source_revision=args.source_revision, source_tree=args.source_tree, expected_files=args.expected_files)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (BundleRejected, OSError) as error:
        print(json.dumps({"schemaVersion": 1, "status": "rejected", "reason": error.reason if isinstance(error, BundleRejected) else "archive",
                          "cleanupVerified": error.cleanup if isinstance(error, BundleRejected) else True, "nativeRuns": 0}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
