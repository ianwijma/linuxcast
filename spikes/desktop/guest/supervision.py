"""Linux process-local ownership of a disposable harness tree, across sessions.
No process names, command lines, environment or unrelated process trees are read.
SIGKILL of this supervisor itself is outside the cooperative cancellation claim.
"""
import ctypes
import os
import pathlib
import select
import signal
import time

class Cancelled(BaseException):
    pass

class Supervisor:
    def __init__(self, grace=8):
        self.grace=grace
        self.previous={}
        self.closed=False

    def __enter__(self):
        # Orphaned double-forks are adopted here, not left to the session's init.
        libc=ctypes.CDLL(None,use_errno=True)
        if libc.prctl(36,1,0,0,0)!=0:  # PR_SET_CHILD_SUBREAPER
            raise OSError('PRIVATE_SUBREAPER_REQUIRED')
        if not hasattr(os,'pidfd_open') or not hasattr(signal,'pidfd_send_signal'):
            raise OSError('PRIVATE_PIDFD_REQUIRED')
        for value in (signal.SIGTERM,signal.SIGINT):
            self.previous[value]=signal.signal(value,self.interrupted)
        return self

    @staticmethod
    def interrupted(_value,_frame):
        raise Cancelled()

    @staticmethod
    def descendants():
        found={}
        pending=[os.getpid()]
        while pending:
            parent=pending.pop()
            try:
                children=pathlib.Path(f'/proc/{parent}/task/{parent}/children').read_text().split()
            except FileNotFoundError:
                continue
            for child in children:
                pid=int(child)
                if pid not in found:
                    found[pid]=parent
                    pending.append(pid)
                    if len(found)>1024: raise OSError('PRIVATE_PROCESS_TREE_BOUND')
        return found

    @staticmethod
    def open_owned(pid,parent):
        try:
            descriptor=os.pidfd_open(pid)
        except ProcessLookupError:
            return None
        try:
            # Verify ancestry after opening the stable process reference. A
            # process that reparented is rediscovered on the next bounded scan.
            status=pathlib.Path(f'/proc/{pid}/status').read_text().splitlines()
            actual=next(int(line.split()[1]) for line in status if line.startswith('PPid:'))
            if actual==parent: return descriptor
        except (FileNotFoundError,ProcessLookupError):
            pass
        os.close(descriptor)
        return None

    @staticmethod
    def reap():
        while True:
            try:
                if os.waitpid(-1,os.WNOHANG)[0]==0: return
            except ChildProcessError:
                return

    def close(self):
        if self.closed: return
        self.closed=True
        # Repeated cancellation must not interrupt the bounded teardown.
        for value in self.previous: signal.signal(value,signal.SIG_IGN)
        descriptors={}
        started=time.monotonic()
        try:
            while True:
                self.reap()
                descendants=self.descendants()
                if not descendants: return
                force=time.monotonic()-started>=self.grace
                for pid,parent in descendants.items():
                    previous=descriptors.get(pid)
                    if previous is not None and select.select([previous],[],[],0)[0]:
                        os.close(previous); del descriptors[pid]
                    if pid not in descriptors:
                        descriptor=self.open_owned(pid,parent)
                        if descriptor is None: continue
                        descriptors[pid]=descriptor
                        try: signal.pidfd_send_signal(descriptor,signal.SIGTERM)
                        except ProcessLookupError: pass
                    if force:
                        try: signal.pidfd_send_signal(descriptors[pid],signal.SIGKILL)
                        except ProcessLookupError: pass
                if time.monotonic()-started>self.grace+3:
                    raise OSError('PRIVATE_PROCESS_TEARDOWN_DEADLINE')
                time.sleep(0.02)
        finally:
            for descriptor in descriptors.values(): os.close(descriptor)
            for value,previous in self.previous.items(): signal.signal(value,previous)

    def __exit__(self,_kind,_error,_traceback):
        self.close()
