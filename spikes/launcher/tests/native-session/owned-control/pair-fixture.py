"""Synthetic production pair tests; no display, library, process or guest."""
import importlib.util
import pathlib
import sys
import unittest

root=pathlib.Path(sys.argv[1]);sys.argv=sys.argv[:1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module);return module
load('private',root/'spikes/launcher/tests/native-session/private.py')
owned=load('owned_pure_fixture',root/'spikes/launcher/tests/native-session/owned-x11.py')
control=load('pair_control',pathlib.Path(__file__).with_name('pair.py'))
klass=(owned.APP_ID.lower()+'\0'+owned.APP_ID+'\0').encode()
value={'pid':101,'primary':123,'auxiliary':124}
class Lease:
    live=True
    def alive(self):return self.live
class Native:
    def __init__(self,change=None):self.calls=[];self.change=change;self.lease=Lease()
    def clients(self):self.calls.append(('clients',0));return [123] if self.change=='missing' else [123,124]
    def pid(self,xid):self.calls.append(('pid',xid));return 999 if self.change=='foreign' and xid==124 else 101
    def class_(self,xid):
        self.calls.append(('class',xid))
        if self.change=='foreign' and xid==124:raise AssertionError('FOREIGN_CLASS_READ')
        return b'synthetic-private-canary' if self.change=='class' and xid==124 else klass
    def geometry(self,xid):
        self.calls.append(('geometry',xid))
        if self.change=='geometry-death':self.lease.live=False
        if self.change=='bad-window':raise owned.MissingWindow()
        return {},{},self.change=='hidden',False
class PairTests(unittest.TestCase):
    def test_two_fixed_own_targets(self):
        x=Native();self.assertEqual(control.pair(x,x.lease,value,owned),{'sameProcess':True,'twoManagedTargets':True,'distinctResources':True})
        self.assertEqual([item for item in x.calls if item[0]=='geometry'],[('geometry',123),('geometry',124)])
    def test_foreign_denial_before_class_and_geometry(self):
        x=Native('foreign')
        with self.assertRaises(owned.Rejected):control.pair(x,x.lease,value,owned)
        self.assertNotIn(('class',124),x.calls);self.assertFalse(any(name=='geometry' for name,_ in x.calls))
    def test_terminal_native_failures(self):
        for change in ('missing','class','hidden','geometry-death','bad-window'):
            with self.subTest(change=change):
                x=Native(change)
                with self.assertRaises((owned.Rejected,owned.MissingWindow)):control.pair(x,x.lease,value,owned)
    def test_invalid_private_packets_stop_before_metadata(self):
        for changed in ({**value,'auxiliary':123},{**value,'pid':True},{**value,'auxiliary':1<<40},{**value,'private':'synthetic-private-canary'},{}):
            with self.subTest():
                x=Native()
                with self.assertRaises(owned.Rejected):control.pair(x,x.lease,changed,owned)
                self.assertEqual(x.calls,[])
    def test_dead_retained_owner_stops_before_metadata(self):
        x=Native();x.lease.live=False
        with self.assertRaises(owned.Rejected):control.pair(x,x.lease,value,owned)
        self.assertEqual(x.calls,[])
unittest.main(verbosity=0)
