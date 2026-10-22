#!/usr/bin/python3
"""Actual helper SIGKILL and explicit KWin reload; only inside private guest session."""
import json
import os
import pathlib
import re
import signal
import subprocess
import sys
import time
import gi

gi.require_version('Gio','2.0')
from gi.repository import Gio, GLib
HERE=pathlib.Path(__file__).resolve().parent
ROOT=pathlib.Path(os.environ.get('LINUXCAST_S002_RESULT_DIR',''))
BUS='io.github.ianwijma.Linuxcast.Spike.Desktop1'
TAG='LINUXCAST_S002_RESTART:'
NAME='linuxcast-s002-restart'
if os.environ.get('LINUXCAST_S002_PRIVATE_GUEST')!='1' or not str(ROOT).startswith('/tmp/linuxcast-s002-') or not os.environ.get('LINUXCAST_S002_CANARY_PID'): sys.exit(3)

class Failure(Exception): pass

def read_json(name):
    file=ROOT/name
    if not file.exists(): return None
    if file.stat().st_size>8192: raise Failure('PRIVATE_RESULT_LIMIT')
    return json.loads(file.read_text())

def events():
    file=ROOT/'private-compositor.log'
    if not file.exists(): return []
    with file.open('rb') as stream:
        stream.seek(max(0,file.stat().st_size-131072)); content=stream.read(131072).decode('utf8','replace')
    values=[]
    for line in content.splitlines():
        if TAG not in line: continue
        encoded=line.split(TAG,1)[1]
        if len(encoded)>8192: raise Failure('NATIVE_OBSERVATION_LIMIT')
        try: value=json.JSONDecoder().raw_decode(encoded)[0]
        except ValueError: continue
        if isinstance(value,dict) and value.get('phase') in ('crash','fresh') and value.get('event') in ('context','native-geometry','stale-handle-denied','unexpected-placement','stopped'):
            values.append(value)
    return values

def wait_for(predicate,reason,seconds=5):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        value=predicate()
        if value: return value
        time.sleep(0.05)
    raise Failure(reason)

def native_call(method,*args):
    result=subprocess.run(['gdbus','call','--session','--dest','org.kde.KWin','--object-path','/Scripting','--method','org.kde.kwin.Scripting.'+method,*args],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=3)
    if result.returncode: raise Failure('NATIVE_SCRIPT_CONTROL_FAILED')
    return result.stdout

