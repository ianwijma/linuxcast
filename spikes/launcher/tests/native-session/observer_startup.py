"""Fixed own-Shell startup evidence. Raw output is transient and never exported."""
import json
import math
import os
import pathlib
import re
import select
import subprocess
import sys
import threading
import time

PREFIX = b'LINUXCAST_S001_OBSERVER:'
CHECKPOINTS = ('MODULE_ENTERED','ENABLE_ENTERED','PRIVATE_CONTEXT_REJECTED','PRIVATE_CONTEXT_ACCEPTED','POLL_INSTALLED','FIRST_POLL_TICK','DISABLED',
    'CONTEXT_NOT_OBSERVED','READ_FAILED','SIZE_REJECTED','DECODE_FAILED','JSON_REJECTED','SCHEMA_REJECTED','STALE_REQUEST','PREVALIDATION_FAILED')
EVENTS = ('REQUEST_VALIDATED','REPLY_PUBLISHED','HOOK_FAILURE_PUBLISHED')
STATES = (1,2,3,4,5,6,7,8,99)
UUID = 's001-launcher-observer@linuxcast.invalid'


def info(value):
    if type(value) is not dict: raise ValueError('OBSERVER_INFO_SCHEMA')
    if value == {'status':'INFO_UNAVAILABLE'} or value == {'status':'NOT_FOUND'}: return dict(value)
    if set(value)!= {'status','state','enabled'} or value['status']!='INFO_AVAILABLE' or type(value['state']) is not int or value['state'] not in STATES or type(value['enabled']) is not bool:
        raise ValueError('OBSERVER_INFO_SCHEMA')
    return {'status':'INFO_AVAILABLE','state':value['state'],'enabled':value['enabled']}


def snapshot(value):
    if type(value) is not dict or set(value)!= {'checkpoints','requests','extensionInfo'}: raise ValueError('OBSERVER_STARTUP_SCHEMA')
    checkpoints=value['checkpoints'];requests=value['requests']
    if type(checkpoints) is not list or len(checkpoints)>len(CHECKPOINTS) or any(type(v) is not str or v not in CHECKPOINTS for v in checkpoints) or len(set(checkpoints))!=len(checkpoints):
        raise ValueError('OBSERVER_CHECKPOINT_SCHEMA')
    if type(requests) is not list or len(requests)>16: raise ValueError('OBSERVER_REQUEST_BOUND')
    safe=[]
    for row in requests:
        if type(row) is not dict or set(row)!= {'event','request'} or type(row['event']) is not str or row['event'] not in EVENTS or type(row['request']) is not int or not 1<=row['request']<=1000: raise ValueError('OBSERVER_REQUEST_SCHEMA')
        safe.append({'event':row['event'],'request':row['request']})
    return {'checkpoints':list(checkpoints),'requests':safe,'extensionInfo':info(value['extensionInfo'])}


def lifecycle_sample(value):
    if type(value) is not dict or set(value)!= {'compositor','drain'}: raise ValueError('OBSERVER_LIFECYCLE_SCHEMA')
    process=value['compositor'];drain=value['drain']
    if type(process) is not dict or set(process)!= {'state','exitCode'}: raise ValueError('OBSERVER_PROCESS_SCHEMA')
    code=process['exitCode']
    if process['state']=='running':
        if code is not None: raise ValueError('OBSERVER_PROCESS_SCHEMA')
    elif process['state']=='exited':
        if type(code) is not int or not -64<=code<=255: raise ValueError('OBSERVER_PROCESS_SCHEMA')
    else: raise ValueError('OBSERVER_PROCESS_SCHEMA')
    if type(drain) is not dict or set(drain)!= {'eofObserved','readerAlive','stopRequested'} or any(type(v) is not bool for v in drain.values()):
        raise ValueError('OBSERVER_DRAIN_SCHEMA')
    return {'compositor':{'state':process['state'],'exitCode':code},'drain':{key:drain[key] for key in ('eofObserved','readerAlive','stopRequested')}}


def lifecycle(value):
    if type(value) is not dict or 'finally' not in value or not set(value)<= {'beforeChecker','afterChecker','finally'}:
        raise ValueError('OBSERVER_LIFECYCLE_SCHEMA')
    return {key:lifecycle_sample(value[key]) for key in ('beforeChecker','afterChecker','finally') if key in value}


def runtime_sample(process,drain):
    # Only this own Popen is sampled. No process enumeration, wait or signal.
    code=process.poll()
    return lifecycle_sample({'compositor':{'state':'running' if code is None else 'exited','exitCode':code},'drain':drain.health()})


def diagnostic(value):
    if type(value) is not dict or 'latest' not in value or not set(value)<= {'beforeChecker','latest','lifecycle'}: raise ValueError('OBSERVER_STARTUP_SCHEMA')
    result={'latest':snapshot(value['latest'])}
    if 'beforeChecker' in value: result['beforeChecker']=snapshot(value['beforeChecker'])
    if 'lifecycle' in value: result['lifecycle']=lifecycle(value['lifecycle'])
    return result


