"""Real disposable child lifecycle only; no native AT/session processes."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

from controller_protocol import ControllerRejected
from session_owner import Channel, Deadline

HERE = Path(__file__).resolve().parent


class OwnershipTests(unittest.TestCase):
    def test_detached_double_fork_descendants_and_private_tree_are_reaped(self):
        # Dedicated interpreter is essential: subreaper authority must never
        # adopt/kill unrelated children of the unit test runner.
        program = r'''
import json,os,sys,time
from pathlib import Path
from session_owner import SessionOwner,Channel,Deadline
owner=SessionOwner()
root=owner.root
try:
 assert root.stat().st_mode & 0o777 == 0o700
 assert all(p.stat().st_mode & 0o777 == 0o700 for p in root.iterdir())
 assert not any(k in owner.env for k in ['PULSE_SERVER','WAYLAND_DISPLAY','SSH_AUTH_SOCK'])
 assert owner.env['DBUS_SYSTEM_BUS_ADDRESS']==f'unix:path={root}/runtime/no-system-bus'
 child=owner.spawn([sys.executable,'-c',"import os,time; p=os.fork(); (os.setsid(),os.fork()) if p==0 else None; time.sleep(30)"])
 owner.refresh()
 time.sleep(.1)
 owner.refresh()
 count=len(owner.handles)
finally:
 clean=owner.cleanup()
print(json.dumps({'clean':clean,'removed':not root.exists(),'descendants':count>=3,'directReaped':child.returncode is not None}))
'''
        result = subprocess.run([sys.executable, "-B", "-c", program], cwd=HERE,
                                env={"PATH": "/usr/bin:/bin"}, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertEqual(json.loads(result.stdout), {"clean": True, "removed": True, "descendants": True, "directReaped": True})

    def test_failed_spawn_and_timeout_still_remove_private_root(self):
        program = r'''
import json,sys
from session_owner import SessionOwner,Deadline
from controller_protocol import ControllerRejected
owner=SessionOwner(); root=owner.root; missing=False; timeout=False
try:
 try: owner.spawn(['/nonexistent-linuxcast-test'])
 except FileNotFoundError: missing=True
 try: owner.run([sys.executable,'-c','import time;time.sleep(30)'],Deadline(.03))
 except ControllerRejected as e: timeout=str(e)=='deadline'
finally: clean=owner.cleanup()
print(json.dumps({'missing':missing,'timeout':timeout,'clean':clean,'removed':not root.exists()}))
'''
        result = subprocess.run([sys.executable, "-B", "-c", program], cwd=HERE,
                                env={"PATH": "/usr/bin:/bin"}, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertTrue(all(json.loads(result.stdout).values()))

    def test_bounded_channel_rejects_eof_partial_oversize_and_timeout(self):
        for output in ("", "partial", "x" * 66000):
            with self.subTest(length=len(output)):
                child = subprocess.Popen([sys.executable, "-c", "import sys;sys.stdout.write(sys.argv[1])", output],
                                         stdout=subprocess.PIPE, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
                try:
                    with self.assertRaises(ControllerRejected):
                        Channel(child).line(Deadline(2))
                finally:
                    child.kill()
                    child.wait(timeout=2)
                    child.stdin.close()
                    child.stdout.close()
        child = subprocess.Popen([sys.executable, "-c", "import time;time.sleep(30)"],
                                 stdout=subprocess.PIPE, stdin=subprocess.PIPE)
        try:
            with self.assertRaisesRegex(ControllerRejected, "deadline"):
                Channel(child).line(Deadline(.03))
        finally:
            child.kill()
            child.wait(timeout=2)
            child.stdin.close()
            child.stdout.close()

    def test_cleanup_kills_retained_children_even_if_discovery_keeps_failing(self):
        program = r'''
import json,os,shutil,sys,time
from unittest import mock
from session_owner import SessionOwner
owner=SessionOwner(); root=owner.root
child=owner.spawn([sys.executable,'-c',"import os,time; p=os.fork(); (os.setsid(),os.fork()) if p==0 else None; time.sleep(30)"])
time.sleep(.1);owner.refresh(); retained=list(owner.handles)
raised=False;clean=True
try:
 with mock.patch.object(owner,'refresh',side_effect=OSError('SYNTHETIC_DISCOVERY_FAILURE')):
  try: clean=owner.cleanup()
  except Exception: raised=True
 dead=all(not os.path.exists(f'/proc/{pid}') for pid in retained)
 preserved=root.exists()
finally:
 # Safe fixture fallback also prevents a regression from leaking its children.
 for pid in retained:
  try: os.kill(pid,9)
  except ProcessLookupError: pass
 child.wait(timeout=2)
 while True:
  try: os.waitpid(-1,0)
  except ChildProcessError: break
 shutil.rmtree(root,ignore_errors=True)
print(json.dumps({'reportedFailure':not clean,'noRaise':not raised,'allRetainedReaped':dead,'directReaped':child.returncode is not None,'unverifiedRootPreserved':preserved}))
'''
        result = subprocess.run([sys.executable, "-B", "-c", program], cwd=HERE,
                                env={"PATH": "/usr/bin:/bin"}, capture_output=True, timeout=9)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertTrue(all(json.loads(result.stdout).values()))

    def test_cleanup_reaps_a_popen_child_when_pidfd_acquisition_failed(self):
        program = r'''
import json,shutil,sys
from unittest import mock
from session_owner import SessionOwner
owner=SessionOwner();root=owner.root;calls=0
refresh=owner.refresh
def fail_after_spawn():
 global calls
 calls+=1
 if calls>1: raise OSError('SYNTHETIC_PIDFD_EXHAUSTION')
 refresh()
try:
 with mock.patch.object(owner,'refresh',side_effect=fail_after_spawn):
  try: owner.spawn([sys.executable,'-c','import time;time.sleep(30)'])
  except OSError: pass
  child=owner.children[-1]
  clean=owner.cleanup()
 print(json.dumps({'reportedFailure':not clean,'directReaped':child.returncode is not None,'noPidfd':not owner.handles,'unverifiedRootPreserved':root.exists()}))
finally:
 if child.poll() is None: child.kill()
 child.wait(timeout=2);shutil.rmtree(root,ignore_errors=True)
'''
        result = subprocess.run([sys.executable, "-B", "-c", program], cwd=HERE,
                                env={"PATH": "/usr/bin:/bin"}, capture_output=True, timeout=9)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertTrue(all(json.loads(result.stdout).values()))

    def test_recovered_discovery_still_reports_earlier_cleanup_failure(self):
        program = r'''
import json,sys
from unittest import mock
from session_owner import SessionOwner
owner=SessionOwner();root=owner.root;child=owner.spawn([sys.executable,'-c','import time;time.sleep(30)'])
refresh=owner.refresh;calls=0
def transient():
 global calls
 calls+=1
 if calls==1: raise OSError('SYNTHETIC_TRANSIENT_DISCOVERY_FAILURE')
 refresh()
with mock.patch.object(owner,'refresh',side_effect=transient):clean=owner.cleanup()
print(json.dumps({'reportedFailure':not clean,'directReaped':child.returncode is not None,'verifiedRootRemoved':not root.exists(),'retried':calls>1}))
'''
        result = subprocess.run([sys.executable, "-B", "-c", program], cwd=HERE,
                                env={"PATH": "/usr/bin:/bin"}, capture_output=True, timeout=9)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertTrue(all(json.loads(result.stdout).values()))

    def test_replaced_same_uid_external_path_is_preserved_and_cleanup_fails(self):
        program = r'''
import json,os,sys,tempfile
from pathlib import Path
from session_owner import SessionOwner,Channel,Deadline
with tempfile.TemporaryDirectory() as temporary:
 external=Path(temporary);lock=external/'server-lock';endpoint=external/'server-socket'
 owner=SessionOwner();owner.external=[lock,endpoint]
 source="import os,socket,sys,time; from pathlib import Path; s=socket.socket(socket.AF_UNIX);s.bind(sys.argv[2]);s.listen();Path(sys.argv[1]).write_text(str(os.getpid()));print('ready',flush=True);time.sleep(30)"
 child=owner.spawn([sys.executable,'-c',source,str(lock),str(endpoint)],protocol=True)
 assert Channel(child).line(Deadline(2))==b'ready\n'
 owner.bind_x_server_paths(child,lock,endpoint)
 lock.rename(external/'retained-original-lock')
 lock.write_text(str(child.pid)) # Same UID, kind and content; different inode.
 clean=owner.cleanup()
 print(json.dumps({'reportedFailure':not clean,'replacementPreserved':lock.read_text()==str(child.pid),'ownedSocketRemoved':not endpoint.exists(),'directReaped':child.returncode is not None,'privateRootRemoved':not owner.root.exists()}))
'''
        result = subprocess.run([sys.executable, "-B", "-c", program], cwd=HERE,
                                env={"PATH": "/usr/bin:/bin"}, capture_output=True, timeout=9)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertTrue(all(json.loads(result.stdout).values()))

    def test_failed_identity_verification_closes_unregistered_pidfd(self):
        program = r'''
import json,os,sys
from pathlib import Path
from unittest import mock
from session_owner import SessionOwner
owner=SessionOwner();child=owner.spawn([sys.executable,'-c','import time;time.sleep(30)'])
os.close(owner.handles.pop(child.pid));owner.identities.pop(child.pid)
before=len(os.listdir('/proc/self/fd'));read=Path.read_text;count=0
def identity(path,*args,**kwargs):
 global count
 if path==Path(f'/proc/{child.pid}/stat'):
  count+=1
  if count==2: raise OSError('SYNTHETIC_IDENTITY_READ_FAILURE')
 return read(path,*args,**kwargs)
try:
 with mock.patch.object(Path,'read_text',identity):
  try:owner.refresh()
  except OSError:pass
 noLeak=len(os.listdir('/proc/self/fd'))==before
finally:clean=owner.cleanup()
print(json.dumps({'noUnregisteredLeak':noLeak,'clean':clean,'directReaped':child.returncode is not None}))
'''
        result = subprocess.run([sys.executable, "-B", "-c", program], cwd=HERE,
                                env={"PATH": "/usr/bin:/bin"}, capture_output=True, timeout=9)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertTrue(all(json.loads(result.stdout).values()))

    def test_unreadable_or_malformed_live_adopted_entry_never_verifies_absence(self):
        for mode in ("persistent-permission", "transient-permission", "malformed-live"):
            with self.subTest(mode=mode):
                program = r'''
import contextlib,json,os,shutil,sys,time
from pathlib import Path
from unittest import mock
from session_owner import SessionOwner
owner=SessionOwner();root=owner.root;marker=root/'adopted.pid'
source="import os,sys,time;from pathlib import Path;p=os.fork();os._exit(0) if p else None;os.setsid();Path(sys.argv[1]).write_text(str(os.getpid()));time.sleep(30)"
child=owner.spawn([sys.executable,'-c',source,str(marker)],required=False)
deadline=time.monotonic()+2
while not marker.exists():
 if time.monotonic()>deadline:raise RuntimeError('fixture startup')
 time.sleep(.01)
child.wait(timeout=2);adopted=int(marker.read_text())
if adopted in owner.handles:os.close(owner.handles.pop(adopted))
owner.identities.pop(adopted,None)
read=Path.read_text;calls=0;mode=sys.argv[1]
def fault(path,*args,**kwargs):
 global calls
 if path==Path(f'/proc/{adopted}/stat'):
  calls+=1
  if mode=='malformed-live':return 'malformed synthetic stat'
  if mode=='persistent-permission' or calls==1:raise PermissionError('synthetic unreadable live entry')
 return read(path,*args,**kwargs)
clock=contextlib.nullcontext() if mode=='transient-permission' else mock.patch('session_owner.time.monotonic',side_effect=[100,106])
try:
 with mock.patch.object(Path,'read_text',fault),clock:clean=owner.cleanup()
 alive=Path(f'/proc/{adopted}').exists()
 valid=(not clean and (root.exists() if alive else not root.exists()) and calls>0)
finally:
 try:os.kill(adopted,9)
 except ProcessLookupError:pass
 while True:
  try:os.waitpid(-1,0)
  except ChildProcessError:break
 shutil.rmtree(root,ignore_errors=True)
print(json.dumps({'noFalseClean':valid,'transientReaped':mode!='transient-permission' or not alive}))
'''
                result = subprocess.run([sys.executable, "-B", "-c", program, mode], cwd=HERE,
                                        env={"PATH": "/usr/bin:/bin"}, capture_output=True, timeout=9)
                self.assertEqual(result.returncode, 0, result.stderr.decode())
                self.assertTrue(all(json.loads(result.stdout).values()))


if __name__ == "__main__":
    unittest.main()