def load_script():
    value=native_call('loadScript',str(HERE/'restart-script.js'),NAME)
    match=re.search(r'\((?:int32 )?([0-9]+),?\)',value)
    if not match: raise Failure('NATIVE_SCRIPT_ID_REQUIRED')
    result=subprocess.run(['gdbus','call','--session','--dest','org.kde.KWin','--object-path','/Scripting/Script'+match.group(1),'--method','org.kde.kwin.Script.run'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=3)
    if result.returncode: raise Failure('NATIVE_SCRIPT_START_FAILED')

def stop_group(child,kill=False):
    try: os.killpg(child.pid,signal.SIGKILL if kill else signal.SIGTERM)
    except ProcessLookupError: pass
    try: child.wait(timeout=2)
    except subprocess.TimeoutExpired:
        try: os.killpg(child.pid,signal.SIGKILL)
        except ProcessLookupError: pass
        child.wait()

def main():
    children=[]
    def interrupted(_signal,_frame): raise Failure('PRIVATE_RESTART_INTERRUPTED')
    signal.signal(signal.SIGTERM,interrupted); signal.signal(signal.SIGINT,interrupted)
    connection=Gio.bus_get_sync(Gio.BusType.SESSION,None)
    def owned():
        return connection.call_sync('org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','NameHasOwner',GLib.Variant('(s)',(BUS,)),GLib.VariantType.new('(b)'),Gio.DBusCallFlags.NONE,1000,None).unpack()[0]
    def helper(phase,old=None):
        env=dict(os.environ); env['LINUXCAST_S002_RESTART_PHASE']=phase
        env['LINUXCAST_S002_GENERATION_BASE']=str(old['generation'] if old else 0)
        if old: env['LINUXCAST_S002_OLD_HANDLE']=json.dumps(old)
        child=subprocess.Popen(['/usr/bin/python3',str(HERE/'restart-bus.py')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
        children.append(child); wait_for(owned,'PRIVATE_HELPER_NAME_REQUIRED'); return child
    result={'kind':'actual-KWin-private-helper-process-restart-and-explicit-script-reload','state':'running','syntheticReconnectUsed':False,
            'physicalDesktopMatrixEstablished':False,'hostDisplayClipboardOrSettingsUsed':False}
    try:
        if owned(): raise Failure('FRESH_PRIVATE_HELPER_BUS_REQUIRED')
        result['initialMissingCompanion']=True
        first=helper('crash'); load_script()
        held=wait_for(lambda:read_json('restart-held.json'),'REAL_PENDING_REPLY_REQUIRED')
        if not held.get('actualDbusInvocationPending') or not held.get('queueInFlight') or held.get('deliveredToScript') is not False: raise Failure('REAL_IN_FLIGHT_COMMAND_REQUIRED')
        old=wait_for(lambda:read_json('restart-crash-metrics.json'),'OLD_INSTANCE_REQUIRED')['handle']
        stop_group(first,kill=True)
        result['actualHelperSigkill']=first.returncode==-signal.SIGKILL
        wait_for(lambda:not owned(),'HELPER_NAME_MUST_DISAPPEAR')
        stopped=wait_for(lambda:next((value for value in events() if value.get('phase')=='crash' and value.get('event')=='stopped'),None),'REAL_WATCHDOG_UNAVAILABLE_REQUIRED',seconds=4)
        if stopped.get('reason')!='COMPANION_DBUS_TIMEOUT' or stopped.get('executions')!=1 or stopped.get('placements')!=0: raise Failure('WATCHDOG_MUST_STOP_WITHOUT_EXECUTING_LOST_PLACEMENT')
        if 'Reload' not in stopped.get('action',''): raise Failure('ACTIONABLE_RELOAD_REQUIRED')
        result['watchdogUnavailable']=True; result['unavailableReason']=stopped['reason']; result['recoveryAction']=stopped['action']
        second=helper('fresh',old)
        # Longer than one native watchdog period: the stopped old script must not
        # reconnect merely because the service name has returned.
        time.sleep(1.8)
        counts=read_json('restart-fresh-requests.json')
        if not counts or any(counts.values()): raise Failure('EXPLICIT_SCRIPT_RELOAD_REQUIRED')
        result['noAutomaticReconnect']=True
        unloaded=native_call('unloadScript',NAME)
        if 'true' not in unloaded: raise Failure('OLD_SCRIPT_UNLOAD_REQUIRED')
        load_script()
        fresh=wait_for(lambda:(value if (value:=read_json('restart-fresh-metrics.json')) and value.get('stage')==2 else None),'FRESH_NATIVE_COMMAND_ACK_REQUIRED')
        new=fresh['handle']
        if new['instance']==old['instance'] or new['generation']<=old['generation']: raise Failure('FRESH_INSTANCE_AND_GENERATION_REQUIRED')
        if not fresh.get('staleGenerationRejected') or fresh.get('outcomes')!=['denied','ok']: raise Failure('STALE_CONTEXT_REJECTION_REQUIRED')
        observed=events()
        denied=[value for value in observed if value.get('phase')=='fresh' and value.get('event')=='stale-handle-denied']
        geometries=[value for value in observed if value.get('event')=='native-geometry']
        before=[value for value in geometries if value.get('phase')=='crash']
        after=[value for value in geometries if value.get('phase')=='fresh']
        if len(denied)!=1 or len(before)!=1 or len(after)!=1 or before[0].get('geometry')!=after[0].get('geometry'): raise Failure('NO_REPLAY_NATIVE_GEOMETRY_REQUIRED')
        if any(value.get('placements',0)!=0 for value in observed): raise Failure('OLD_PLACEMENT_MUST_NEVER_EXECUTE')
        result.update(state='passed',freshInstance=True,freshGeneration=True,staleGenerationRejected=True,staleInstanceRejectedBeforeNativeAccess=True,
                      oldPlacementNeverExecuted=True,explicitScriptReloadRecovered=True,nativeGeometryStable=True,
                      oldHandle=old,newHandle=new,nativeAcknowledgements=fresh['outcomes'])
        native_call('unloadScript',NAME); stop_group(second)
    except (Failure,OSError,ValueError,subprocess.TimeoutExpired) as error:
        result['state']='unavailable'; result['reason']=str(error) if isinstance(error,Failure) else 'PRIVATE_NATIVE_RESTART_FAILED'
    finally:
        for child in reversed(children): stop_group(child)
        try: native_call('unloadScript',NAME)
        except (Failure,OSError,subprocess.TimeoutExpired): pass
    (ROOT/'restart-result.json').write_text(json.dumps(result))
    print(json.dumps(result))
    return 0 if result['state']=='passed' else 3

if __name__=='__main__': sys.exit(main())