class FixedOutput:
    def __init__(self):
        self.checkpoints=[];self.requests=[];self.line=bytearray();self.discard=False
        self.extension_info={'status':'INFO_UNAVAILABLE'};self.lock=threading.Lock()

    def feed(self,data):
        with self.lock:
            for byte in data:
                if byte==10:
                    if not self.discard: self._line(bytes(self.line))
                    self.line.clear();self.discard=False
                elif not self.discard:
                    if len(self.line)>=256: self.line.clear();self.discard=True
                    else: self.line.append(byte)

    def _line(self,line):
        if not line.startswith(PREFIX): return
        suffix=line[len(PREFIX):]
        if suffix in tuple(v.encode('ascii') for v in CHECKPOINTS):
            marker=suffix.decode('ascii')
            if marker not in self.checkpoints: self.checkpoints.append(marker)
            return
        match=re.fullmatch(rb'(REQUEST_VALIDATED|REPLY_PUBLISHED|HOOK_FAILURE_PUBLISHED):([1-9][0-9]{0,3})',suffix)
        if match and int(match[2])<=1000:
            self.requests.append({'event':match[1].decode('ascii'),'request':int(match[2])})
            self.requests=self.requests[-16:]

    def set_info(self,value):
        with self.lock: self.extension_info=info(value)

    def snapshot(self):
        with self.lock: return snapshot({'checkpoints':self.checkpoints,'requests':self.requests,'extensionInfo':self.extension_info})


class ShellDrain(FixedOutput):
    def __init__(self,stream):
        super().__init__();self.stream=stream;self.stop_event=threading.Event()
        self.eof_observed=False
        os.set_blocking(stream.fileno(),False)
        self.shutdown_deadline=0.0
        self.thread=threading.Thread(target=self._drain,daemon=True);self.thread.start()

    def _drain(self):
        try:
            while True:
                stopping=self.stop_event.is_set()
                if stopping and time.monotonic()>=self.shutdown_deadline: return
                if not select.select([self.stream],[],[],0.01 if stopping else 0.05)[0]:
                    if stopping: return
                    continue
                try: data=os.read(self.stream.fileno(),4096)
                except BlockingIOError: continue
                if not data:
                    with self.lock: self.eof_observed=True
                    return
                self.feed(data)
        except (OSError,ValueError): pass

    def close(self):
        self.shutdown_deadline=time.monotonic()+0.15
        self.stop_event.set();self.thread.join(timeout=0.2);self.stream.close()
        with self.lock: self.line.clear();self.discard=False

    def health(self):
        # Independent observed facts: EOF does not imply process exit, and a
        # live reader can outlast an exited parent whose child holds the pipe.
        with self.lock:
            return {'eofObserved':self.eof_observed,'readerAlive':self.thread.is_alive(),'stopRequested':self.stop_event.is_set()}


def extract_info(reply):
    # Never unpack/copy metadata, paths or error strings from the vardict.
    try:
        if reply.get_type_string()!='(a{sv})': return {'status':'INFO_UNAVAILABLE'}
        row=reply.get_child_value(0)
        if row.n_children()==0: return {'status':'NOT_FOUND'}
        state=row.lookup_value('state',None);enabled=row.lookup_value('enabled',None)
        if state is None or enabled is None or state.get_type_string()!='d' or enabled.get_type_string()!='b': return {'status':'INFO_UNAVAILABLE'}
        number=state.get_double();boolean=enabled.get_boolean()
        if type(number) not in (int,float) or not math.isfinite(number) or number!=int(number) or int(number) not in STATES or type(boolean) is not bool: return {'status':'INFO_UNAVAILABLE'}
        return {'status':'INFO_AVAILABLE','state':int(number),'enabled':boolean}
    except (TypeError,ValueError,AttributeError,OverflowError): return {'status':'INFO_UNAVAILABLE'}


def gio_info():
    # The direct helper is guarded before importing Gio or connecting any bus.
    from private import target_guard,private_root
    target_guard();private_root(os.environ.get('LINUXCAST_S001_MATRIX_ROOT',''),os.environ.get('LINUXCAST_S001_BACKEND',''),driver=True)
    import gi
    gi.require_version('Gio','2.0')
    from gi.repository import Gio,GLib
    connection=Gio.bus_get_sync(Gio.BusType.SESSION,None)
    reply=connection.call_sync('org.gnome.Shell','/org/gnome/Shell','org.gnome.Shell.Extensions','GetExtensionInfo',
        GLib.Variant('(s)',(UUID,)),GLib.VariantType.new('(a{sv})'),Gio.DBusCallFlags.NONE,800,None)
    return extract_info(reply)


def query_once(env,startup_deadline,run=subprocess.run,clock=time.monotonic):
    # One attempt. The outer timeout also contains Gio connection establishment;
    # reserve up to100ms of the <=1s/original-startup budget for spawn/kill/reap.
    started=clock();budget=min(1.0,startup_deadline-started)
    if budget<=0: return {'status':'INFO_UNAVAILABLE'}
    try:
        result=run(['/usr/bin/python3',str(pathlib.Path(__file__).resolve()),'--extension-info'],env=env,
            stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=budget-min(0.1,budget/2))
        if clock()>started+budget or result.returncode!=0 or len(result.stdout)>256: return {'status':'INFO_UNAVAILABLE'}
        return info(json.loads(result.stdout))
    except (OSError,ValueError,subprocess.TimeoutExpired): return {'status':'INFO_UNAVAILABLE'}


if __name__=='__main__':
    result={'status':'INFO_UNAVAILABLE'}
    try:
        if sys.argv[1:] == ['--extension-info']: result=gio_info()
    except Exception: pass  # Never publish the exception, bus metadata or input.
    print(json.dumps(result))
