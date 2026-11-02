"""Actual source/codec/owner composition; all OS effects use private fakes."""
import json
from pathlib import Path
import tempfile
import unittest

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


if __name__ == '__main__':
    unittest.main()
