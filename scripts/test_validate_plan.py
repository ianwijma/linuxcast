#!/usr/bin/env python3
"""Meaningful negative checks for the documentation gate, with isolated fixtures."""
import json
import math
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class PlanningFixture(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        for name in ["docs","scripts",".github"]:
            shutil.copytree(ROOT/name,self.root/name,ignore=shutil.ignore_patterns("__pycache__"))
        for path in ROOT.glob("*.md"):
            shutil.copy(path,self.root/path.name)
        shutil.copy(ROOT/"LICENSE",self.root/"LICENSE")
        # Architecture findings link to real spike evidence documents. Keep
        # those link targets in the isolated fixture without copying build
        # trees, dependencies, screenshots or native binaries.
        for path in ROOT.glob("spikes/*/evidence/*.md"):
            target = self.root / path.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(path, target)
        # The live registry acquires real evidence as implementation proceeds.
        # Negative tests must construct their own pending baseline rather than
        # inheriting (or erasing) the coordinator's real completion claims.
        path = self.root / "docs/implementation/tasks.json"
        data = json.loads(path.read_text())
        for task in data["tasks"]:
            task.update(status="planned", evidence=[], limitations=[], owner=None, branch=None)
            for criterion in task["acceptance"]:
                criterion.update(status="pending", evidence=[], justification="")
        path.write_text(json.dumps(data))
        from render_tasks import render_files
        for name, content in render_files(data).items():
            (self.root / name).write_text(content)

    def tearDown(self):
        self.tmp.cleanup()

    def run_gate(self):
        return subprocess.run([sys.executable,str(self.root/"scripts/validate_plan.py")],capture_output=True,text=True)

    def mutate_tasks(self,fn):
        path=self.root/"docs/implementation/tasks.json"
        data=json.loads(path.read_text());fn(data["tasks"])
        path.write_text(json.dumps(data))

class PlanningGateTests(PlanningFixture):
    def test_valid_handoff(self):
        result=self.run_gate()
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_cycle_is_rejected(self):
        self.mutate_tasks(lambda tasks:tasks[0]["dependsOn"].append("R1-03"))
        result=self.run_gate()
        self.assertNotEqual(result.returncode,0)
        self.assertIn("task cycle",result.stdout)

    def test_release_omission_is_rejected(self):
        self.mutate_tasks(lambda tasks:next(t for t in tasks if t["id"]=="R1-01")["dependsOn"].remove("F2-03"))
        result=self.run_gate()
        self.assertNotEqual(result.returncode,0)
        self.assertIn("F2-03: omitted from final release",result.stdout)

    def test_unknown_source_is_rejected(self):
        path=self.root/"docs/product/features.json"
        data=json.loads(path.read_text());data["features"][0]["sourceIds"]=["nonexistent-source"]
        path.write_text(json.dumps(data))
        result=self.run_gate()
        self.assertNotEqual(result.returncode,0)
        self.assertIn("unknown source nonexistent-source",result.stdout)

    def test_missing_local_reference_is_rejected(self):
        with (self.root/"docs/PLAN.md").open("a") as file:
            file.write("\n[broken](missing-spec.md)\n")
        result=self.run_gate()
        self.assertNotEqual(result.returncode,0)
        self.assertIn("missing local reference missing-spec.md",result.stdout)

    def test_done_requires_evidence(self):
        self.mutate_tasks(lambda tasks:tasks[0].update(status="done"))
        result=self.run_gate()
        self.assertNotEqual(result.returncode,0)
        self.assertIn("done without evidence",result.stdout)

    def mutate_tokens(self,fn):
        path=self.root/"docs/design/tokens.json"
        data=json.loads(path.read_text());fn(data)
        path.write_text(json.dumps(data))

    def assert_token_rejection(self,fn,message):
        self.mutate_tokens(fn)
        result=self.run_gate()
        self.assertNotEqual(result.returncode,0)
        self.assertIn(message,result.stdout)

    def test_token_extra_theme_role_is_rejected(self):
        self.assert_token_rejection(lambda t:t["themes"]["dark"].update(brandGlow="#FF00FF"),"tokens dark: semantic colour roles differ ['brandGlow']")

    def test_token_missing_instrument_role_is_rejected(self):
        self.assert_token_rejection(lambda t:t["themes"]["light"].pop("controlBorder"),"tokens light: semantic colour roles differ ['controlBorder']")

    def test_token_alpha_is_limited_to_scrim(self):
        self.assert_token_rejection(lambda t:t["themes"]["dark"].update(surface="#1C1D2280"),"invalid hex #1C1D2280 for surface")

    def test_token_scrim_requires_alpha(self):
        self.assert_token_rejection(lambda t:t["themes"]["light"].update(scrim="#1C1D24"),"invalid hex #1C1D24 for scrim")

    def test_token_unknown_glyph_category_is_rejected(self):
        self.assert_token_rejection(lambda t:t["glyphTiles"].update(custom="#123456"),"tokens glyphTiles: keys differ")

    def test_token_ratio_bounds_are_enforced(self):
        self.assert_token_rejection(lambda t:t["ratio"].update(listDetail=0.9),"tokens ratio.listDetail: outside min/max")

    def test_token_raw_shadow_string_is_rejected(self):
        self.assert_token_rejection(lambda t:t["elevation"]["dark"].update(shell="0 0 4px red"),"tokens elevation.dark.shell: expected 1-4 layers")

    def test_token_unsafe_font_stack_is_rejected(self):
        self.assert_token_rejection(lambda t:t["font"].update(ui="Inter; } body { display: none"),"tokens font.ui: unsafe value")

    def test_token_reviewer_numeric_examples_are_rejected_by_gate(self):
        for mutate,message in [
            (lambda t:t["layout"].update(rowHeight=0),"tokens layout.rowHeight: expected integer 1-4096"),
            (lambda t:t["fontSize"].update(body=0),"tokens fontSize.body: expected integer 8-64"),
            (lambda t:t["motion"].update(stateMs="bogus"),"tokens motion.stateMs: expected integer 1-400"),
            (lambda t:t["motion"].update(stateMs=-100),"tokens motion.stateMs: expected integer 1-400"),
            (lambda t:t["ratio"].update(listDetailStep=0.5),"tokens ratio.listDetailStep: too large"),
            (lambda t:t["elevation"]["dark"]["shell"][1].update(blur=999),"tokens elevation.dark.shell[1].blur: expected integer 0-96"),
        ]:
            with self.subTest(message=message):
                path=self.root/"docs/design/tokens.json"
                original=path.read_text()
                try:self.assert_token_rejection(mutate,message)
                finally:path.write_text(original)

    def test_token_unknown_group_is_rejected(self):
        self.assert_token_rejection(lambda t:t.update(gradients={}),"tokens top level: keys differ")

NONFINITE={"NaN":float("nan"),"Infinity":float("inf"),"-Infinity":float("-inf")}
def decode_case_value(value):
    """Explicit data decoding only: {"$nonfinite": "NaN"} becomes a float. Nothing is evaluated."""
    if isinstance(value,list):return [decode_case_value(v) for v in value]
    if isinstance(value,dict):
        if set(value)=={"$nonfinite"}:
            marker=value["$nonfinite"]
            if marker not in NONFINITE:raise ValueError(f"unknown non-finite marker {marker!r}")
            return NONFINITE[marker]
        return {k:decode_case_value(v) for k,v in value.items()}
    return value

class SharedTokenSchemaCases(unittest.TestCase):
    """Parity with validateTokens: tokens.test.ts runs the same shared cases."""
    def test_shared_cases_match_expected_validity(self):
        import copy
        sys.path.insert(0,str(ROOT/"scripts"))
        from validate_plan import token_errors
        canonical=json.loads((ROOT/"docs/design/tokens.json").read_text())
        cases=json.loads((ROOT/"packages/ui/src/tokens/schema-cases.json").read_text())["cases"]
        self.assertGreaterEqual(sum(c["valid"] for c in cases),10)
        self.assertGreaterEqual(sum(not c["valid"] for c in cases),50)
        for case in cases:
            with self.subTest(case=case["name"]):
                candidate=copy.deepcopy(canonical)
                for mutation in case["mutations"]:
                    *parents,last=mutation["path"]
                    node=candidate
                    for key in parents:node=node[key]
                    if mutation["op"]=="delete":del node[last]
                    else:node[last]=decode_case_value(mutation["value"])
                errors=token_errors(candidate)
                if case["valid"]:self.assertEqual(errors,[])
                else:self.assertTrue(errors,"accepted an invalid token contract")

    def test_planning_gate_rejects_nonfinite_literal_in_tokens_file(self):
        # json accepts NaN/Infinity literals; the gate must still reject them.
        sys.path.insert(0,str(ROOT/"scripts"))
        from validate_plan import token_errors
        candidate=json.loads((ROOT/"docs/design/tokens.json").read_text().replace('"rowHeight": 40','"rowHeight": NaN',1))
        self.assertTrue(math.isnan(candidate["layout"]["rowHeight"]))
        self.assertTrue(token_errors(candidate))

if __name__=="__main__":
    # Keep the established CI entry point while including all planning regressions.
    unittest.main(module=None, argv=[sys.argv[0], "discover", "-s", str(ROOT / "scripts"), "-p", "test_*.py"])
