"""Synthetic files only: no dependency installs, build, Electron or native run."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from controller_protocol import ControllerRejected
from product_staging import BUILD_INPUTS, OUTPUTS, digest, inventory, offline_inputs, prepare, receipt_digest, seed_build_home, validate
from session_owner import Deadline


class SyntheticSessionOwner:
    """Only retained ordinary Python children; no host discovery or native CLI."""
    def __init__(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        home = self.root / "home"
        home.mkdir(mode=0o700)
        self.env = {"HOME": str(home), "PATH": "/usr/bin:/bin"}
        self.children = []

    def run(self, arguments, deadline, cwd=None):
        child = subprocess.Popen(arguments, cwd=cwd, env=self.env, stdin=subprocess.DEVNULL,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.children.append(child)
        try:
            code = child.wait(timeout=deadline.remaining())
        except subprocess.TimeoutExpired:
            raise ControllerRejected("deadline") from None
        if code != 0:
            raise ControllerRejected("child")

    def cleanup(self):
        for child in self.children:
            if child.poll() is None:
                child.kill()
            child.wait(timeout=2)
        self.temporary.cleanup()
        return not self.root.exists() and all(child.returncode is not None for child in self.children)


def rust_tools(parent):
    directory = parent / "rust/bin"
    directory.mkdir(parents=True)
    for name in ("cargo", "rustc"):
        path = directory / name
        path.write_text("#!/usr/bin/python3\n# PUBLIC SYNTHETIC TOOL; never a compiler\n")
        path.chmod(0o700)
    return directory


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
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.rust_bin = rust_tools(Path(temporary.name))
        # create=True keeps original-source behavioral controls importable.
        fixed = patch("product_staging.RUST_BIN", self.rust_bin, create=True)
        fixed.start()
        self.addCleanup(fixed.stop)
        owner = patch("product_staging.SessionOwner", SyntheticSessionOwner)
        owner.start()
        self.addCleanup(owner.stop)

    def test_fixed_rust_tools_resolve_and_execute_without_caller_path(self):
        with tempfile.TemporaryDirectory() as temporary, tempfile.TemporaryDirectory() as tools:
            root = Path(temporary)
            build_inputs(root)
            tools = Path(tools)
            node = tools / "node/bin/node"
            node.parent.mkdir(parents=True)
            node.write_text("#!/usr/bin/python3\nimport runpy,sys\nrunpy.run_path(sys.argv[1],run_name='__main__')\n")
            node.chmod(0o700)
            # All candidates are private ordinary files. Never execute any
            # resolved path until it equals our known synthetic cargo exactly.
            for directory in (tools / "ambient", tools / "system"):
                directory.mkdir()
                for name in ("cargo", "rustc"):
                    candidate = directory / name
                    candidate.write_text("#!/usr/bin/python3\nraise AssertionError('POISON TOOL')\n")
                    candidate.chmod(0o700)
            (self.rust_bin / "cargo").write_text(
                "#!/usr/bin/python3\nimport shutil,subprocess\n"
                f"assert shutil.which('rustc') == {str(self.rust_bin / 'rustc')!r}\n"
                f"subprocess.run([{str(self.rust_bin / 'rustc')!r}],check=True)\n"
                "print('PUBLIC SYNTHETIC CARGO')\n")
            (self.rust_bin / "rustc").write_text("#!/usr/bin/python3\nprint('PUBLIC SYNTHETIC RUSTC')\n")
            expected_path = str(node.parent) + ":" + str(self.rust_bin) + ":/usr/bin:/bin"
            script = '''import json,os,pathlib,shutil,subprocess
root=pathlib.Path.cwd()
resolved=shutil.which('cargo')
assert resolved == ''' + repr(str(self.rust_bin / "cargo")) + '''
assert os.environ['PATH'] == ''' + repr(expected_path) + '''
# A private stand-in also proves the fallback candidate loses resolution.
assert shutil.which('cargo',path=str(pathlib.Path(resolved).parent)+':'+''' + repr(str(tools / "system")) + ''') == resolved
result=subprocess.run([resolved],check=True,capture_output=True,text=True)
assert result.stdout == 'PUBLIC SYNTHETIC RUSTC\\nPUBLIC SYNTHETIC CARGO\\n'
(root/'node_modules/rust-observed.json').write_text(json.dumps({'resolved':resolved,'path':os.environ['PATH']}))
for name in ''' + repr(OUTPUTS) + ''':
 p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'PUBLIC SYNTHETIC OUTPUT')
'''
            for name in ("apps/desktop/setup-sqlite.ts", "apps/desktop/build.ts"):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(script)
            try:
                with patch.dict(os.environ, {"PATH": str(tools / "ambient"), "CARGO_HOME": "POISON", "npm_config_nodedir": "POISON"}):
                    try:
                        prepare(root, node, "a" * 40, "b" * 64)
                    except ControllerRejected as error:
                        self.fail(f"synthetic fixed-prefix child rejected: {error}")
                facts = json.loads((root / "node_modules/rust-observed.json").read_text())
                self.assertEqual(facts, {"resolved": str(self.rust_bin / "cargo"), "path": expected_path})
                validate(root, node, receipt_sha256=receipt_digest(root))
            finally:
                root.chmod(0o700)
                for path in root.rglob("*"):
                    if not path.is_symlink():
                        path.chmod(0o700 if path.is_dir() else 0o600)

    def test_invalid_rust_prefix_fails_before_any_build_child(self):
        for fault in ("missing", "symlink", "file", "nonsearchable", "caller-denied"):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as temporary, tempfile.TemporaryDirectory() as tools:
                root = Path(temporary)
                build_inputs(root)
                tools = Path(tools)
                directory = rust_tools(tools)
                if fault in ("missing", "symlink", "file"):
                    shutil.rmtree(directory)
                    if fault == "symlink":
                        directory.symlink_to(self.rust_bin, target_is_directory=True)
                    elif fault == "file":
                        directory.write_text("PUBLIC SYNTHETIC NOT A DIRECTORY")
                elif fault == "nonsearchable":
                    directory.chmod(0o600)
                access = os.access
                def usable(path, mode, **kwargs):
                    self.assertEqual((mode, kwargs), (os.X_OK, {"effective_ids": True}))
                    return False if fault == "caller-denied" and path == directory else access(path, mode, **kwargs)
                try:
                    with patch("product_staging.RUST_BIN", directory, create=True), patch("product_staging.os.access", side_effect=usable), patch("product_staging.SessionOwner") as owner:
                        with self.assertRaisesRegex(ControllerRejected, "^prerequisite$"):
                            prepare(root, Path("/usr/bin/python3"), "a" * 40, "b" * 64)
                        owner.assert_not_called()
                    self.assertFalse((root / "f102-build-receipt.json").exists())
                finally:
                    if fault == "nonsearchable":
                        directory.chmod(0o700)

    def test_invalid_declared_rust_tools_fail_before_any_build_child(self):
        for name in ("cargo", "rustc"):
            for fault in ("missing", "symlink", "directory", "fifo", "nonexecutable", "caller-denied"):
                with self.subTest(name=name, fault=fault), tempfile.TemporaryDirectory() as temporary, tempfile.TemporaryDirectory() as tools:
                    root = Path(temporary)
                    build_inputs(root)
                    directory = rust_tools(Path(tools))
                    tool = directory / name
                    if fault in ("missing", "symlink", "directory", "fifo"):
                        tool.unlink()
                        if fault == "symlink":
                            tool.symlink_to(self.rust_bin / name)
                        elif fault == "directory":
                            tool.mkdir()
                        elif fault == "fifo":
                            os.mkfifo(tool)
                    elif fault == "nonexecutable":
                        tool.chmod(0o600)
                    access = os.access
                    def usable(path, mode, **kwargs):
                        self.assertEqual((mode, kwargs), (os.X_OK, {"effective_ids": True}))
                        return False if fault == "caller-denied" and path == tool else access(path, mode, **kwargs)
                    with patch("product_staging.RUST_BIN", directory, create=True), patch("product_staging.os.access", side_effect=usable), patch("product_staging.SessionOwner") as owner:
                        with self.assertRaisesRegex(ControllerRejected, "^prerequisite$"):
                            prepare(root, Path("/usr/bin/python3"), "a" * 40, "b" * 64)
                        owner.assert_not_called()
                    self.assertFalse((root / "f102-build-receipt.json").exists())

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
                try:
                    prepare(root, Path("/usr/bin/python3"), "a" * 40, "b" * 64)
                except ControllerRejected as error:
                    self.fail(f"synthetic cache/header child rejected: {error}")
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
