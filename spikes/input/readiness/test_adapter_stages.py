"""Fully fake libudev, owned ctypes buffers only; never loads actual udev."""
import ctypes
import hashlib
import types
import traceback
import unittest
from unittest.mock import patch
import readiness as R
import udev_metadata as U
import guardian as G
import guardian_child as C

# Exact immutable signed add9 adapter, retained only to compare call semantics.
OLD_SOURCE = '"""Fixed libudev metadata calls only; importing never loads or enumerates udev."""\nimport ctypes as C\nimport os\nimport time\nfrom readiness import Metadata, PROPERTIES, MAX_DEVICES, Unavailable\n\nENVIRONMENT = {"LC_ALL": "C.UTF-8", "LANG": "C.UTF-8", "PATH": "/usr/bin:/bin"}\n\n\nclass UdevMetadata:\n    def scan(self) -> tuple[Metadata, ...]:\n        # Python may add LC_CTYPE to an empty environment at startup. A fixed\n        # explicit UTF-8 launch prevents that coercion; no mutation here.\n        if dict(os.environ) != ENVIRONMENT or os.uname().machine != "x86_64":\n            raise Unavailable()\n        try:\n            return self._scan_fixed()\n        except Exception:\n            raise Unavailable() from None\n\n    def _scan_fixed(self):\n        library = C.CDLL("/usr/lib/x86_64-linux-gnu/libudev.so.1")\n        libc = C.CDLL(None)\n        libc.strnlen.argtypes = [C.c_void_p, C.c_size_t]\n        libc.strnlen.restype = C.c_size_t\n        signatures = {\n            "udev_new": ([], C.c_void_p),\n            "udev_unref": ([C.c_void_p], C.c_void_p),\n            "udev_enumerate_new": ([C.c_void_p], C.c_void_p),\n            "udev_enumerate_unref": ([C.c_void_p], C.c_void_p),\n            "udev_enumerate_add_match_subsystem": ([C.c_void_p, C.c_char_p], C.c_int),\n            "udev_enumerate_add_match_property": ([C.c_void_p, C.c_char_p, C.c_char_p], C.c_int),\n            "udev_enumerate_scan_devices": ([C.c_void_p], C.c_int),\n            "udev_enumerate_get_list_entry": ([C.c_void_p], C.c_void_p),\n            "udev_list_entry_get_next": ([C.c_void_p], C.c_void_p),\n            "udev_list_entry_get_name": ([C.c_void_p], C.c_void_p),\n            "udev_device_new_from_syspath": ([C.c_void_p, C.c_char_p], C.c_void_p),\n            "udev_device_unref": ([C.c_void_p], C.c_void_p),\n            "udev_device_get_devnode": ([C.c_void_p], C.c_void_p),\n            "udev_device_get_devnum": ([C.c_void_p], C.c_ulong),\n            "udev_device_get_is_initialized": ([C.c_void_p], C.c_int),\n            "udev_device_has_current_tag": ([C.c_void_p, C.c_char_p], C.c_int),\n            "udev_device_get_property_value": ([C.c_void_p, C.c_char_p], C.c_void_p),\n            "udev_device_get_parent_with_subsystem_devtype": ([C.c_void_p, C.c_char_p, C.c_char_p], C.c_void_p),\n            "udev_device_get_sysattr_value": ([C.c_void_p, C.c_char_p], C.c_void_p),\n        }\n        for name, (args, result) in signatures.items():\n            function = getattr(library, name)\n            function.argtypes, function.restype = args, result\n\n        def text(pointer, maximum=512):\n            if not pointer:\n                return ""\n            length = libc.strnlen(pointer, maximum + 1)\n            if length > maximum:\n                raise Unavailable()\n            return C.string_at(pointer, length).decode("utf-8", errors="strict")\n\n        started = time.monotonic()\n        context, enumeration = library.udev_new(), None\n        try:\n            if not context:\n                raise Unavailable()\n            enumeration = library.udev_enumerate_new(context)\n            if not enumeration or library.udev_enumerate_add_match_subsystem(enumeration, b"input") < 0 or library.udev_enumerate_add_match_property(enumeration, b"ID_INPUT_KEYBOARD", b"1") < 0 or library.udev_enumerate_scan_devices(enumeration) < 0:\n                raise Unavailable()\n            entry = library.udev_enumerate_get_list_entry(enumeration)\n            rows = []\n            while entry:\n                if len(rows) >= MAX_DEVICES or time.monotonic() - started >= 1:\n                    raise Unavailable()\n                path = text(library.udev_list_entry_get_name(entry), 4096)\n                # libudev may enumerate the input parent as well as event nodes.\n                if not path.rsplit("/", 1)[-1].startswith("event"):\n                    entry = library.udev_list_entry_get_next(entry)\n                    continue\n                device = library.udev_device_new_from_syspath(context, path.encode())\n                if not device:\n                    raise Unavailable()\n                try:\n                    if library.udev_device_get_is_initialized(device) != 1 or library.udev_device_has_current_tag(device, b"seat") != 1:\n                        raise Unavailable()\n                    parent = library.udev_device_get_parent_with_subsystem_devtype(device, b"input", None)\n                    if not parent:\n                        raise Unavailable()\n                    attr = lambda key: text(library.udev_device_get_sysattr_value(parent, key))\n                    rows.append(Metadata(path, text(library.udev_device_get_devnode(device)),\n                        int(library.udev_device_get_devnum(device)), attr(b"name"), attr(b"phys"),\n                        attr(b"capabilities/ev"), attr(b"capabilities/key"),\n                        tuple((key, text(library.udev_device_get_property_value(device, key.encode()))) for key in PROPERTIES)))\n                finally:\n                    library.udev_device_unref(device)\n                entry = library.udev_list_entry_get_next(entry)\n            if time.monotonic() - started >= 1:\n                raise Unavailable()\n            return tuple(rows)\n        except Exception:\n            raise Unavailable() from None\n        finally:\n            if enumeration:\n                library.udev_enumerate_unref(enumeration)\n            if context:\n                library.udev_unref(context)\n'
OLD_SHA = 'add9a465d6d669c0c171ae6558d30eb390907ddc1b2c4cb05a480c1721e502cc'


