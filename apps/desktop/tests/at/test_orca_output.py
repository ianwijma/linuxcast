"""Synthetic source-shaped records only. No reader/display/bus/input."""
from pathlib import Path
import tempfile
import unittest

from orca_output import FreshOutput, MAX_LINE, MAX_LOG, MAX_SLICE, OutputRejected

VOICE = "{'rate': 50, 'gain': 10.0, 'average-pitch': 5.0}"
GENERATED = f"12:00:00.123456 - SPEECH OUTPUT: 'Search commands' {VOICE}\n".encode()
ATTEMPT = b'12:00:00.123457 - SPEECH DISPATCHER: Speaking \'<speak><mark name="0:6"/>Search <mark name="7:15"/>commands</speak>\' \n'


class FreshOrcaTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "private.log"
        self.path.touch(mode=0o600)
        self.parser = FreshOutput(self.path)

    def append(self, data):
        with self.path.open("ab") as stream:
            stream.write(data)

    def test_stale_startup_records_cannot_satisfy_fresh_checkpoint(self):
        self.append(GENERATED + ATTEMPT)
        self.parser.arm("search")
        self.assertEqual(self.parser.observe(), {"generated": False, "attempt": False, "completion": False, "completeLines": True})
        self.append(GENERATED + ATTEMPT)
        self.assertEqual(self.parser.observe(), {"generated": True, "attempt": True, "completion": False, "completeLines": True})

    def test_pre_send_diagnostics_never_become_receipts(self):
        self.parser.arm("search")
        self.append(GENERATED + b"SPEECH DISPATCHER: Speaking 'Search commands' as string\n")
        self.assertTrue(self.parser.observe()["generated"])
        self.assertFalse(self.parser.observe()["attempt"])
        self.append(ATTEMPT)
        self.assertTrue(self.parser.observe()["attempt"])
        self.assertFalse(self.parser.observe()["completion"])

    def test_attempt_before_generation_and_duplicate_requests_are_rejected(self):
        for data in (ATTEMPT + GENERATED, GENERATED * 2 + ATTEMPT, GENERATED + ATTEMPT * 2):
            with self.subTest(data=data):
                self.path.write_bytes(b"")
                parser = FreshOutput(self.path)
                parser.arm("search")
                self.append(data)
                with self.assertRaises(OutputRejected):
                    parser.observe()

    def test_suffix_foreign_private_and_malformed_speech_fail_closed(self):
        for content in (b"private canary Search commands", b"Search commands private canary", b"Search commands' injected '"):
            for fixture in (GENERATED, ATTEMPT):
                self.path.write_bytes(b"")
                parser = FreshOutput(self.path)
                parser.arm("search")
                self.append(fixture.replace(b"Search commands", content).replace(b"Search <mark name=\"7:15\"/>commands", content))
                with self.subTest(content=content, fixture=fixture), self.assertRaises(OutputRejected) as caught:
                    parser.observe()
                self.assertNotIn("canary", str(caught.exception))

    def test_partial_utf8_and_unterminated_records_never_pass(self):
        self.parser.arm("search")
        self.append(GENERATED + ATTEMPT[:-1])
        result = self.parser.observe()
        self.assertFalse(result["attempt"])
        self.assertFalse(result["completeLines"])
        self.append(b"\n")
        self.assertTrue(self.parser.observe()["attempt"])
        self.append(b"\xff\n")
        with self.assertRaises(OutputRejected):
            self.parser.observe()

    def test_partial_offset_rearm_and_offset_reuse_rejected(self):
        self.append(b"startup partial")
        with self.assertRaises(OutputRejected):
            self.parser.arm("search")
        self.append(b"\n")
        self.parser.arm("search")
        with self.assertRaises(OutputRejected):
            self.parser.arm("search")

    def test_truncate_regrow_replace_symlink_and_insecure_modes_fail(self):
        self.append(b"startup\n")
        self.parser.arm("search")
        for content in (b"", b"changed\n" + GENERATED + ATTEMPT):
            self.path.write_bytes(content)
            with self.assertRaises(OutputRejected):
                self.parser.observe()
        self.path.rename(self.path.with_name("original"))
        self.path.write_bytes(b"startup\n" + GENERATED + ATTEMPT)
        with self.assertRaises(OutputRejected):
            self.parser.observe()
        self.path.chmod(0o644)
        with self.assertRaises(OutputRejected):
            FreshOutput(self.path).arm("search")
        link = self.path.with_name("link")
        link.symlink_to(self.path)
        with self.assertRaises(OutputRejected):
            FreshOutput(link).arm("search")

    def test_limits_unknown_xml_voice_suffix_and_fabricated_completion_rejected(self):
        for data in (b"x" * (MAX_LINE + 1), GENERATED.replace(b"Search commands", b"Search commands "),
                     GENERATED.replace(VOICE.encode(), b"{'family': {'name': 'private canary'}}"),
                     GENERATED + ATTEMPT.replace(b"0:6", b"99:101"),
                     GENERATED + ATTEMPT.replace(b"<speak>", b"<speak><voice>private</voice>"),
                     GENERATED + ATTEMPT + b"SPEECH DISPATCHER: completed callback Search commands\n"):
            self.path.write_bytes(b"")
            parser = FreshOutput(self.path)
            parser.arm("search")
            self.append(data)
            with self.subTest(length=len(data)), self.assertRaises(OutputRejected):
                parser.observe()
        self.path.write_bytes(b"x" * (MAX_LOG + 1))
        with self.assertRaises(OutputRejected):
            FreshOutput(self.path).arm("search")

    def test_unrelated_public_label_does_not_satisfy_target(self):
        self.parser.arm("search")
        self.append(GENERATED.replace(b"Search commands", b"Cancel"))
        self.assertFalse(self.parser.observe()["generated"])

    def test_alternate_and_final_require_their_own_exact_fresh_generation_and_attempt(self):
        for identifier, label in (("public-alternate", "Public AT result alternate Installed application"),
                                  ("public-final", "Public AT filler 119 Installed application")):
            with self.subTest(identifier=identifier):
                self.path.write_bytes(b"")
                parser = FreshOutput(self.path)
                parser.arm(identifier)
                self.append(GENERATED + ATTEMPT)
                self.assertFalse(parser.observe()["generated"])
                self.append(f"SPEECH OUTPUT: '{label}' {VOICE}\n".encode())
                self.append(f"SPEECH DISPATCHER: Speaking '<speak>{label}</speak>' \n".encode())
                self.assertEqual(parser.observe(), {"generated": True, "attempt": True, "completion": False, "completeLines": True})

    def test_rewrite_of_already_observed_step_and_incremental_size_fail(self):
        self.parser.arm("search")
        self.append(GENERATED)
        self.assertTrue(self.parser.observe()["generated"])
        self.path.write_bytes(GENERATED.replace(b"Search commands", b"Cancel") + ATTEMPT)
        with self.assertRaises(OutputRejected):
            self.parser.observe()
        self.path.write_bytes(b"")
        parser = FreshOutput(self.path)
        parser.arm("search")
        self.append(b"bounded non-speech line\n" * (MAX_SLICE // 20))
        with self.assertRaises(OutputRejected):
            parser.observe()


if __name__ == "__main__":
    unittest.main()
