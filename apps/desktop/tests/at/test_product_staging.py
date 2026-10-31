"""Synthetic files only: no dependency installs, build, Electron or native run."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from controller_protocol import ControllerRejected
from product_staging import BUILD_INPUTS, OUTPUTS, digest, inventory, offline_inputs, prepare, receipt_digest, seed_build_home, validate
from session_owner import Deadline


def build_inputs(root):
    inputs = root / BUILD_INPUTS
    files = {}
    for name in (".cargo/registry/public-fixture", ".electron-gyp/45.0.0/include/node/node.h",
                 ".electron-gyp/45.0.0/include/node/config.gypi", ".electron-gyp/45.0.0/include/node/common.gypi"):
        path = inputs / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("PUBLIC SYNTHETIC CACHE FIXTURE")
        files[name] = {"sha256": digest(path), "executable": False}
    (inputs / "manifest.json").write_text(json.dumps({"schema": 1, "rustVersion": "1.95.0", "electronVersion": "45.0.0", "files": files}))
    for path in inputs.rglob("*"):
        path.chmod(0o500 if path.is_dir() else 0o400)
    inputs.chmod(0o500)
    return inputs


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
            with self.subTest(addition=addition), tempfile.TemporaryDirectory() as temporary, tempfile.TemporaryDirectory() as owner_temporary:
                root = Path(temporary)
                build_inputs(root)
                home = Path(owner_temporary) / "home"
                home.mkdir(mode=0o700)
                (root / "apps/desktop").mkdir(parents=True)
                node = root / "node"
                node.write_bytes(b"synthetic node")

                class BuildFixture:
                    env = {"HOME": str(home)}
                    root = Path(owner_temporary)

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

    def test_private_build_profile_receives_only_pinned_public_offline_inputs(self):
        """Real ordinary Python stand-ins; no Node, compiler or product build."""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            build_inputs(root)
            script = '''import json,os,pathlib,sys
root=pathlib.Path.cwd();home=pathlib.Path(os.environ['HOME'])
facts={'cargoCache':(home/'.cargo/registry/public-fixture').is_file(),'headers':(home/'.electron-gyp/45.0.0/include/node/node.h').is_file(),'offline':os.environ.get('CARGO_NET_OFFLINE')=='true' and os.environ.get('npm_config_offline')=='true','cargoHome':os.environ.get('CARGO_HOME')==str(home/'.cargo'),'nodeDir':os.environ.get('npm_config_nodedir')==str(home/'.electron-gyp/45.0.0')}
(root/'node_modules/observed.json').write_text(json.dumps(facts))
if not all(facts.values()):sys.exit(42)
for name in ''' + repr(OUTPUTS) + ''':
 p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'PUBLIC SYNTHETIC OUTPUT')
'''
            for name in ("apps/desktop/setup-sqlite.ts", "apps/desktop/build.ts"):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(script)
            try:
                # The ordinary Python runtime executes synthetic fixture text;
                # none of these files is production TypeScript or a real build.
                prepare(root, Path("/usr/bin/python3"), "a" * 40, "b" * 64)
                facts = json.loads((root / "node_modules/observed.json").read_text())
                self.assertTrue(all(facts.values()))
                receipt = validate(root, Path("/usr/bin/python3"), receipt_sha256=receipt_digest(root))
                self.assertIn(BUILD_INPUTS + "/manifest.json", receipt["files"])
                self.assertFalse(any("linuxcast-f102-at-" in name for name in receipt["files"]))
            finally:
                root.chmod(0o700)
                for path in root.rglob("*"):
                    if not path.is_symlink():
                        path.chmod(0o700 if path.is_dir() else 0o600)

    def test_missing_mutable_or_unpinned_inputs_fail_before_any_child(self):
        for fault in ("missing", "mutable", "bad-hash", "unknown", "credentials", "numeric-executable", "duplicate"):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                if fault != "missing":
                    inputs = build_inputs(root)
                    manifest = inputs / "manifest.json"
                    value = json.loads(manifest.read_text())
                    name = next(iter(value["files"]))
                    if fault == "mutable":
                        (inputs / name).chmod(0o600)
                    elif fault == "bad-hash":
                        value["files"][name]["sha256"] = "0" * 64
                    elif fault == "unknown":
                        value["unexpected"] = True
                    elif fault == "numeric-executable":
                        value["files"][name]["executable"] = 0
                    elif fault == "credentials":
                        directory = inputs / ".cargo"
                        directory.chmod(0o700)
                        (directory / "credentials.toml").write_text("PUBLIC SYNTHETIC REFUSAL FIXTURE")
                        (directory / "credentials.toml").chmod(0o400)
                        directory.chmod(0o500)
                    manifest.chmod(0o600)
                    manifest.write_text(json.dumps(value) if fault != "duplicate" else '{"schema":1,"schema":1}')
                    manifest.chmod(0o400)
                with patch("product_staging.SessionOwner") as owner:
                    with self.assertRaises(ControllerRejected):
                        prepare(root, Path("/usr/bin/python3"), "a" * 40, "b" * 64)
                    owner.assert_not_called()
                self.assertFalse((root / "f102-build-receipt.json").exists())

    def test_cache_aliases_and_source_mutation_cannot_seed_a_profile(self):
        for fault in ("symlink", "hardlink", "source-mutation"):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as temporary, tempfile.TemporaryDirectory() as profile:
                root = Path(temporary)
                inputs = build_inputs(root)
                name = ".cargo/registry/public-fixture"
                path = inputs / name
                if fault in ("symlink", "hardlink"):
                    directory = path.parent
                    directory.chmod(0o700)
                    alias = directory / "alias"
                    if fault == "symlink":
                        alias.symlink_to("public-fixture")
                    else:
                        alias.hardlink_to(path)
                    directory.chmod(0o500)
                    with self.assertRaises(ControllerRejected):
                        offline_inputs(root, Deadline(10))
                else:
                    source, files, _ = offline_inputs(root, Deadline(10))
                    path.chmod(0o600)
                    path.write_text("DIFFERENT PUBLIC SYNTHETIC INPUT")
                    path.chmod(0o400)
                    home = Path(profile) / "home"
                    home.mkdir(mode=0o700)
                    class Profile:
                        env = {"HOME": str(home)}
                        root = Path(profile)
                    with self.assertRaises(ControllerRejected):
                        seed_build_home(Profile(), source, files, Deadline(10))

    def test_build_cannot_mutate_offline_cache_inside_otherwise_mutable_dependencies(self):
        with tempfile.TemporaryDirectory() as temporary, tempfile.TemporaryDirectory() as profile:
            root = Path(temporary)
            # These are source directories, not generated output. Keep them in
            # the before snapshot so only the intended cache guard can reject.
            (root / "apps/desktop").mkdir(parents=True)
            inputs = build_inputs(root)
            home = Path(profile) / "home"
            home.mkdir(mode=0o700)
            class MutatingBuild:
                env = {"HOME": str(home)}
                root = Path(profile)

                def run(self, *args, **kwargs):
                    path = inputs / ".cargo/registry/public-fixture"
                    path.chmod(0o600)
                    path.write_text("MUTATED PUBLIC SYNTHETIC CACHE")
                    path.chmod(0o400)
                    for name in OUTPUTS:
                        output = root / name
                        output.parent.mkdir(parents=True, exist_ok=True)
                        output.write_bytes(b"PUBLIC SYNTHETIC OUTPUT")

                def cleanup(self):
                    return True

            with patch("product_staging.SessionOwner", return_value=MutatingBuild()):
                with self.assertRaises(ControllerRejected):
                    prepare(root, Path("/usr/bin/python3"), "a" * 40, "b" * 64)
            self.assertFalse((root / "f102-build-receipt.json").exists())

    def test_build_cannot_hide_a_file_or_symlink_behind_the_outer_receipt_name(self):
        for kind in ("file", "symlink"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                build_inputs(root)
                script = '''import pathlib
root=pathlib.Path.cwd();cache=root/''' + repr(BUILD_INPUTS) + '''
cache.chmod(0o700);extra=cache/'f102-build-receipt.json'
if not extra.exists():
 if ''' + repr(kind) + '''=='file':extra.write_text('PUBLIC SYNTHETIC UNPINNED ADDITION');extra.chmod(0o400)
 else:extra.symlink_to('.cargo/registry/public-fixture')
cache.chmod(0o500)
for name in ''' + repr(OUTPUTS) + ''':
 p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'PUBLIC SYNTHETIC OUTPUT')
'''
                for name in ("apps/desktop/setup-sqlite.ts", "apps/desktop/build.ts"):
                    path = root / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(script)
                with self.assertRaises(ControllerRejected):
                    # Only the ordinary Python interpreter and fixture text run.
                    prepare(root, Path("/usr/bin/python3"), "a" * 40, "b" * 64)
                self.assertTrue((root / BUILD_INPUTS / "f102-build-receipt.json").exists())
                self.assertFalse((root / "f102-build-receipt.json").exists())

    def test_short_cache_copy_writes_are_completed_but_zero_write_fails(self):
        import os
        for zero in (False, True):
            with self.subTest(zero=zero), tempfile.TemporaryDirectory() as temporary, tempfile.TemporaryDirectory() as profile:
                root = Path(temporary)
                build_inputs(root)
                source, files, _ = offline_inputs(root, Deadline(10))
                home = Path(profile) / "home"
                home.mkdir(mode=0o700)
                class Profile:
                    env = {"HOME": str(home)}
                    root = Path(profile)
                write = os.write
                def short(descriptor, data):
                    return 0 if zero else write(descriptor, data[:3])
                with patch("product_staging.os.write", side_effect=short):
                    if zero:
                        with self.assertRaises(ControllerRejected):
                            seed_build_home(Profile(), source, files, Deadline(10))
                    else:
                        seed_build_home(Profile(), source, files, Deadline(10))
                        self.assertEqual((home / ".cargo/registry/public-fixture").read_text(), "PUBLIC SYNTHETIC CACHE FIXTURE")


if __name__ == "__main__":
    unittest.main()
