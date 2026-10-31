"""Real private-file/memfd checks, never a build, guest or native AT run."""
import hashlib
import io
import os
from pathlib import Path
import stat
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import source_bundle as bundle

REVISION = "a" * 40
TREE = "b" * 40


class SourceBundleTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="linuxcast-source-bundle-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.output = self.root / "output"
        self.output.mkdir(mode=0o700)
        self.archive = self.root / "source.tar"

    def archive_bytes(self, extras=(), *, comment=REVISION):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode="w", format=tarfile.PAX_FORMAT, pax_headers={"comment": comment}) as contents:
            for name in sorted(bundle.REQUIRED):
                info = tarfile.TarInfo(name)
                data = b"public source\n"
                info.size = len(data)
                info.mode = 0o644
                contents.addfile(info, io.BytesIO(data))
            for info, data in extras:
                contents.addfile(info, io.BytesIO(data) if info.isfile() else None)
        return stream.getvalue()

    def prepare(self, extras=(), *, comment=REVISION):
        data = self.archive_bytes(extras, comment=comment)
        self.archive.write_bytes(data)
        self.archive.chmod(0o600)
        return hashlib.sha256(data).hexdigest()

    def extract(self, digest, **changes):
        arguments = {"archive_sha256": digest, "source_revision": REVISION, "source_tree": TREE,
                     "expected_files": len(bundle.REQUIRED)}
        arguments.update(changes)
        return bundle.extract_source(self.archive, self.output, **arguments)

    @staticmethod
    def member(name, *, kind=tarfile.REGTYPE, data=b"public", mode=0o644, target=""):
        info = tarfile.TarInfo(name)
        info.type, info.mode, info.linkname = kind, mode, target
        info.size = len(data) if kind in {tarfile.REGTYPE, tarfile.AREGTYPE} else 0
        return info, data

    def test_private_fresh_tree_exact_contents_and_executable_modes(self):
        digest = self.prepare([self.member("new/nested/tool.sh", mode=0o755)])
        report = self.extract(digest, expected_files=len(bundle.REQUIRED) + 1)
        stage = Path(report["directory"])
        self.assertEqual(stage.parent, self.output)
        self.assertEqual(report["archiveSha256"], digest)
        self.assertFalse(report["productBuildPerformed"])
        self.assertEqual(report["nativeRuns"], 0)
        self.assertEqual((stage / "new/nested/tool.sh").read_bytes(), b"public")
        for path in [stage, *stage.rglob("*")]:
            expected = 0o700 if path.is_dir() or path.name == "tool.sh" else 0o600
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), expected)
        self.assertEqual(self.archive.stat().st_mode & 0o777, 0o600)

    def test_sealed_snapshot_cannot_be_written_or_changed_by_mutating_original(self):
        digest = self.prepare()
        descriptor, size = bundle._snapshot(self.archive, digest)
        try:
            with self.assertRaises(OSError):
                os.pwrite(descriptor, b"x", 0)
            self.archive.write_bytes(b"different original")
            self.assertEqual(hashlib.sha256(os.read(descriptor, size)).hexdigest(), digest)
        finally:
            os.close(descriptor)

    def test_wrong_hash_provenance_or_count_rejected_without_output(self):
        digest = self.prepare()
        for changes in [{"archive_sha256": "0" * 64}, {"source_revision": "c" * 40}, {"source_tree": "bad"},
                        {"expected_files": True}, {"expected_files": 0}, {"expected_files": 99}]:
            with self.subTest(changes=changes), self.assertRaises(bundle.BundleRejected):
                self.extract(digest, **changes)
        self.assertEqual(list(self.output.iterdir()), [])

    def test_unsafe_archive_names_and_conflicting_layouts_rejected_before_writing(self):
        for name in ["../escape", "/escape", "./escape", "a//escape", "a/../escape", "a\nline", ".git/config",
                     "node_modules/cache", "packages/x/node_modules/cache", "target/output", "apps/desktop/dist/main.cjs",
                     "f102-build-receipt.json", "package.json", "package.json/child", "a" * 256]:
            with self.subTest(name=name):
                digest = self.prepare([self.member(name)])
                with self.assertRaises(bundle.BundleRejected):
                    self.extract(digest, expected_files=len(bundle.REQUIRED) + 1)
                self.assertEqual(list(self.output.iterdir()), [])
        self.assertFalse((self.root / "escape").exists())

    def test_all_link_and_device_types_rejected_before_writing(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.FIFOTYPE, tarfile.CHRTYPE, tarfile.BLKTYPE]:
            with self.subTest(kind=kind):
                digest = self.prepare([self.member("unsafe", kind=kind, target="/outside")])
                with self.assertRaises(bundle.BundleRejected):
                    self.extract(digest)
                self.assertEqual(list(self.output.iterdir()), [])

    def test_archive_identity_and_private_permissions_are_required(self):
        digest = self.prepare()
        self.archive.chmod(0o640)
        with self.assertRaises(bundle.BundleRejected):
            self.extract(digest)
        self.archive.chmod(0o600)
        alias = self.root / "alias"
        os.link(self.archive, alias)
        with self.assertRaises(bundle.BundleRejected):
            self.extract(digest)
        alias.unlink()
        original = self.root / "original"
        self.archive.rename(original)
        self.archive.symlink_to(original)
        with self.assertRaises(bundle.BundleRejected):
            self.extract(digest)
        self.archive.unlink()
        os.mkfifo(self.archive, mode=0o600)
        with self.assertRaises(bundle.BundleRejected):
            self.extract(digest)
        self.assertEqual(list(self.output.iterdir()), [])

    def test_destination_must_be_nonroot_canonical_private_directory(self):
        digest = self.prepare()
        self.output.chmod(0o755)
        with self.assertRaises(bundle.BundleRejected):
            self.extract(digest)
        self.output.chmod(0o700)
        with patch.object(bundle.os, "getuid", return_value=0), self.assertRaises(bundle.BundleRejected):
            self.extract(digest)
        alias = self.root / "parent-alias"
        alias.symlink_to(self.output, target_is_directory=True)
        with self.assertRaises(bundle.BundleRejected):
            bundle.extract_source(self.archive, alias, archive_sha256=digest, source_revision=REVISION,
                                  source_tree=TREE, expected_files=len(bundle.REQUIRED))
        self.assertEqual(list(self.output.iterdir()), [])

    def test_size_member_and_nonzero_trailer_bounds(self):
        digest = self.prepare()
        for name, value in [("MAX_BYTES", 512), ("MAX_MEMBERS", 2), ("MAX_FILE_BYTES", 1)]:
            with self.subTest(name=name), patch.object(bundle, name, value), self.assertRaises(bundle.BundleRejected):
                self.extract(digest)
        self.archive.write_bytes(self.archive.read_bytes() + b"unreviewed trailer")
        changed = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        with self.assertRaises(bundle.BundleRejected):
            self.extract(changed)
        self.assertEqual(list(self.output.iterdir()), [])

    def test_entry_bound_includes_implicit_parent_directories_before_output(self):
        digest = self.prepare()
        # Five file members also require apps/ and apps/desktop/ output nodes.
        with patch.object(bundle, "MAX_MEMBERS", len(bundle.REQUIRED)), \
             self.assertRaises(bundle.BundleRejected) as caught:
            self.extract(digest)
        self.assertEqual(caught.exception.reason, "layout")
        self.assertTrue(caught.exception.cleanup)
        self.assertEqual(list(self.output.iterdir()), [])

    def test_partial_output_failure_removes_only_new_owned_stage(self):
        digest = self.prepare()
        keep = self.output / "keep.txt"
        keep.write_bytes(b"unrelated")
        original = os.write
        def fail_output(descriptor, value):
            if os.fstat(descriptor).st_nlink == 1:
                raise OSError("synthetic private failure")
            return original(descriptor, value)
        with patch.object(bundle.os, "write", side_effect=fail_output), self.assertRaises(bundle.BundleRejected) as caught:
            self.extract(digest)
        self.assertEqual(caught.exception.reason, "archive")
        self.assertTrue(caught.exception.cleanup)
        self.assertEqual(list(self.output.iterdir()), [keep])
        self.assertEqual(keep.read_bytes(), b"unrelated")

    def test_replaced_stage_is_preserved_and_cleanup_failure_keeps_first_reason(self):
        digest = self.prepare()
        original = os.write
        replacement = None
        def replace_output(descriptor, value):
            nonlocal replacement
            if os.fstat(descriptor).st_nlink == 1:
                stage = next(self.output.glob("linuxcast-f102-source-*"))
                stage.rename(self.output / "original-stage")
                stage.mkdir(mode=0o700)
                replacement = stage / "foreign.txt"
                replacement.write_bytes(b"preserve replacement")
                raise OSError("synthetic failure")
            return original(descriptor, value)
        with patch.object(bundle.os, "write", side_effect=replace_output), self.assertRaises(bundle.BundleRejected) as caught:
            self.extract(digest)
        self.assertEqual(caught.exception.reason, "archive")
        self.assertFalse(caught.exception.cleanup)
        self.assertIsNotNone(replacement)
        self.assertEqual(replacement.read_bytes(), b"preserve replacement")

    def test_stage_replacement_during_successful_write_never_publishes_foreign_tree(self):
        digest = self.prepare()
        original_write = os.write
        replacement = None
        def replace_output(descriptor, value):
            nonlocal replacement
            if replacement is None and os.fstat(descriptor).st_nlink == 1:
                stage = next(self.output.glob("linuxcast-f102-source-*"))
                stage.rename(self.output / "original-owned-stage")
                stage.mkdir(mode=0o700)
                replacement = stage / "foreign.txt"
                replacement.write_bytes(b"preserve successful-write replacement")
            return original_write(descriptor, value)
        with patch.object(bundle.os, "write", side_effect=replace_output), \
             self.assertRaises(bundle.BundleRejected) as caught:
            self.extract(digest)
        self.assertEqual(caught.exception.reason, "destination")
        self.assertFalse(caught.exception.cleanup)
        self.assertEqual(replacement.read_bytes(), b"preserve successful-write replacement")
        self.assertEqual(list(replacement.parent.iterdir()), [replacement], "writes escaped into replacement root")
        owned = self.output / "original-owned-stage"
        self.assertTrue(all((owned / name).is_file() for name in bundle.REQUIRED))

    def test_parent_replacement_never_publishes_a_foreign_destination(self):
        digest = self.prepare()
        original_write = os.write
        replacement = None
        def replace_parent(descriptor, value):
            nonlocal replacement
            if replacement is None and os.fstat(descriptor).st_nlink == 1:
                self.output.rename(self.root / "original-parent")
                self.output.mkdir(mode=0o700)
                replacement = self.output / "foreign.txt"
                replacement.write_bytes(b"preserve replacement parent")
            return original_write(descriptor, value)
        with patch.object(bundle.os, "write", side_effect=replace_parent), \
             self.assertRaises(bundle.BundleRejected) as caught:
            self.extract(digest)
        self.assertEqual(caught.exception.reason, "destination")
        self.assertFalse(caught.exception.cleanup)
        self.assertEqual(list(self.output.iterdir()), [replacement])
        self.assertEqual(replacement.read_bytes(), b"preserve replacement parent")
        owned = next((self.root / "original-parent").iterdir())
        self.assertTrue(all((owned / name).is_file() for name in bundle.REQUIRED))

    def test_nested_directory_replacement_never_redirects_file_creation(self):
        digest = self.prepare()
        original_open = os.open
        replacement = None
        owned = None
        def replace_directory(path, flags, *args, **kwargs):
            nonlocal replacement, owned
            if replacement is None and flags & os.O_CREAT and Path(path).name == "build.ts":
                stage = next(self.output.glob("linuxcast-f102-source-*"))
                target = stage / "apps" / "desktop"
                owned = target.with_name("original-desktop")
                target.rename(owned)
                target.mkdir(mode=0o700)
                replacement = target / "foreign.txt"
                replacement.write_bytes(b"preserve replacement child")
            return original_open(path, flags, *args, **kwargs)
        with patch.object(bundle.os, "open", side_effect=replace_directory), \
             self.assertRaises(bundle.BundleRejected) as caught:
            self.extract(digest)
        self.assertEqual(caught.exception.reason, "destination")
        self.assertFalse(caught.exception.cleanup)
        self.assertEqual(list(replacement.parent.iterdir()), [replacement])
        self.assertEqual(replacement.read_bytes(), b"preserve replacement child")
        self.assertTrue((owned / "build.ts").is_file())

    def test_stage_replaced_after_identity_check_is_not_deleted(self):
        digest = self.prepare()
        original_write = os.write
        original_lstat = Path.lstat
        failed = False
        replacement = None
        def fail_output(descriptor, value):
            nonlocal failed
            if os.fstat(descriptor).st_nlink == 1:
                failed = True
                raise OSError("synthetic output fault")
            return original_write(descriptor, value)
        def replace_after_check(path, *args, **kwargs):
            nonlocal replacement
            info = original_lstat(path, *args, **kwargs)
            if failed and replacement is None and path.name.startswith("linuxcast-f102-source-"):
                path.rename(self.output / "original-owned-stage")
                path.mkdir(mode=0o700)
                replacement = self.output / path.name / "foreign.txt"
                replacement.write_bytes(b"preserve checked replacement")
            return info  # the earlier identity is valid, but the name changed
        with patch.object(bundle.os, "write", side_effect=fail_output), \
             patch.object(Path, "lstat", replace_after_check), \
             self.assertRaises(bundle.BundleRejected) as caught:
            self.extract(digest)
        self.assertIsNotNone(replacement)
        self.assertTrue(replacement.is_file(), "cleanup deleted the replacement directory")
        self.assertEqual(replacement.read_bytes(), b"preserve checked replacement")
        self.assertFalse(caught.exception.cleanup)
        self.assertEqual(caught.exception.reason, "archive")
        self.assertTrue((self.output / "original-owned-stage").is_dir())

    def test_cleanup_retains_opened_directory_when_its_name_is_replaced(self):
        digest = self.prepare()
        original_write = os.write
        original_open = os.open
        failed = False
        replacement = None
        def fail_output(descriptor, value):
            nonlocal failed
            if os.fstat(descriptor).st_nlink == 1:
                failed = True
                raise OSError("synthetic output fault")
            return original_write(descriptor, value)
        def replace_after_open(path, flags, *args, **kwargs):
            nonlocal replacement
            descriptor = original_open(path, flags, *args, **kwargs)
            candidate = Path(path) if isinstance(path, (str, Path)) else None
            if (failed and replacement is None and candidate is not None
                    and candidate.name.startswith("linuxcast-f102-source-")):
                candidate.rename(self.output / "original-owned-stage")
                candidate.mkdir(mode=0o700)
                replacement = self.output / candidate.name / "foreign.txt"
                replacement.write_bytes(b"preserve open replacement")
            return descriptor
        with patch.object(bundle.os, "write", side_effect=fail_output), \
             patch.object(bundle.os, "open", side_effect=replace_after_open), \
             self.assertRaises(bundle.BundleRejected) as caught:
            self.extract(digest)
        self.assertIsNotNone(replacement)
        self.assertEqual(replacement.read_bytes(), b"preserve open replacement")
        self.assertFalse(caught.exception.cleanup)
        self.assertEqual(caught.exception.reason, "archive")


if __name__ == "__main__":
    unittest.main()
