"""Operational error boundaries with injected adapters, never a native run."""
import json
from pathlib import Path
import signal
import tempfile
import unittest
from unittest.mock import patch

from controller_protocol import ControllerRejected
from orca_output import OutputRejected
import product_controller as controller


class FakeOwner:
    cleaned = 0
    clean_result = True

    def cleanup(self):
        self.cleaned += 1
        return self.clean_result


class FailureTests(unittest.TestCase):
    def setUp(self):
        self.signals = {sig: signal.getsignal(sig) for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP, signal.SIGALRM)}
        self.addCleanup(lambda: [signal.signal(sig, handler) for sig, handler in self.signals.items()])

    def test_each_failure_stops_and_cleans_without_publishing_private_payload(self):
        for error, reason in ((ControllerRejected("deadline"), "deadline"), (OutputRejected("private canary"), "orca"),
                              (RuntimeError("private canary"), "prerequisite"), (KeyboardInterrupt(), "prerequisite")):
            with self.subTest(reason=reason), tempfile.TemporaryDirectory() as temporary:
                owner = FakeOwner()

                def fail(*args):
                    report = args[-1]
                    report.failed_step = "result"
                    raise error

                with patch.object(controller, "preflight"), patch.object(controller, "SessionOwner", return_value=owner), \
                     patch.object(controller, "infrastructure", return_value=(None, None)), \
                     patch.object(controller, "sequence", side_effect=fail) as sequence, patch.object(controller, "validate") as validate:
                    code = controller.run(Path("/unused"), Path("/unused/node"), Path(temporary) / "new", 193)
                self.assertEqual(code, 3)
                self.assertEqual(owner.cleaned, 1)
                self.assertEqual(sequence.call_count, 1)
                validate.assert_not_called()
                data = (Path(temporary) / "new/report.json").read_text()
                self.assertNotIn("canary", data)
                self.assertEqual(json.loads(data)["firstFailure"], reason)
                self.assertEqual(json.loads(data)["steps"], [])

    def test_cleanup_failure_preserves_original_failure_and_cannot_publish_success(self):
        with tempfile.TemporaryDirectory() as temporary:
            owner = FakeOwner()
            owner.clean_result = False
            with patch.object(controller, "preflight"), patch.object(controller, "SessionOwner", return_value=owner), \
                 patch.object(controller, "infrastructure", side_effect=ControllerRejected("child")):
                code = controller.run(Path("/unused"), Path("/unused/node"), Path(temporary) / "new", 193)
            value = json.loads((Path(temporary) / "new/report.json").read_text())
            self.assertEqual(code, 3)
            self.assertEqual((value["firstFailure"], value["cleanup"], value["nativeRuns"]), ("child", False, 0))

    def test_missing_precondition_never_constructs_session_or_starts_product(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(controller, "preflight", side_effect=ControllerRejected("prerequisite")), \
                 patch.object(controller, "SessionOwner") as owner:
                code = controller.run(Path("/unused"), Path("/unused/node"), Path(temporary) / "new", 193)
            owner.assert_not_called()
            value = json.loads((Path(temporary) / "new/report.json").read_text())
            self.assertEqual((code, value["nativeRuns"], value["firstFailure"]), (3, 0, "prerequisite"))


if __name__ == "__main__":
    unittest.main()
