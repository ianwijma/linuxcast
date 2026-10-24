"""v4 qualification: fully fake libudev and owned text buffers, no hardware.

Zero is not positively qualified, including an internally collapsed error. These
fixtures establish neither complete/error-free discovery nor physical absence.
"""
import dataclasses
import json
import types
import unittest
from unittest.mock import patch
import guardian as G
import guardian_child as C
import readiness as R
import udev_metadata as U
import test_adapter_stages as A
import test_readiness as T


def item(index=0, *, initialized=1, seat=1, event=True, collapsed=False):
    row = dataclasses.replace(T.row(),
        syspath='/sys/devices/pci0000:00/usb1/input/input1/' + ('event' if event else 'input') + str(index + 1),
        devnode='/dev/input/event' + str(index + 1), devnum=2049 + index)
    return {'row': row, 'initialized': initialized, 'seat': seat,
            'collapsedErrorModel': collapsed}


class Multi(A.Fake):
    def __init__(self, rows, *, clock_case='healthy', unref_error=False):
        super().__init__(clock_case)
        self.rows = rows
        self.current = 0
        self.unref_error = unref_error
    def load(self, name):
        if name is None:
            return super().load(name)
        if name != '/usr/lib/x86_64-linux-gnu/libudev.so.1':
            raise AssertionError('NO_REAL_LIBRARY_FORWARD')
        self.trace.append(('CDLL', name))
        def path(entry):
            self.current = entry - 3
            return self.pointer(self.rows[self.current]['row'].syspath)
        def row(device):
            return self.rows[device - 1000]['row']
        def unref(_):
            if self.unref_error:
                raise RuntimeError('PRIVATE_UNREF_CANARY')
        callbacks = {
            'udev_new': lambda: 1, 'udev_unref': lambda _: None,
            'udev_enumerate_new': lambda _: 2, 'udev_enumerate_unref': lambda _: None,
            'udev_enumerate_add_match_subsystem': lambda _, n: 0 if n == b'input' else -1,
            'udev_enumerate_add_match_property': lambda _, n, v: 0 if (n, v) == (b'ID_INPUT_KEYBOARD', b'1') else -1,
            'udev_enumerate_scan_devices': lambda _: 0,
            'udev_enumerate_get_list_entry': lambda _: 3 if self.rows else 0,
            'udev_list_entry_get_next': lambda e: e + 1 if e - 2 < len(self.rows) else 0,
            'udev_list_entry_get_name': path,
            'udev_device_new_from_syspath': lambda *_: 1000 + self.current,
            'udev_device_unref': unref,
            'udev_device_get_is_initialized': lambda d: self.rows[d - 1000]['initialized'],
            'udev_device_has_current_tag': lambda d, tag: self.rows[d - 1000]['seat'] if tag == b'seat' else -1,
            'udev_device_get_parent_with_subsystem_devtype': lambda d, *_: d + 1000,
            'udev_device_get_devnode': lambda d: self.pointer(row(d).devnode),
            'udev_device_get_devnum': lambda d: row(d).devnum,
            'udev_device_get_sysattr_value': lambda parent, key: self.pointer({
                b'name': row(parent - 1000).name, b'phys': row(parent - 1000).phys,
                b'capabilities/ev': row(parent - 1000).event_bits,
                b'capabilities/key': row(parent - 1000).key_bits}[key]),
            'udev_device_get_property_value': lambda d, key: self.pointer(dict(row(d).properties)[key.decode()]),
        }
        return types.SimpleNamespace(**{n: self.function(n, f) for n, f in callbacks.items()})


def scan(fake, module=U):
    with patch.dict(module.os.environ, module.ENVIRONMENT, clear=True), \
         patch.object(module.os, 'uname', side_effect=fake.uname), \
         patch.object(module.C, 'CDLL', side_effect=fake.load), \
         patch.object(module.C, 'string_at', side_effect=fake.string_at), \
         patch.object(module.time, 'monotonic', side_effect=fake.clock):
        return module.UdevMetadata().scan()


def calls(fake, name):
    return [x for x in fake.trace if x[0] == name]


