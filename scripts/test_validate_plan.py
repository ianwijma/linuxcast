#!/usr/bin/env python3
"""Meaningful negative checks for the documentation gate, with isolated fixtures."""
import json
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

if __name__=="__main__":
    # Keep the established CI entry point while including all planning regressions.
    unittest.main(module=None, argv=[sys.argv[0], "discover", "-s", str(ROOT / "scripts"), "-p", "test_*.py"])
