"""Dedicated guardian ownership; never peer authentication.
Copied from reviewed Family470c0bee8a6771f8f1634f34308f5ce9e640c2a4a64b83b5b5352ee77edd30c5.
Delta: absolute stop deadline and250ms TERM grace; no new budget after expiry.
Source copying requires fresh review; no runtime private-capsule dependency.
"""
import contextlib,ctypes,os,pathlib,select,signal,subprocess,time
libc=ctypes.CDLL(None,use_errno=True)
CANCEL_SIGNALS={signal.SIGTERM,signal.SIGHUP,signal.SIGINT}
class Cancelled(Exception):pass
class Cancellation:
 def __init__(self):self.cleaning=False;self.cancelled=False;self.previous={}
 def __enter__(self):
  for number in CANCEL_SIGNALS:self.previous[number]=signal.signal(number,self.receive)
  return self
 def receive(self,number,frame):
  self.cancelled=True
 def check(self):
  if self.cancelled and not self.cleaning:raise Cancelled()
 def cleanup(self):self.cleaning=True
 @contextlib.contextmanager
 def critical(self):
  old=signal.pthread_sigmask(signal.SIG_BLOCK,CANCEL_SIGNALS)
  try:yield old
  finally:signal.pthread_sigmask(signal.SIG_SETMASK,old)
  self.check()
 def __exit__(self,*args):
  for number,handler in self.previous.items():signal.signal(number,handler)

def children():return [int(x) for x in pathlib.Path('/proc/self/task',str(os.getpid()),'children').read_text().split()]
def absent(group):
 try:os.killpg(group,0);return False
 except ProcessLookupError:return True
 except PermissionError:return False
class Family:
 def __init__(self):
  assert not children() and signal.getsignal(signal.SIGCHLD)==signal.SIG_DFL
  signal.signal(signal.SIGCHLD,signal.SIG_DFL) # Clear inherited SA_NOCLDWAIT as well.
  assert libc.prctl(36,1,0,0,0)==0 # PR_SET_CHILD_SUBREAPER
  self.handles={};self.groups=set();self.popen={};self.fault=False;self.unbound=set()
 def adopt(self):
  try:current=children()
  except Exception:self.fault=True;return
  for pid in current:
   if pid in self.handles:continue
   fd=None
   try:
    fd=os.pidfd_open(pid,0);assert pid in children()
    group=os.getpgid(pid);self.handles[pid]=(fd,group);self.groups.add(group) if group!=os.getpgrp() else None;self.unbound.discard(pid)
   except Exception:
    if fd is not None:os.close(fd)
    self.unbound.add(pid);self.fault=True
 def spawn(self,argv,guard,*,channel_fd=None,**kwargs):
  assert 'preexec_fn' not in kwargs and 'start_new_session' not in kwargs
  parent=os.getpid()
  with guard.critical() as mask:
   def before_exec():
    signal.pthread_sigmask(signal.SIG_SETMASK,mask)
    if libc.prctl(1,signal.SIGKILL,0,0,0)!=0 or os.getppid()!=parent:os._exit(123)
    if channel_fd is not None:
     os.dup2(channel_fd,3,inheritable=True)
     if channel_fd!=3:os.close(channel_fd)
   process=subprocess.Popen(argv,start_new_session=True,preexec_fn=before_exec,**kwargs)
   self.popen[process.pid]=process
   self.adopt()
  assert process.pid in self.handles
  return process
 def fork(self,callback,guard):
  parent=os.getpid()
  with guard.critical() as mask:
   pid=os.fork()
   if pid==0:
    signal.pthread_sigmask(signal.SIG_SETMASK,mask)
    for number in CANCEL_SIGNALS:signal.signal(number,signal.SIG_DFL)
    try:os.setpgid(0,0);callback(parent)
    except BaseException:os._exit(123)
    os._exit(0)
   # Raw fork has no exec race: both calls establish the same owned group
   # before adopt reads PGID, regardless of which process is scheduled first.
   os.setpgid(pid,pid);self.adopt()
  assert pid in self.handles
  return pid
 def alive(self,pid):
  assert pid in self.handles
  poll=select.poll();poll.register(self.handles[pid][0],select.POLLIN)
  return not poll.poll(0)
 def exited(self,pid):
  result=os.waitid(os.P_PID,pid,os.WEXITED|os.WNOHANG|os.WNOWAIT)
  return None if result is None else result.si_status if result.si_code==os.CLD_EXITED else -result.si_status
 def signal_all(self,number):
  self.adopt()
  for pid,(fd,group) in list(self.handles.items()):
   try:signal.pidfd_send_signal(fd,number,None,0)
   except ProcessLookupError:pass
   except OSError:self.fault=True
  # Direct, still-unreaped operational children only. No numeric group signal.
  for pid in list(self.unbound):
   try:
    if pid in children():os.kill(pid,number)
    else:self.unbound.discard(pid)
   except ProcessLookupError:pass
   except Exception:self.fault=True
 def reap(self):
  self.adopt()
  for pid in list(set(self.handles)|self.unbound):
   try:done,status=os.waitpid(pid,os.WNOHANG)
   except ChildProcessError:self.fault=True;continue
   except Exception:self.fault=True;continue
   if done:
    if pid in self.popen:self.popen[pid].returncode=os.waitstatus_to_exitcode(status)
    if pid in self.handles:os.close(self.handles.pop(pid)[0])
    self.unbound.discard(pid)
 def observation(self):
  self.adopt();counts={'knownLive':0,'knownExitReady':0,'unknown':len(self.unbound),'knownReaped':0}
  for fd,group in self.handles.values():
   try:
    poll=select.poll();poll.register(fd,select.POLLIN);events=poll.poll(0)
    counts['knownExitReady' if events and all(mask & select.POLLIN for _,mask in events) else 'knownLive' if not events else 'unknown']+=1
   except Exception:counts['unknown']+=1
  return counts
 def stop(self,deadline):
  hard=min(deadline,time.monotonic()+.25)
  while time.monotonic()<deadline:
   self.signal_all(signal.SIGTERM if time.monotonic()<hard else signal.SIGKILL);self.reap()
   if not self.handles and not self.unbound and not children():break
   time.sleep(.005)
  self.signal_all(signal.SIGKILL);self.reap()
  return {'ownedChildrenAbsent':not self.handles and not self.unbound and not children(),'ownedGroupsAbsent':all(absent(g) for g in self.groups),'signalOperationsSucceeded':not self.fault}
