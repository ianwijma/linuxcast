"""Synthetic metadata/trusted-parent seam only. Never enumerates actual devices."""
import ast
import builtins
import ctypes as C
from dataclasses import replace
import json
import os
import pathlib
import subprocess
import sys
import traceback
import unittest
from unittest.mock import patch
import readiness as R
import udev_metadata as U


def row(**changes):
    p = {key: "" for key in R.PROPERTIES}
    p.update(ID_INPUT="1", ID_INPUT_KEYBOARD="1", ID_BUS="usb", ID_PATH="synthetic-public-port")
    keys = sum(1 << key for key in (1, 28, 29, 30, 57, 97))
    # Kernel emits separate native-long words; the lower word may omit padding.
    value = R.Metadata("/sys/devices/pci0000:00/usb1/input/input1/event1",
                       "/dev/input/event1", 2049, "Synthetic public keyboard",
                       "synthetic-public-phys", "120003", f"{keys >> 64:x} {keys & ((1 << 64)-1):x}", tuple(p.items()))
    return replace(value, **changes)


def props(value, **changes):
    p = dict(value.properties)
    p.update(changes)
    return replace(value, properties=tuple(p.items()))


class Source:
    def __init__(self):
        self.rows = (row(),)
        self.after = lambda: None

    def scan(self):
        self.after()
        return self.rows


class CatalogChecks(unittest.TestCase):
    def setUp(self):
        self.now = 100
        self.live = True
        self.source = Source()
        self.peer = R.ParentPeer(1000, 7, 10000, lambda: self.live)
        self.catalog = R.Catalog(self.source, self.peer, clock=lambda: self.now)

    def select(self):
        candidate, = self.catalog.candidates(self.peer)
        return self.catalog.propose({"token": candidate.token, "generation": candidate.generation}, self.peer)

    def assert_denied(self, proposal, peer=None):
        value = self.catalog.assessment(proposal, peer or self.peer)
        self.assertEqual(set(value), {"reason", "canCapture", "consentEstablished", "deviceOpenAvailable", "workerArmAvailable"})
        self.assertTrue(all(type(v) is bool and v is False for k, v in value.items() if k != "reason"))
        self.assertEqual(value["reason"], "SELECTION_INVALIDATED")

    def test_production_filters_conservatively(self):
        value = row()
        self.assertTrue(R.eligible_metadata(value))
        self.assertTrue(R.eligible_metadata(props(value, ID_SEAT="seat0", ID_BUS="bluetooth")))
        bad = [replace(value, syspath="/sys/devices/virtual/input/input1/event1"),
               replace(value, name="Linuxcast S0-03 virtual"), replace(value, phys="linuxcast-s0-03/output"),
               replace(value, devnode="/dev/uinput"), replace(value, devnode=5), replace(value, devnum=True),
               replace(value, name="x"*513), replace(value, event_bits="f"*17),
               replace(value, key_bits="0"), replace(value, event_bits="12000f"),
               replace(value, properties=(*value.properties[:-1], value.properties[0]))]
        bad += [props(value, **{name: "1"}) for name in R.MIXED]
        bad += [props(value, ID_INPUT_KEYBOARD="0"), props(value, ID_SEAT="seat1"),
                props(value, ID_BUS="unknown"), props(value, ID_PATH="", ID_SERIAL="")]
        for candidate in bad:
            self.assertFalse(R.eligible_metadata(candidate))

    def test_opaque_proposal_never_consent_or_capture(self):
        proposal = self.select()
        output = self.catalog.assessment(proposal, self.peer)
        self.assertEqual(output, {"reason": "AUTHENTICATED_LIVE_COMPANION_UNAVAILABLE", "canCapture": False,
                                 "consentEstablished": False, "deviceOpenAvailable": False, "workerArmAvailable": False})
        self.assertNotIn("synthetic-public", json.dumps(output))
        other = R.Catalog(self.source, self.peer, clock=lambda: self.now)
        a = self.catalog._rows
        b = other.candidates(self.peer)
        self.assertNotIn(b[0].token, a)

    def test_wire_consent_auth_and_paths_are_data_not_grants(self):
        for extra in ("consent", "authorized", "uid", "pid", "devicePath", "companion", "unlocked"):
            catalog = R.Catalog(self.source, self.peer, clock=lambda: self.now)
            candidate, = catalog.candidates(self.peer)
            with self.assertRaisesRegex(R.Unavailable, "^READINESS_METADATA_UNAVAILABLE$"):
                catalog.propose({"token": candidate.token, "generation": candidate.generation, extra: True}, self.peer)

    def test_wrong_peer_and_new_same_uid_cannot_revive(self):
        proposal = self.select()
        other = R.ParentPeer(1000, 7, 10000, lambda: True)
        self.assert_denied(proposal, other)
        self.assert_denied(proposal)

    def test_parent_death_and_expiry_are_terminal(self):
        proposal = self.select()
        self.live = False
        self.assert_denied(proposal)
        self.live = True
        self.assert_denied(proposal)

    def test_peer_expiry_and_clock_reversal(self):
        proposal = self.select()
        self.now = self.peer.expires_ms
        self.assert_denied(proposal)
        self.setUp()
        proposal = self.select()
        self.now -= 1
        self.assert_denied(proposal)

    def test_proposal_expiry_including_during_query(self):
        proposal = self.select()
        self.now = proposal._expires - 1
        self.source.after = lambda: setattr(self, "now", self.now + 2)
        self.assert_denied(proposal)

    def test_metadata_scan_age_and_candidate_staleness(self):
        self.source.after = lambda: setattr(self, "now", self.now + 1000)
        with self.assertRaises(R.Unavailable):
            self.catalog.candidates(self.peer)
        self.setUp()
        candidate, = self.catalog.candidates(self.peer)
        self.now += 1000
        with self.assertRaises(R.Unavailable):
            self.catalog.propose({"token": candidate.token, "generation": candidate.generation}, self.peer)

    def test_replacement_removal_and_revoked_metadata_invalidate(self):
        for changed in ((), (replace(row(), devnum=2050),), (replace(row(), phys="replacement"),),
                        (props(row(), ID_INPUT_MOUSE="1"),)):
            self.setUp()
            proposal = self.select()
            self.source.rows = changed
            self.assert_denied(proposal)
            self.source.rows = (row(),)
            self.assert_denied(proposal)

    def test_cancel_and_refresh_after_selection_never_rearm(self):
        proposal = self.select()
        self.catalog.cancel()
        self.assert_denied(proposal)
        with self.assertRaises(R.Unavailable):
            self.catalog.candidates(self.peer)
        self.setUp()
        proposal = self.select()
        with self.assertRaises(R.Unavailable):
            self.catalog.candidates(self.peer)
        self.assert_denied(proposal)

    def test_duplicate_oversize_malformed_and_source_errors_fail_closed(self):
        for rows in ((row(), row()), (row(),)*129, (object(),), [row()]):
            self.setUp()
            self.source.rows = rows
            with self.assertRaises(R.Unavailable):
                self.catalog.candidates(self.peer)
        self.setUp()
        self.source.after = lambda: (_ for _ in ()).throw(RuntimeError("PRIVATE_CANARY"))
        try:
            self.catalog.candidates(self.peer)
        except R.Unavailable as error:
            self.assertEqual(str(error), "READINESS_METADATA_UNAVAILABLE")
            self.assertNotIn("PRIVATE_CANARY", "".join(traceback.format_exception(type(error), error, error.__traceback__)))
        else:
            self.fail("source error must invalidate")

    def test_old_generation_and_boolean_rejected(self):
        candidate, = self.catalog.candidates(self.peer)
        self.catalog.candidates(self.peer)
        with self.assertRaises(R.Unavailable):
            self.catalog.propose({"token": candidate.token, "generation": candidate.generation}, self.peer)
        self.setUp()
        candidate, = self.catalog.candidates(self.peer)
        with self.assertRaises(R.Unavailable):
            self.catalog.propose({"token": candidate.token, "generation": True}, self.peer)

    def test_no_open_or_arm_capability(self):
        with patch.object(os, "open", side_effect=AssertionError("DEVICE_OPEN_FORBIDDEN")), patch.object(builtins, "open", side_effect=AssertionError("READ_FORBIDDEN")):
            proposal = self.select()
            self.catalog.assessment(proposal, self.peer)
        self.assertFalse(any(hasattr(self.catalog, name) for name in ("open_device", "arm", "grant", "enable", "allow")))