class Fn:
    def __init__(self, name, function, fake):
        object.__setattr__(self, 'name', name)
        object.__setattr__(self, 'function', function)
        object.__setattr__(self, 'fake', fake)
    def __call__(self, *args):
        self.fake.trace.append((self.name, tuple(self.fake.normal(a) for a in args)))
        if self.fake.case == 'exception:' + self.name:
            raise RuntimeError('PRIVATE_NATIVE_ERROR')
        return self.function(*args)
    def __setattr__(self, name, value):
        self.fake.trace.append(('signature', self.name, name, tuple(str(t) for t in value) if type(value) is list else str(value)))
        if self.fake.case == 'signatures' and self.name == 'udev_new':
            raise RuntimeError('PRIVATE_SIGNATURE')
        object.__setattr__(self, name, value)


class Fake:
    def __init__(self, case):
        self.case=case
        self.trace=[]
        self.stages=[]
        self.buffers={}
        self.clock_count=0
        self.next_count=0
    def normal(self, value):
        return ('own-text', self.buffers[value].raw) if type(value) is int and value in self.buffers else value
    def pointer(self, text):
        raw=text if type(text) is bytes else text.encode()
        b=ctypes.create_string_buffer(raw)
        p=ctypes.addressof(b);self.buffers[p]=b
        return p
    def function(self, name, callback):return Fn(name,callback,self)
    def load(self, name):
        self.trace.append(('CDLL',name))
        if name == '/usr/lib/x86_64-linux-gnu/libudev.so.1':
            if self.case == 'library':raise RuntimeError('PRIVATE_LIBRARY')
            def context():return 0 if self.case=='context' else 1
            def enumeration(_):return 0 if self.case=='enumeration' else 2
            def next_entry(_):
                self.next_count+=1
                return 0
            def name(_):
                if self.case=='invalid-entry':return self.pointer(b'\xff')
                if self.case=='long-entry':return self.pointer('x'*4097)
                return self.pointer('/sys/devices/pci/synthetic/input/'+('input1' if self.case=='non-event' else 'event1'))
            def node(_):return self.pointer('/dev/input/event1')
            def attr(_,key):
                value={b'name':'Synthetic public keyboard',b'phys':'synthetic-public-phys',b'capabilities/ev':'120003',b'capabilities/key':'200000000 30000001'}.get(key,'')
                return self.pointer(b'\xff' if self.case=='invalid-metadata' else value)
            def prop(_,key):return self.pointer({b'ID_INPUT':'1',b'ID_INPUT_KEYBOARD':'1',b'ID_BUS':'usb',b'ID_PATH':'synthetic-public-path'}.get(key,''))
            callbacks={
                'udev_new':context,'udev_unref':lambda _:None,
                'udev_enumerate_new':enumeration,'udev_enumerate_unref':lambda _:None,
                'udev_enumerate_add_match_subsystem':lambda *_:-1 if self.case=='subsystem' else 0,
                'udev_enumerate_add_match_property':lambda *_:-1 if self.case=='keyboard' else 0,
                'udev_enumerate_scan_devices':lambda _:-1 if self.case=='scan' else 0,
                'udev_enumerate_get_list_entry':lambda _:0 if self.case=='empty' else 3,
                'udev_list_entry_get_next':next_entry,'udev_list_entry_get_name':name,
                'udev_device_new_from_syspath':lambda *_:0 if self.case=='device' else 4,
                'udev_device_unref':lambda _:None,'udev_device_get_devnode':node,
                'udev_device_get_devnum':lambda _:2049,
                'udev_device_get_is_initialized':lambda _:0 if self.case=='initialized' else 1,
                'udev_device_has_current_tag':lambda *_:0 if self.case=='seat' else 1,
                'udev_device_get_parent_with_subsystem_devtype':lambda *_:0 if self.case=='parent' else 5,
                'udev_device_get_sysattr_value':attr,'udev_device_get_property_value':prop}
            return types.SimpleNamespace(**{n:self.function(n,f) for n,f in callbacks.items()})
        if name is None:
            if self.case=='c-runtime':raise RuntimeError('PRIVATE_C_RUNTIME')
            return types.SimpleNamespace(strnlen=self.function('strnlen',lambda p,limit:min(len(self.buffers[p].value),limit)))
        raise AssertionError('NO_ACTUAL_C_LIBRARY_FORWARDING')
    def string_at(self,p,length):
        self.trace.append(('string_at',self.normal(p),length))
        return self.buffers[p].raw[:length]
    def clock(self):
        self.trace.append(('clock',))
        self.clock_count+=1
        if self.case=='loop-time' and self.clock_count>=2:return 1
        if self.case=='final-time' and self.clock_count>=3:return 1
        return 0
    def uname(self):
        self.trace.append(('uname',))
        return types.SimpleNamespace(machine='unknown' if self.case=='environment' else 'x86_64')
    def observer(self,stage):self.stages.append(stage)


