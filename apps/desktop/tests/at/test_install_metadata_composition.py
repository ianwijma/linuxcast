"""Actual source/codec/owner composition; all OS effects use private fakes."""
import copy
import json
import os
from pathlib import Path
import signal
import tempfile
import unittest
from unittest.mock import patch

import install_metadata as collector
import lab_install_metadata_owner as host
import lab_owner as owner
import test_install_metadata as guest_fixtures
import test_lab_install_metadata_owner as owner_fixtures


class Composition(unittest.TestCase):
    def setUp(self):
        # Reuse the existing explicit private parent profile, never weaken the
        # executable entry point's protected-ancestor requirement.
        self.sources_fixture = owner_fixtures.Sources('test_complete_six_hash_closure_and_no_module_cache')
        self.sources_fixture.setUp()
        self.addCleanup(self.sources_fixture.doCleanups)
        self.addCleanup(self.sources_fixture.tearDown)
        source_path = self.sources_fixture.root / 'install_metadata.py'
        raw = Path(collector.__file__).read_bytes()
        source_path.write_bytes(raw)
        self.pin = dict(self.sources_fixture.pin,
                        installMetadataCollectorSha256=owner.digest(raw),
                        installMetadataProbeSha256=owner.digest(collector.source_bytes()))
        self.sources = host._Sources()

    def admit(self):
        try:
            return self.sources.check(self.pin)[1]
        except owner.Rejected:
            self.fail('actual adjacent collector API must satisfy its frozen unavailable-reason contract')

    def actual_snapshot(self):
        fixture = guest_fixtures.Fixture()
        self.addCleanup(fixture.close)
        return fixture.collect()

    def lease(self):
        temp = tempfile.TemporaryDirectory(prefix='install-metadata-composition-')
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        owner_fixtures.prepare(root)
        pin = owner_fixtures.permit(root)
        pin.update({key: self.pin[key] for key in host.SOURCE_KEYS})
        owner_fixtures.write_permit(root, pin)
        lease = host.InstallMetadataReservation(root)
        self.addCleanup(lease.close)
        lease.acquire()
        lease.permit()
        lease.check_sources()
        return root, lease

    def test_actual_sources_and_observed_wire_roundtrip(self):
        adapter = self.admit()
        self.assertEqual(adapter.failures, ('none',) + collector.FAILURES)
        self.assertEqual(adapter.source, collector.source_bytes())
        snapshot = self.actual_snapshot()
        raw = collector.encode_packet(snapshot)
        packet, decoded, canonical = host.decode_packet(raw, 0, adapter)
        self.assertEqual(packet['status'], 'observed')
        self.assertEqual(decoded, snapshot)
        self.assertEqual(canonical, collector.canonical(snapshot))
        counts = host.snapshot_counts(snapshot, adapter)
        self.assertEqual(counts['packageCount'], 4)
        self.assertEqual(counts['directoryCount'], 3)
        self.assertEqual(counts['handlerCount'], 2)

    def test_every_actual_unavailable_code_is_distinct_from_success(self):
        adapter = self.admit()
        self.assertNotIn('none', collector.FAILURES)
        for reason in collector.FAILURES:
            raw = collector.canonical(collector.unavailable(reason))
            packet, snapshot, canonical = host.decode_packet(raw, 3, adapter)
            self.assertEqual((packet['firstFailure'], snapshot, canonical), (reason, None, None))
            with self.assertRaises(owner.Rejected):
                host.decode_packet(raw, 0, adapter)

    def test_actual_codec_reaches_private_artifact_and_public_summary(self):
        self.admit()
        root, lease = self.lease()
        snapshot = self.actual_snapshot()
        lab = owner_fixtures.FakeLab(lease)
        lab.reply = collector.encode_packet(snapshot)
        result = owner.transact(lease, lab)
        self.assertEqual(lab.calls, ['inspect', 'start', 'ready', 'dispatch', 'cleanup'])
        self.assertEqual(result['status'], 'completed')
        self.assertTrue(result['transportResultValid'] and result['reservationClean'])
        raw = (root / lease.artifact_name()).read_bytes()
        self.assertEqual(raw, collector.canonical(snapshot))
        lease.validate_reply(result)
        public = host.public_result(result, lease.codec.failures)
        self.assertEqual(public['installMetadata']['sha256'], owner.digest(raw))
        self.assertEqual(public['installMetadata']['packageCount'], 4)
        self.assertEqual(public['acceptance'], 'pending')
        self.assertFalse((root / owner.MARKER).exists())
        for hidden in (str(root), 'originalStatusSha256', 'postinst', 'SYNTHETIC', 'device', 'inode'):
            self.assertNotIn(hidden, json.dumps(public))

    def test_actual_unavailable_reply_never_creates_artifact(self):
        self.admit()
        root, lease = self.lease()
        lab = owner_fixtures.FakeLab(lease)
        lab.reply = collector.canonical(collector.unavailable('package-lock'))
        lab.code = 3
        result = owner.transact(lease, lab)
        self.assertTrue(result['transportResultValid'])
        self.assertEqual(result['installMetadata']['status'], 'unavailable')
        self.assertIsNone(result['artifact'])
        self.assertFalse((root / lease.artifact_name()).exists())
        public = host.public_result(result, lease.codec.failures)
        self.assertEqual(public['installMetadata']['firstFailure'], 'package-lock')

    def test_cleanup_source_loss_retains_durable_marker(self):
        root, lease = self.lease()
        source = self.sources_fixture.root / 'install_metadata.py'
        original = source.read_bytes()
        class Changed(owner_fixtures.FakeLab):
            def cleanup(inner, budget):
                outcome = super().cleanup(budget)
                source.write_bytes(original + b'\n# synthetic late source mutation\n')
                return outcome
        lab = Changed(lease)
        lab.reply = collector.encode_packet(self.actual_snapshot())
        result = owner.transact(lease, lab)
        self.assertTrue((root / owner.MARKER).exists())
        self.assertTrue((root / lease.artifact_name()).exists())
        self.assertFalse(result['transportResultValid'] or result['reservationClean'])
        self.assertEqual(result['cleanupFailure'], 'custody')
        self.assertTrue(result['mayHaveStarted'] and result['mayHaveDispatched'])
        self.assertEqual(lab.calls.count('start'), 1)
        self.assertEqual(lab.calls.count('dispatch'), 1)

    def test_prior_recovery_does_not_require_missing_collector(self):
        root, lease = self.lease()
        lease.create_marker()
        lease.state.update(mayHaveStarted=True, mayHaveDispatched=True)
        lease.save()
        self.assertTrue(lease.close())
        (self.sources_fixture.root / 'install_metadata.py').unlink()
        resumed = host.InstallMetadataReservation(root)
        self.addCleanup(resumed.close)
        resumed.acquire()
        resumed.permit()
        lab = owner_fixtures.FakeLab(resumed)
        with patch.object(resumed, 'check_sources', side_effect=AssertionError('collector used during prior recovery')):
            result = owner.transact(resumed, lab)
        self.assertEqual((result['status'], result['firstFailure']), ('recovered', 'recovery'))
        self.assertTrue(result['reservationClean'])
        self.assertEqual(lab.calls, ['recover', 'cleanup'])
        self.assertFalse((root / owner.MARKER).exists())

    def test_uncached_caller_rechecks_sources_before_marker_release(self):
        root, lease = self.lease()
        lease.create_marker()
        self.assertTrue(lease.close())
        caller = host.InstallMetadataReservation(root)
        self.addCleanup(caller.close)
        caller.acquire()
        caller.permit()
        self.assertIsNone(caller.codec)
        self.assertFalse(caller.used)
        self.assertTrue(caller.load_marker())
        source = self.sources_fixture.root / 'install_metadata.py'
        source.write_bytes(source.read_bytes() + b'\n# synthetic caller fallback mutation\n')
        with self.assertRaises(owner.Rejected):
            caller.remove_marker()
        self.assertTrue((root / owner.MARKER).exists())

    def validation_signals(self, artifact):
        for sig, reason in ((signal.SIGALRM, 'deadline'), (signal.SIGTERM, 'interrupted')):
            _, lease = self.lease()
            lab = owner_fixtures.FakeLab(lease)
            lab.reply = collector.encode_packet(self.actual_snapshot())
            result = owner.transact(lease, lab)
            self.assertEqual(result['status'], 'completed')
            for earlier in ('none', 'transport'):
                with self.subTest(signal=sig, earlier=earlier, artifact=artifact):
                    # Reuse the invalidated lease only for the earlier-failure
                    # control; never reset uncertainty or claim re-admission.
                    value = copy.deepcopy(result)
                    if earlier != 'none':
                        value.update(status='incomplete', firstFailure=earlier)
                    old = signal.getsignal(sig)
                    fired = []
                    def handler(*_):
                        raise owner.Rejected(reason)
                    original = host._source
                    def source(path, maximum):
                        if Path(path).name == 'install_metadata.py' and not fired:
                            fired.append(True)
                            os.kill(os.getpid(), sig)
                        return original(path, maximum)
                    def checked_artifact():
                        fired.append(True)
                        os.kill(os.getpid(), sig)
                    signal.signal(sig, handler)
                    try:
                        target = patch.object(lease, 'check_artifact', checked_artifact) if artifact else patch.object(host, '_source', source)
                        with target:
                            lease.validate_reply(value)
                    finally:
                        signal.signal(sig, old)
                    self.assertEqual(fired, [True])
                    self.assertEqual(value['firstFailure'], reason if earlier == 'none' else earlier)
                    self.assertEqual(value['cleanupFailure'], 'custody')
                    self.assertFalse(value['transportResultValid'] or value['reservationClean'])
                    self.assertTrue(value['mayHaveStarted'] and value['mayHaveDispatched'])
                    self.assertEqual(value['installMetadata'], host.empty_metadata())

    def test_source_validation_real_signals_preserve_known_first_failure(self):
        self.validation_signals(artifact=False)

    def test_artifact_validation_real_signals_preserve_known_first_failure(self):
        self.validation_signals(artifact=True)


if __name__ == '__main__':
    unittest.main()
