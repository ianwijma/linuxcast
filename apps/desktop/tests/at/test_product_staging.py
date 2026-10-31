"""Synthetic files only: no dependency installs, build, Electron or native run."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from controller_protocol import ControllerRejected
from product_staging import OUTPUTS, digest, inventory, prepare, receipt_digest, validate


class StagingTests(unittest.TestCase):
    def test_external_dependency_symlink_is_not_product_provenance(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "electron").symlink_to("/usr/bin/true")
            with self.assertRaises(ControllerRejected):
                inventory(root)

    def test_outside_hardlinks_cannot_be_frozen_but_internal_build_links_are_valid(self):
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary)
            root = parent / "staging"
            root.mkdir()
            outside = parent / "outside-cache-file"
            outside.write_text("public cache fixture")
            alias = root / "alias"
            alias.hardlink_to(outside)
            with self.assertRaises(ControllerRejected):
                inventory(root)
            alias.unlink()
            first = root / "internal-artifact"
            first.write_text("public generated fixture")
            alias.hardlink_to(first)
            result = inventory(root)
            self.assertEqual(result["alias"], result["internal-artifact"])

    def test_partial_old_build_is_rejected_before_any_build_process(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "apps/desktop/dist").mkdir(parents=True)
            with self.assertRaises(ControllerRejected):
                prepare(root, Path("/nonexistent-test-node"), "a" * 40, "b" * 64)

    def test_receipt_detects_modified_build_and_writable_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            try:
                node = root / "node"
                node.write_bytes(b"synthetic node fixture")
                for name in OUTPUTS:
                    path = root / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(b"synthetic build fixture")
                receipt = {"schema": 1, "sourceTree": "a" * 40, "archiveSha256": "b" * 64,
                           "nodeSha256": digest(node), "files": inventory(root)}
                path = root / "f102-build-receipt.json"
                path.write_text(json.dumps(receipt))
                pin = receipt_digest(root)
                for p in root.rglob("*"):
                    p.chmod(0o500 if p.is_dir() else 0o400)
                root.chmod(0o500)
                self.assertEqual(validate(root, node, receipt_sha256=pin), receipt)
                path.chmod(0o600)
                path.write_text(json.dumps({**receipt, "archiveSha256": "c" * 64}))
                path.chmod(0o400)
                with self.assertRaises(ControllerRejected):
                    validate(root, node, receipt_sha256=pin)
                path.chmod(0o600)
                path.write_text(json.dumps(receipt))
                path.chmod(0o400)
                product = root / OUTPUTS[0]
                product.chmod(0o600)
                with self.assertRaises(ControllerRejected):
                    validate(root, node, receipt_sha256=pin)
                product.write_bytes(b"foreign artifact")
                product.chmod(0o400)
                with self.assertRaises(ControllerRejected):
                    validate(root, node, receipt_sha256=pin)
            finally:
                root.chmod(0o700)
                for p in root.rglob("*"):
                    p.chmod(0o700 if p.is_dir() else 0o600)

    def test_receipt_symlink_alias_and_hardlink_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            alias = root / "receipt-alias"
            alias.symlink_to("f102-build-receipt.json")
            with self.assertRaises(ControllerRejected):
                inventory(root)
            alias.unlink()
            receipt = root / "f102-build-receipt.json"
            receipt.write_text('{"schema":1}')
            alias.hardlink_to(receipt)
            with self.assertRaises(ControllerRejected):
                receipt_digest(root)

    def test_build_rejects_added_source_files_and_directories(self):
        for addition in ("unreviewed-source.ts", "new-source-directory"):
            with self.subTest(addition=addition), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                (root / "apps/desktop").mkdir(parents=True)
                node = root / "node"
                node.write_bytes(b"synthetic node")

                class BuildFixture:
                    env = {}

                    def run(self, *args, **kwargs):
                        for name in OUTPUTS:
                            path = root / name
                            path.parent.mkdir(parents=True, exist_ok=True)
                            path.write_bytes(b"synthetic generated output")
                        target = root / addition
                        if addition.endswith(".ts"):
                            target.write_text("// unreviewed synthetic addition")
                        else:
                            target.mkdir(exist_ok=True)

                    def cleanup(self):
                        return True

                with patch("product_staging.SessionOwner", return_value=BuildFixture()):
                    with self.assertRaises(ControllerRejected):
                        prepare(root, node, "a" * 40, "b" * 64)
                self.assertFalse((root / "f102-build-receipt.json").exists())


if __name__ == "__main__":
    unittest.main()