def old_module():
    assert hashlib.sha256(OLD_SOURCE.encode()).hexdigest()==OLD_SHA
    m=types.ModuleType('historical_signed_adapter')
    exec(compile(OLD_SOURCE,'<historical-signed-adapter>','exec'),m.__dict__)
    return m


def run(case, *, old=False, callback=True):
    module=old_module() if old else U
    fake=Fake(case)
    # Both CDLL(None) and the fixed udev path terminate in the fully fake loader.
    with patch.dict(module.os.environ,module.ENVIRONMENT,clear=True), \
         patch.object(module.os,'uname',side_effect=fake.uname), \
         patch.object(module.C,'CDLL',side_effect=fake.load), \
         patch.object(module.C,'string_at',side_effect=fake.string_at), \
         patch.object(module.time,'monotonic',side_effect=fake.clock), \
         patch.object(module,'MAX_DEVICES',0 if case=='count' else 128):
        try:
            source=module.UdevMetadata() if old or not callback else module.UdevMetadata(fake.observer)
            value=source.scan()
            result=('tuple',value)
        except R.Unavailable as error:
            result=('unavailable',str(error))
    return fake,result


class AdapterStages(unittest.TestCase):
    def test_exact_signed_old_source_and_stage_set(self):
        self.assertEqual(hashlib.sha256(OLD_SOURCE.encode()).hexdigest(),OLD_SHA)
        self.assertEqual(U.ADAPTER_STAGES,{s for s in C.CHILD_STAGES if s.startswith('CHILD_ADAPTER_')})
        self.assertEqual(len(U.ADAPTER_STAGES),17)
    def test_exact_old_new_native_clock_uname_signature_text_call_sequences(self):
        cases=('healthy','empty','non-event','environment','library','c-runtime','signatures',
               'context','enumeration','subsystem','keyboard','scan','device',
               'parent','long-entry','invalid-entry','invalid-metadata','count','loop-time','final-time',
               'exception:udev_device_get_devnode','exception:udev_device_unref',
               'exception:udev_enumerate_unref','exception:udev_unref')
        for case in cases:
            with self.subTest(case=case):
                old,previous=run(case,old=True)
                new,current=run(case)
                self.assertEqual(old.trace,new.trace)
                self.assertEqual(previous,current)
                self.assertTrue(set(new.stages)<=U.ADAPTER_STAGES)
    def test_exact_attempted_failure_boundaries_and_success_cleanup_preservation(self):
        pairs={'environment':'ENVIRONMENT','library':'LIBRARY','c-runtime':'C_RUNTIME',
               'signatures':'SIGNATURES','context':'CONTEXT','enumeration':'ENUMERATION',
               'subsystem':'SUBSYSTEM_FILTER','keyboard':'KEYBOARD_FILTER','scan':'SCAN',
               'long-entry':'ENTRY','invalid-entry':'ENTRY','device':'DEVICE',
               'parent':'PARENT',
               'invalid-metadata':'METADATA','count':'TIME_OR_COUNT','loop-time':'TIME_OR_COUNT',
               'final-time':'TIME_OR_COUNT','exception:udev_device_unref':'CLEANUP',
               'exception:udev_enumerate_unref':'CLEANUP','exception:udev_unref':'CLEANUP'}
        for case,stage in pairs.items():
            with self.subTest(case=case):
                fake,result=run(case)
                self.assertEqual(result,('unavailable','READINESS_METADATA_UNAVAILABLE'))
                self.assertEqual(fake.stages[-1],'CHILD_ADAPTER_'+stage)
        fake,result=run('healthy')
        self.assertEqual(fake.stages[-1],'CHILD_ADAPTER_TIME_OR_COUNT')
        self.assertNotIn('CHILD_ADAPTER_CLEANUP',fake.stages)
        self.assertEqual(sum(x[0]=='udev_enumerate_scan_devices' for x in fake.trace),1)
        self.assertEqual(type(result[1]),tuple)
    def test_initialized_and_filter_short_circuit_no_added_query(self):
        for case,absent in [('initialized','udev_device_has_current_tag'),
                            ('subsystem','udev_enumerate_add_match_property'),
                            ('keyboard','udev_enumerate_scan_devices'),('count','udev_list_entry_get_name')]:
            fake,_=run(case)
            self.assertNotIn(absent,[x[0] for x in fake.trace])
    def test_optional_observer_absent_preserves_api_exact_tuple_and_calls(self):
        without,result_without=run('healthy',callback=False)
        with_callback,result_with=run('healthy')
        self.assertEqual(result_without,result_with)
        self.assertEqual(without.trace,with_callback.trace)
        self.assertFalse(without.stages)
    def test_callback_failure_is_sanitized_without_native_call_or_private_leak(self):
        fake=Fake('healthy')
        def bad(stage):raise RuntimeError('PRIVATE_CALLBACK_CANARY')
        with patch.object(U.C,'CDLL',side_effect=fake.load):
            with self.assertRaisesRegex(R.Unavailable,'^READINESS_METADATA_UNAVAILABLE$') as caught:
                U.UdevMetadata(bad).scan()
        rendered=''.join(traceback.format_exception(type(caught.exception),caught.exception,caught.exception.__traceback__))
        self.assertNotIn('PRIVATE_CALLBACK_CANARY',rendered)
        self.assertEqual(fake.trace,[])
        with self.assertRaises(R.Unavailable):U.UdevMetadata('PRIVATE_PATH')
    def test_child_stage_values_only_strict_v4_origin_reason_and_no_counts_unavailable(self):
        stage=C.Stage()
        for literal in sorted(U.ADAPTER_STAGES):
            stage.enter(literal)
            value=C.denial('METADATA_UNAVAILABLE',stage.value)
            G.validate(C,value,child=True)
            self.assertEqual(value['schemaVersion'],4)
            self.assertNotIn('counts',value)
            self.assertFalse(any(value[k] for k in G.FALSE_FIELDS))
            for change in ({'schemaVersion':2},{'schemaVersion':3},{'schemaVersion':True},
                           {'diagnosticStage':'PRIVATE_VALUE'},{'reason':'DEADLINE'},
                           {'diagnosticStage':'PARENT_REPLY'},{'private':'PRIVATE_VALUE'}):
                with self.subTest(stage=literal,change=list(change)),self.assertRaises(C.Rejected):
                    G.validate(C,{**value,**change},child=True)
        with self.assertRaises(C.Rejected):stage.enter('PRIVATE_DEVICE_PATH')
    def test_trusted_child_stage_callback_tracks_fixed_attempt_and_no_native_callback(self):
        fake=Fake('context');stage=C.Stage()
        with patch.dict(U.os.environ,U.ENVIRONMENT,clear=True),patch.object(U.os,'uname',side_effect=fake.uname),patch.object(U.C,'CDLL',side_effect=fake.load),patch.object(U.time,'monotonic',side_effect=fake.clock):
            with self.assertRaises(R.Unavailable):U.UdevMetadata(stage.enter).scan()
        self.assertEqual(stage.value,'CHILD_ADAPTER_CONTEXT')
        value=C.denial('METADATA_UNAVAILABLE',stage.value);G.validate(C,value,child=True)
        self.assertNotIn('counts',value)
    def test_new_marker_callback_is_only_fixed_literals_no_metadata_or_device_index(self):
        fake,_=run('healthy')
        self.assertTrue(fake.stages)
        serialized=__import__('json').dumps(fake.stages)
        for private in ('/sys','/dev','Synthetic','2049','PRIVATE','event1'):
            self.assertNotIn(private,serialized)
        self.assertTrue(all(type(x) is str and x in U.ADAPTER_STAGES for x in fake.stages))


if __name__=='__main__':unittest.main()
