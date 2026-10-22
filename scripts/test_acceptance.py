#!/usr/bin/env python3
"""Acceptance claims must survive regeneration without acquiring invented passes."""
import copy
import json
import subprocess
import sys
import unittest

from acceptance import validate_registry
from render_tasks import render_files
from test_validate_plan import PlanningFixture


EVIDENCE = {
    "command": "test fixture command",
    "outcome": "Synthetic passing evidence for validator tests only.",
    "platform": "Synthetic test platform; no desktop acceptance claim.",
    "reference": "scripts/test_acceptance.py",
}


class AcceptanceTests(PlanningFixture):
    def setUp(self):
        super().setUp()
        self.path = self.root / "docs/implementation/tasks.json"
        self.data = json.loads(self.path.read_text())
        self.task = self.data["tasks"][0]
        self.criterion = self.task["acceptance"][0]

    def save(self):
        self.path.write_text(json.dumps(self.data))

    def run_script(self, name):
        self.save()
        return subprocess.run([sys.executable, str(self.root / "scripts" / name)],
                              capture_output=True, text=True)

    def assert_invalid(self, message):
        self.save()
        for name in ("validate_plan.py", "render_tasks.py", "plan_status.py"):
            with self.subTest(script=name):
                result = self.run_script(name)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("Traceback", result.stderr)
                self.assertIn(message, result.stdout)

    def mark_passed(self, criterion):
        criterion.update(status="passed", evidence=[copy.deepcopy(EVIDENCE)])

    def test_pass_needs_nonempty_structured_evidence(self):
        self.criterion["status"] = "passed"
        self.assert_invalid("passed without evidence")
        for value in ([{}], ["passed"], [{**EVIDENCE, "outcome": " "}], [True]):
            with self.subTest(evidence=value):
                self.criterion["evidence"] = value
                self.assert_invalid("evidence needs command, outcome, platform and reference")

    def test_done_does_not_infer_individual_success(self):
        self.task.update(status="done", evidence=["Integration reference for synthetic fixture"])
        self.assert_invalid("outstanding acceptance F1-01-AC01")

    def test_done_rejects_every_outstanding_status(self):
        for criterion in self.task["acceptance"]:
            self.mark_passed(criterion)
        self.task.update(status="done", evidence=["Synthetic integration record"])
        for state in ("pending", "failed", "blocked"):
            with self.subTest(state=state):
                self.criterion.update(status=state, justification="Synthetic outstanding requirement")
                self.assert_invalid("outstanding acceptance F1-01-AC01")

    def test_not_applicable_requires_a_condition_and_justification(self):
        self.criterion.update(status="not-applicable", justification="No test platform")
        self.assert_invalid("unconditional requirement cannot be not-applicable")
        self.criterion.update(status="pending", justification="")
        ui = next(c for c in self.task["acceptance"] if c["id"].endswith("-UI"))
        ui["status"] = "not-applicable"
        self.assert_invalid("not-applicable requires justification")

    def test_conditional_result_is_distinct_and_done_is_valid(self):
        for criterion in self.task["acceptance"]:
            self.mark_passed(criterion)
        ui = next(c for c in self.task["acceptance"] if c["id"].endswith("-UI"))
        ui.update(status="not-applicable", evidence=[], justification="Build tooling only; no user-facing change.")
        self.task.update(status="done", evidence=["Synthetic PR/commit record"])
        result = self.run_script("render_tasks.py")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        card = (self.root / "docs/implementation/tasks/F1-01.md").read_text()
        self.assertIn("- **NOT APPLICABLE** `F1-01-UI`", card)
        self.assertIn(ui["justification"], card)
        self.assertEqual(card.count("- [x]"), 3)
        result = self.run_gate()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        result = self.run_script("plan_status.py")
        self.assertIn("S0-01: Prove launcher", result.stdout)

    def test_regeneration_preserves_ids_wording_states_and_evidence(self):
        self.mark_passed(self.criterion)
        self.task["acceptance"][1].update(status="blocked", justification="Awaiting external check")
        self.task["limitations"] = ["Awaiting target desktop validation"]
        self.task["evidence"] = ["Real evidence belongs here; this is a synthetic fixture"]
        # Reordering does not assign new IDs or transfer evidence to other text.
        self.task["acceptance"].reverse()
        expected = copy.deepcopy(self.data)
        for _ in range(2):
            result = self.run_script("render_tasks.py")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(json.loads(self.path.read_text()), expected)
            files = {p: (self.root / p).read_text() for p in render_files(self.data)}
            self.assertEqual(files, render_files(expected))
        card = files["docs/implementation/tasks/F1-01.md"]
        self.assertIn("- [x] **passed** `F1-01-AC01`", card)
        self.assertIn("- [ ] **blocked** `F1-01-AC02`", card)
        for value in EVIDENCE.values():
            self.assertIn(value, card)
        self.assertIn(self.task["limitations"][0], card)
        self.assertIn(self.task["evidence"][0], card)

    def test_failed_and_blocked_need_reason(self):
        for state in ("failed", "blocked"):
            with self.subTest(state=state):
                self.criterion["status"] = state
                self.assert_invalid(f"{state} requires justification")

    def test_duplicate_and_foreign_criterion_ids_are_rejected(self):
        self.task["acceptance"].append(copy.deepcopy(self.criterion))
        self.assert_invalid("duplicate ID")
        self.task["acceptance"].pop()
        self.criterion["id"] = "R1-03-AC01"
        self.assert_invalid("invalid criterion ID")

    def test_shared_criteria_cannot_be_omitted_or_reworded_locally(self):
        shared = self.task["acceptance"].pop()
        self.assert_invalid("missing shared acceptance")
        self.task["acceptance"].append(shared)
        shared["text"] = "Ignore privacy"
        self.assert_invalid("differs from shared text")

    def test_manual_checkbox_and_stale_card_are_rejected(self):
        path = self.root / "docs/implementation/tasks/F1-01.md"
        path.write_text(path.read_text().replace("- [ ]", "- [x]", 1))
        result = self.run_gate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("stale generated file", result.stdout)

    def test_done_with_unfinished_dependency_is_rejected(self):
        task = self.data["tasks"][1]
        for criterion in task["acceptance"]:
            self.mark_passed(criterion)
        task.update(status="done", evidence=["Synthetic integration record"])
        self.assert_invalid("done with unfinished prerequisites")

    def test_invalid_schema_and_old_string_criteria_are_rejected(self):
        self.data["schemaVersion"] = 1
        self.assert_invalid("expected schemaVersion 2")
        self.data["schemaVersion"] = 2
        self.task["acceptance"] = ["Legacy text"]
        self.assert_invalid("acceptance must contain records")

    def test_unknown_status_is_rejected(self):
        for state in ("done", "skipped", "", None, []):
            with self.subTest(state=state):
                self.criterion["status"] = state
                self.assert_invalid("invalid verification status")

    def test_missing_shared_definitions_are_rejected(self):
        self.data["sharedAcceptance"] = []
        self.assert_invalid("missing shared acceptance definitions")

    def test_empty_or_malformed_registry_returns_diagnostics(self):
        for data in (None, [], {}, {"schemaVersion": 2, "sharedAcceptance": [None]}):
            self.assertTrue(validate_registry(data))


if __name__ == "__main__":
    unittest.main()
