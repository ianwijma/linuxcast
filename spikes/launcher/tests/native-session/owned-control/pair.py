"""Fixed private two-own-window control. No compositor setup or activation."""
import importlib.util
import json
import os
import pathlib
import sys
import hashlib

PINS={'private.py':'5eede70c1e363fa67ca65e31d2d120a279fcdc1e0b6f030039ffd664260023a9',
      'owned-x11.py':'c09b3d9684fb6c84dde1fc78c2fcdb27f929be117ee591e162b22029b79c0674'}
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module);return module
def binding(value,owned):
    owned.keys(value,('pid','primary','auxiliary'))
    pid=owned.integer(value['pid'],2,4194304);primary=owned.integer(value['primary'],1,0x1fffffff);auxiliary=owned.integer(value['auxiliary'],1,0x1fffffff)
    owned.require(primary!=auxiliary,'binding')
    return pid,primary,auxiliary
def pair(x,lease,value,owned):
    pid,primary,auxiliary=binding(value,owned)
    owned.require(lease.alive(),'lifetime')
    members=x.clients();owned.require(primary in members and auxiliary in members,'native-query')
    for xid in (primary,auxiliary):
        owned.require(x.pid(xid)==pid,'identity')
        owned.require(x.class_(xid)==(owned.APP_ID.lower()+'\0'+owned.APP_ID+'\0').encode(),'identity')
    for xid in (primary,auxiliary):
        _frame,_area,hidden,_focused=x.geometry(xid);owned.require(not hidden,'native-query')
        owned.require(lease.alive(),'lifetime');owned.require(x.pid(xid)==pid,'identity')
        owned.require(x.class_(xid)==(owned.APP_ID.lower()+'\0'+owned.APP_ID+'\0').encode(),'identity')
    return {'sameProcess':True,'twoManagedTargets':True,'distinctResources':True}
def main():
    if len(sys.argv)!=3 or sys.argv[1]!='--source-root':raise ValueError('CONTROL_ENTRY')
    root=pathlib.Path(sys.argv[2]);directory=root/'spikes/launcher/tests/native-session'
    if not root.is_absolute() or root.resolve(strict=True)!=root:raise ValueError('CONTROL_SOURCE')
    for name,digest in PINS.items():
        path=directory/name
        if path.resolve(strict=True)!=path or not path.is_file():raise ValueError('CONTROL_SOURCE')
        with path.open('rb') as stream:data=stream.read(8*1024*1024+1)
        if len(data)>8*1024*1024 or hashlib.sha256(data).hexdigest()!=digest:raise ValueError('CONTROL_SOURCE')
    private=load('private',directory/'private.py');private.target_guard()
    private.private_root(os.environ.get('LINUXCAST_S001_MATRIX_ROOT',''),'kwin-x11',driver=True)
    if os.environ.get('LINUXCAST_S001_BACKEND')!='kwin-x11':raise ValueError('CONTROL_ROUTE')
    owned=load('owned_control_runtime',directory/'owned-x11.py')
    encoded=sys.stdin.buffer.read(4097)
    owned.require(len(encoded)<=4096,'overflow');value=json.loads(encoded,object_pairs_hook=owned.unique)
    binding(value,owned)
    lease=owned.ProcessLease(value['pid']);x=None
    try:
        x=owned.Xlib();print(json.dumps(pair(x,lease,value,owned),separators=(',',':')),flush=True)
    finally:
        if x:x.close()
        lease.close()
if __name__=='__main__':
    try:main()
    except (BaseException):
        print('{"failure":"control-pair-rejected"}',flush=True);sys.exit(3)
