"""Adversarial publication, event freshness and transition tests; no native run."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from controller_protocol import ControllerRejected, Report, SPEECH_STEPS, STEPS, decode, publish, snapshot, validate_public
from session_owner import Deadline


def flags(step):
    return {"native": True, "operation": True, "geometry": step != "hide", "completion": False,
            "freshEvent": step in SPEECH_STEPS,
            "generated": step in SPEECH_STEPS, "attempt": step in SPEECH_STEPS}


class ProtocolTests(unittest.TestCase):
    def test_bounded_monotone_event_snapshots_reject_invalid_or_private_data(self):
        good = {"status": "observed", "sequence": 1, "controls": [{"id": "search", "kind": "entry",
                "focused": True, "selected": False, "showing": True, "visible": True}],
                "events": [{"sequence": 1, "event": "focus", "id": "search", "kind": "entry"}]}
        self.assertEqual(snapshot(good), good)
        variants = []
        for key, value in (("name", "private canary"), ("id", []), ("focused", 1), ("kind", "textbox")):
            bad = copy.deepcopy(good)
            bad["controls"][0][key] = value
            variants.append(bad)
        for events in ([good["events"][0]] * 2, [], [{**good["events"][0], "sequence": 2}],
                       [{**good["events"][0], "event": "private canary"}], good["events"] * 65):
            variants.append({**good, "events": events})
        variants.extend(({**good, "sequence": True}, {**good, "controls": good["controls"] * 129},
                         {**good, "sequence": 0, "events": [{**good["events"][0], "sequence": 0}]}))
        for bad in variants:
            with self.subTest(bad=bad), self.assertRaises(ControllerRejected):
                snapshot(bad)
        with self.assertRaises(ControllerRejected):
            snapshot(good, previous=2)

    def test_duplicate_json_fields_truncation_and_size_rejected(self):
        for line in (b'{"status":"observed","status":"ready"}\n', b'{}', b'x' * 65537 + b'\n', b'\xff\n'):
            with self.subTest(length=len(line)), self.assertRaises(ControllerRejected):
                decode(line)

    def test_timeout_never_extends_global_or_step_bound(self):
        now = [10]
        clock = lambda: now[0]
        total = Deadline(12, clock=clock)
        step = Deadline(10, parent=total, clock=clock)
        now[0] = 19
        self.assertEqual(step.remaining(), 1)
        now[0] = 20
        with self.assertRaises(ControllerRejected):
            step.remaining()
        later = Deadline(10, parent=total, clock=clock)
        self.assertEqual(later.remaining(), 2)
        now[0] = 22
        with self.assertRaises(ControllerRejected):
            later.remaining()

    def test_first_failure_survives_cleanup_error_and_blocks_future_steps(self):
        report = Report()
        report.add("search", flags("search"))
        report.fail("deadline", "result")
        report.fail("cleanup", "result")
        with self.assertRaises(ControllerRejected):
            report.add("result", flags("result"))
        value = report.public()
        self.assertEqual((value["firstFailure"], value["failedStep"], value["status"]), ("deadline", "result", "incomplete"))
        validate_public(value)

    def test_partial_failed_checkpoint_keeps_only_fixed_observation_flags(self):
        report = Report()
        pending = report.begin("search")
        pending.update(native=True, freshEvent=True, generated=True)
        report.fail("deadline", "search")
        value = report.public()
        validate_public(value)
        self.assertTrue(value["pending"]["generated"])
        self.assertFalse(value["pending"]["attempt"])
        self.assertFalse(value["pending"]["completion"])
        with self.assertRaises(ControllerRejected):
            report.begin("search")

    def test_incomplete_order_skips_false_checks_and_delivery_claims_cannot_pass(self):
        report = Report()
        for step, values in (("result", flags("result")), ("search", {**flags("search"), "completion": True}),
                             ("search", {**flags("search"), "native": False})):
            with self.subTest(step=step), self.assertRaises(ControllerRejected):
                report.add(step, values)
        for step in STEPS:
            report.add(step, flags(step))
        self.assertEqual(report.public()["status"], "incomplete")
        report.cleaned = True
        report.native_runs = 1
        self.assertEqual(report.public()["status"], "observed-private-sequence")

    def test_publication_refuses_unknown_fields_text_counts_and_overwrite(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / "new"
            report = Report().public()
            variants = [{**report, "error": "private canary"}, {**report, "nativeRuns": True},
                        {**report, "nativeRuns": 42}, {**report, "firstFailure": "private canary"},
                        {**report, "failedStep": []}, {**report, "audible": True},
                        {**report, "status": "observed-private-sequence"}]
            for value in variants:
                with self.subTest(value=value), self.assertRaises(ControllerRejected):
                    publish(directory, value)
                self.assertFalse(directory.exists())
            publish(directory, report)
            original = (directory / "report.json").read_bytes()
            with self.assertRaises(FileExistsError):
                publish(directory, report)
            self.assertEqual((directory / "report.json").read_bytes(), original)
            self.assertNotIn("canary", json.dumps(json.loads(original)))


if __name__ == "__main__":
    unittest.main()