class Function:
    def __init__(self, callback): self.callback = callback
    def __call__(self, *args): return self.callback(*args)


class UdevChecks(unittest.TestCase):
    def fake(self, *, private=False, scan_error=False, initialized=True):
        self.buffers, self.calls = [], []
        value = row()
        def pointer(text):
            buf = C.create_string_buffer(text.encode())
            self.buffers.append(buf)
            return C.addressof(buf)
        functions = {
            "udev_new": lambda: 1, "udev_unref": lambda _: self.calls.append("context-unref"),
            "udev_enumerate_new": lambda _: 2, "udev_enumerate_unref": lambda _: self.calls.append("enumeration-unref"),
            "udev_enumerate_add_match_subsystem": lambda _, name: 0 if name == b"input" else -1,
            "udev_enumerate_add_match_property": lambda _, name, val: 0 if (name, val) == (b"ID_INPUT_KEYBOARD", b"1") else -1,
            "udev_enumerate_scan_devices": lambda _: -1 if scan_error else 0,
            "udev_enumerate_get_list_entry": lambda _: 3, "udev_list_entry_get_next": lambda _: 0,
            "udev_list_entry_get_name": lambda _: pointer(value.syspath),
            "udev_device_new_from_syspath": lambda _, path: 4,
            "udev_device_unref": lambda _: self.calls.append("device-unref"),
            "udev_device_get_devnode": lambda _: pointer(value.devnode), "udev_device_get_devnum": lambda _: value.devnum,
            "udev_device_get_is_initialized": lambda _: int(initialized), "udev_device_has_current_tag": lambda _, tag: int(tag == b"seat"),
            "udev_device_get_property_value": lambda _, key: pointer(dict(value.properties)[key.decode()]),
            "udev_device_get_parent_with_subsystem_devtype": lambda *_: 5,
            "udev_device_get_sysattr_value": lambda _, key: pointer(("PRIVATE_CANARY"*100) if private else {b"name": value.name, b"phys": value.phys, b"capabilities/ev": value.event_bits, b"capabilities/key": value.key_bits}[key]),
        }
        dll = type("FixedSyntheticDLL", (), {})()
        for key, function in functions.items(): setattr(dll, key, Function(function))
        libc = type("SyntheticLibc", (), {})()
        libc.strnlen = Function(lambda ptr, limit: min(len(C.string_at(ptr)), limit))
        def library(path):
            self.assertIn(path, (None, "/usr/lib/x86_64-linux-gnu/libudev.so.1"))
            return dll if path else libc
        return library

    def test_fixed_udev_metadata_calls_and_reference_cleanup(self):
        factory = self.fake()
        with patch.dict(os.environ, U.ENVIRONMENT, clear=True), patch.object(U.C, "CDLL", side_effect=factory), patch.object(os, "open", side_effect=AssertionError("NO_DEVICE_OPEN")):
            values = U.UdevMetadata().scan()
        self.assertEqual(values, (row(),))
        self.assertEqual(self.calls, ["device-unref", "enumeration-unref", "context-unref"])

    def test_udev_failures_and_bounded_strings_never_echo_private(self):
        for options in ({"private": True}, {"scan_error": True}):
            factory = self.fake(**options)
            with patch.dict(os.environ, U.ENVIRONMENT, clear=True), patch.object(U.C, "CDLL", side_effect=factory):
                with self.assertRaisesRegex(R.Unavailable, "^READINESS_METADATA_UNAVAILABLE$"):
                    U.UdevMetadata().scan()
            self.assertEqual(self.calls[-2:], ["enumeration-unref", "context-unref"])
        # v4: public zero is not positively qualified (possibly a collapsed
        # error), so only that device is excluded. This is not absence proof.
        factory = self.fake(initialized=False)
        with patch.dict(os.environ, U.ENVIRONMENT, clear=True), patch.object(U.C, "CDLL", side_effect=factory):
            self.assertEqual(U.UdevMetadata().scan(), ())
        self.assertEqual(self.calls, ["device-unref", "enumeration-unref", "context-unref"])

    def test_environment_rejected_before_loading_library(self):
        for env in ({}, {**U.ENVIRONMENT, "PRIVATE_LOG_ADDRESS": "PRIVATE_CANARY"},
                    {**U.ENVIRONMENT, "LD_PRELOAD": "PRIVATE_CANARY"}, {**U.ENVIRONMENT, "LC_ALL": "C"}):
            with patch.dict(os.environ, env, clear=True), patch.object(U.C, "CDLL", side_effect=AssertionError("NO_LOAD")):
                with self.assertRaisesRegex(R.Unavailable, "^READINESS_METADATA_UNAVAILABLE$"):
                    U.UdevMetadata().scan()

    def test_actual_sanitized_python_startup_reaches_only_fake_udev(self):
        code = "\n".join([
            "import sys,json",
            "sys.path.insert(0," + repr(str(pathlib.Path(__file__).resolve().parent)) + ")",
            "import udev_metadata as U",
            "from test_readiness import UdevChecks",
            "fixture=UdevChecks()",
            "U.C.CDLL=fixture.fake()",
            "values=U.UdevMetadata().scan()",
            "print(json.dumps({'fixedStartupGuardPassed':len(values)==1,'liveMetadataUsed':False}))",
        ])
        result = subprocess.run([sys.executable, "-B", "-I", "-S", "-c", code], env=U.ENVIRONMENT,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=3)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stderr, b"")
        self.assertEqual(json.loads(result.stdout), {"fixedStartupGuardPassed": True, "liveMetadataUsed": False})

    def test_library_failure_has_only_fixed_diagnostic(self):
        with patch.dict(os.environ, U.ENVIRONMENT, clear=True), patch.object(U.C, "CDLL", side_effect=OSError("PRIVATE_CANARY")):
            with self.assertRaisesRegex(R.Unavailable, "^READINESS_METADATA_UNAVAILABLE$"):
                U.UdevMetadata().scan()

    def test_static_boundary_has_only_fixed_metadata_native_functions(self):
        source = pathlib.Path(U.__file__).read_text()
        tree = ast.parse(source)
        strings = {node.value for node in ast.walk(tree) if isinstance(node, ast.Constant) and type(node.value) is str}
        self.assertFalse(any(name in source for name in ("EVIOCGRAB", "uinput", "udev_device_set_", "subprocess", "socket", "os.open")))
        self.assertIn("udev_device_get_devnum", strings)
        self.assertIn("udev_enumerate_scan_devices", strings)


if __name__ == "__main__":
    unittest.main(verbosity=2)
