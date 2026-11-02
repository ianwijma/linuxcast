"""Private synthetic source controls; no real toolchain or lab execution.

Run from the repository root with python3 -B. Git reads source as data; every
prepare fixture patches the fixed directory to its own ordinary private tools.
No resolved cargo is executed until it equals the known private fake exactly.
"""
import ast
import io
import json
from pathlib import Path
import subprocess
import sys
import types
import unittest
from unittest.mock import patch

BASE = "89feb36f58c37ccd5fc170ab64196db2df49c9c5"
AT = Path("apps/desktop/tests/at")
SOURCE = str(AT / "product_staging.py")
sys.path.insert(0, str(AT.resolve()))
CURRENT = Path(SOURCE).read_text()
TESTS = (AT / "test_product_staging.py").read_text()
NEW = (
    "test_fixed_rust_tools_resolve_and_execute_without_caller_path",
    "test_invalid_rust_prefix_fails_before_any_build_child",
    "test_invalid_declared_rust_tools_fail_before_any_build_child",
)


def historical(revision):
    return subprocess.run(["git", "show", revision + ":" + SOURCE], check=True,
                          capture_output=True, text=True).stdout


def run(label, source, names=None, expected_failures=0, cache_compat=False):
    module = types.ModuleType("product_staging")
    exec(compile(source, SOURCE, "exec"), module.__dict__)
    if cache_compat:
        # bbbe813 predates the test helper imports. Supply unused helper names
        # only to load today's harness; its actual prepare is byte-intact.
        helpers = types.ModuleType("synthetic_cache_helpers")
        exec(compile(historical(BASE), SOURCE, "exec"), helpers.__dict__)
        for name in ("BUILD_INPUTS", "offline_inputs", "seed_build_home"):
            assert not hasattr(module, name)
            setattr(module, name, getattr(helpers, name))
    tests = types.ModuleType("synthetic_staging_tests")
    with patch.dict(sys.modules, {"product_staging": module}):
        exec(compile(TESTS, str(AT / "test_product_staging.py"), "exec"), tests.__dict__)
        case = tests.StagingTests
        names = names if names is not None else unittest.defaultTestLoader.getTestCaseNames(case)
        suite = unittest.TestSuite(case(name) for name in names)
        result = unittest.TextTestRunner(stream=io.StringIO()).run(suite)
    value = {"control": label, "tests": result.testsRun, "failures": len(result.failures),
             "errors": len(result.errors), "skips": len(result.skipped)}
    print(json.dumps(value, sort_keys=True))
    assert value["failures"] == expected_failures and not result.errors and not result.skipped, value


if __name__ == "__main__":
    baseline = historical(BASE)
    # Prove import inert even when fixed-path probing/spawning is forbidden.
    code = compile(CURRENT, SOURCE, "exec")
    with patch("pathlib.Path.lstat", side_effect=AssertionError("import probed files")), \
            patch("os.access", side_effect=AssertionError("import probed usability")), \
            patch("subprocess.Popen", side_effect=AssertionError("import spawned child")):
        scope = {"__name__": "inert_staging"}
        exec(code, scope)
    assert str(scope["RUST_BIN"]) == "/opt/linuxcast-f102-lab/rust/bin"
    # Removing exactly this bounded increment must restore the frozen source.
    tree = ast.parse(CURRENT)
    tree.body = [n for n in tree.body if not (
        isinstance(n, ast.FunctionDef) and n.name == "require_rust_tools"
        or isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "RUST_BIN" for t in n.targets))]
    prepare = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "prepare")
    prepare.body = [n for n in prepare.body if not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Call)
                    and isinstance(n.value.func, ast.Name) and n.value.func.id == "require_rust_tools")]
    original = ast.parse(baseline)
    old_prepare = next(n for n in original.body if isinstance(n, ast.FunctionDef) and n.name == "prepare")
    def path_update(body):
        return next(n for n in body if isinstance(n, ast.Expr) and isinstance(n.value, ast.Call)
                    and isinstance(n.value.func, ast.Attribute) and n.value.func.attr == "update")
    new_path = path_update(prepare.body)
    prepare.body[prepare.body.index(new_path)] = path_update(old_prepare.body)
    assert ast.dump(tree, include_attributes=False) == ast.dump(original, include_attributes=False)
    print(json.dumps({"importInert": True, "reversedIncrementAstEqualsBase": True}))

    run("exact-base-new-routing", baseline, NEW, 18)
    old_names = [n.name for n in ast.walk(ast.parse(TESTS))
                 if isinstance(n, ast.FunctionDef) and n.name.startswith("test_") and n.name not in NEW]
    run("exact-base-original-12", baseline, old_names)
    run("current-all-staging", CURRENT)
    run("old-cache-routing-bbbe813", historical("bbbe8137105c0973e0f8a3a9ad8cca7e73a21937"),
        ["test_private_build_profile_receives_only_pinned_public_offline_inputs"], 1, cache_compat=True)
    run("old-cache-receipt-alias-2312fbd", historical("2312fbd"),
        ["test_build_cannot_hide_a_file_or_symlink_behind_the_outer_receipt_name"], 2)
    guard = '    if offline_inputs(staging, total)[2] != input_inventory:\n        raise ControllerRejected("prerequisite")\n'
    assert CURRENT.count(guard) == 1
    run("removed-postbuild-cache-guard", CURRENT.replace(guard, ""),
        ["test_build_cannot_mutate_offline_cache_inside_otherwise_mutable_dependencies"], 1)
    source_guard = ('    if any(before.get(name) != after.get(name) for name in before.keys() | after.keys()\n'
                    '           if not rebuild_location(name)):\n        raise ControllerRejected("prerequisite")\n')
    assert CURRENT.count(source_guard) == 1
    run("removed-source-addition-guard", CURRENT.replace(source_guard, ""),
        ["test_build_rejects_added_source_files_and_directories"], 2)
    run("removed-usability-check", CURRENT.replace(' or not os.access(path, os.X_OK, effective_ids=True)', ''),
        NEW[1:], 3)
    run("removed-rust-path-routing", CURRENT.replace(' + ":" + str(RUST_BIN)', ''), NEW[:1], 1)