def qualified_catalog(rows):
    source = types.SimpleNamespace(scan=lambda: rows)
    peer = R.ParentPeer(1000, 1, 5000, lambda: True)
    catalog = R.Catalog(source, peer, clock=lambda: 0)
    return catalog, peer


class PerDevice(unittest.TestCase):
    def test_positive_multirow_traces_equal_original_signed_adapter(self):
        for count in (1, 2, 128):
            rows = [item(i) for i in range(count)]
            old, current = Multi(rows), Multi(rows)
            self.assertEqual(scan(old, A.old_module()), scan(current))
            self.assertEqual(old.trace, current.trace)
            self.assertEqual(len(calls(current, 'udev_enumerate_scan_devices')), 1)

    def test_mixed_zero_then_positive_and_reverse_preserve_other_candidates(self):
        for key in ('initialized', 'seat'):
            for reverse in (False, True):
                bad = item(0, **{key: 0}); good = item(1)
                fake = Multi([good, bad] if reverse else [bad, good])
                self.assertEqual(scan(fake), (good['row'],))
                self.assertEqual(len(calls(fake, 'udev_enumerate_scan_devices')), 1)
                self.assertEqual(len(calls(fake, 'udev_device_unref')), 2)
                self.assertEqual(len(calls(fake, 'udev_list_entry_get_next')), 2)
    def test_all_zero_empty_never_claims_absence_or_capture(self):
        for key in ('initialized', 'seat'):
            rows = scan(Multi([item(0, **{key: 0}), item(1, **{key: 0})]))
            self.assertEqual(rows, ())
            c, peer = qualified_catalog(rows)
            self.assertEqual(c.candidates(peer), ())
            value = C.counts_result([]); G.validate(C, value)
            self.assertEqual(value['schemaVersion'], 4)
            self.assertEqual(value['counts'], {'usb': 0, 'bluetooth': 0, 'i8042': 0})
            self.assertEqual(value['reason'], 'AUTHENTICATED_LIVE_COMPANION_UNAVAILABLE')
            self.assertTrue(all(value[k] is False for k in G.FALSE_FIELDS))
            self.assertNotIn('allHardware', value)
    def test_collapsed_error_zero_is_same_exclusion_not_error_free_evidence(self):
        for key in ('initialized', 'seat'):
            plain, hidden = item(**{key: 0}), item(collapsed=True, **{key: 0})
            a, b = Multi([plain, item(1)]), Multi([hidden, item(1)])
            self.assertEqual(scan(a), scan(b)); self.assertEqual(a.trace, b.trace)
    def test_explicit_negative_unexpected_or_boolean_invalidates_snapshot(self):
        for key in ('initialized', 'seat'):
            for value in (-1, -5, 2, True, False, None, '1'):
                fake = Multi([item(0), item(1, **{key: value}), item(2)])
                with self.subTest(key=key, value=value), self.assertRaises(R.Unavailable):
                    scan(fake)
                self.assertEqual(len(calls(fake, 'udev_device_unref')), 2)
                self.assertEqual(len(calls(fake, 'udev_list_entry_get_next')), 1)
                self.assertEqual(len(calls(fake, 'udev_enumerate_unref')), 1)
                self.assertEqual(len(calls(fake, 'udev_unref')), 1)
    def test_zero_has_no_downstream_device_metadata_and_unrefs_before_next(self):
        for key in ('initialized', 'seat'):
            fake = Multi([item(**{key: 0})]); self.assertEqual(scan(fake), ())
            forbidden = ('udev_device_get_parent_with_subsystem_devtype', 'udev_device_get_devnode',
                         'udev_device_get_devnum', 'udev_device_get_sysattr_value',
                         'udev_device_get_property_value')
            self.assertTrue(all(not calls(fake, n) for n in forbidden))
            if key == 'initialized': self.assertFalse(calls(fake, 'udev_device_has_current_tag'))
            names = [x[0] for x in fake.trace]
            self.assertLess(names.index('udev_device_unref'), names.index('udev_list_entry_get_next'))
    def test_128_skipped_entries_accepted_129_rejected_before_name(self):
        for kind in ('initialized', 'seat', 'non-event'):
            def rows(count):
                return [item(i, event=False) if kind == 'non-event' else item(i, **{kind: 0}) for i in range(count)]
            fake = Multi(rows(128)); self.assertEqual(scan(fake), ())
            self.assertEqual(len(calls(fake, 'udev_list_entry_get_name')), 128)
            fake = Multi(rows(129))
            with self.assertRaises(R.Unavailable): scan(fake)
            self.assertEqual(len(calls(fake, 'udev_list_entry_get_name')), 128)
            self.assertEqual(len(calls(fake, 'udev_list_entry_get_next')), 128)
    def test_mixed_inspected_cap_counts_every_kind_not_only_returned_rows(self):
        rows = [item(i, event=i % 3 != 0, initialized=0 if i % 3 == 1 else 1,
                     seat=0 if i % 3 == 2 else 1) for i in range(129)]
        fake = Multi(rows)
        with self.assertRaises(R.Unavailable): scan(fake)
        self.assertEqual(len(calls(fake, 'udev_list_entry_get_name')), 128)
    def test_duplicate_raw_paths_deny_including_skipped_and_non_event(self):
        for value in (item(initialized=0), item(seat=0), item(event=False), item()):
            fake = Multi([value, value])
            with self.assertRaises(R.Unavailable): scan(fake)
            self.assertEqual(len(calls(fake, 'udev_list_entry_get_name')), 2)
            self.assertLessEqual(len(calls(fake, 'udev_device_new_from_syspath')), 1)
    def test_positive_node_or_devnum_duplicates_and_filtered_duplicates_stay_ambiguous(self):
        for attr in ('devnode', 'devnum'):
            for mixed in (False, True):
                a, b = item(0), item(1)
                b['row'] = dataclasses.replace(b['row'], **{attr: getattr(a['row'], attr)})
                if mixed: b['row'] = T.props(b['row'], ID_INPUT_MOUSE='1')
                rows = scan(Multi([a, b])); c, peer = qualified_catalog(rows)
                with self.assertRaises(R.Unavailable): c.candidates(peer)
    def test_all_existing_positive_pure_filters_remain_required(self):
        for change in ({'ID_SEAT': 'seat1'}, {'ID_INPUT_MOUSE': '1'}, {'ID_BUS': 'unknown'}):
            value = item(); value['row'] = T.props(value['row'], **change)
            c, peer = qualified_catalog(scan(Multi([value])))
            self.assertEqual(c.candidates(peer), ())
        for change in ({'name': 'Linuxcast keyboard'}, {'phys': ''}, {'key_bits': '0'},
                       {'syspath': '/sys/devices/virtual/input/input1/event1'}):
            value = item(); value['row'] = dataclasses.replace(value['row'], **change)
            c, peer = qualified_catalog(scan(Multi([value])))
            self.assertEqual(c.candidates(peer), ())
    def test_time_guard_covers_skipped_entries_without_extra_clock_reads(self):
        for key in ('initialized', 'seat'):
            fake = Multi([item(**{key: 0})], clock_case='final-time')
            with self.assertRaises(R.Unavailable): scan(fake)
            self.assertEqual(len(calls(fake, 'clock')), 3)
            self.assertEqual(len(calls(fake, 'udev_list_entry_get_next')), 1)
    def test_skipped_unref_fault_still_invalidates_without_private_error(self):
        fake = Multi([item(seat=0)], unref_error=True)
        with self.assertRaisesRegex(R.Unavailable, '^READINESS_METADATA_UNAVAILABLE$'): scan(fake)
        self.assertFalse(calls(fake, 'udev_list_entry_get_next'))
        self.assertEqual(len(calls(fake, 'udev_enumerate_unref')), 1)
        self.assertEqual(len(calls(fake, 'udev_unref')), 1)
    def test_mixed_result_wire_contains_only_qualified_counts_not_private_diagnostics(self):
        fake = Multi([item(0, seat=0), item(1)])
        c, peer = qualified_catalog(scan(fake)); value = C.counts_result(c.candidates(peer)); G.validate(C, value)
        self.assertEqual(value['total'], 1)
        raw = json.dumps(value)
        for private in ('/sys', '/dev', 'event', 'devnum', 'collapsedError', 'Synthetic'):
            self.assertNotIn(private, raw)
        self.assertTrue(all(value[k] is False for k in G.FALSE_FIELDS))


if __name__ == '__main__': unittest.main()
