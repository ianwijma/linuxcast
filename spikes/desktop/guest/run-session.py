#!/usr/bin/python3
"""Run only after coordinator VM release. Never installs packages or uses host displays.
A fresh HOME, XDG runtime and D-Bus surround each bounded synthetic compositor.
"""
import argparse
import json
import os
import pathlib
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from supervision import Supervisor, Cancelled
import private_context as _context
from debugger_filter import parse_report as parse_debugger_report
from post_stop import QUIET_SECONDS, observe_post_stop

HERE=pathlib.Path(__file__).resolve().parent
BACKENDS=('gnome-wayland','gnome-wayland-nested','gnome-x11','kwin-wayland','kwin-x11')

def bounded(command,env,timeout=5):
    return subprocess.run(command,env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=timeout)

def report_unavailable(reason,progress=None,scenario=None):
    value={'state':'unavailable','reason':reason,'physicalDesktopMatrixEstablished':False}
    if progress is not None: value['nativeProgress']=progress
    if scenario is not None: value['diagnosticScenario']=scenario
    print(json.dumps(value))
    return 3

def terminate(child):
    if child:
        try: os.killpg(child.pid,signal.SIGTERM)
        except ProcessLookupError: pass
        try: child.wait(timeout=2)
        except subprocess.TimeoutExpired:
            try: os.killpg(child.pid,signal.SIGKILL)
            except ProcessLookupError: pass
            child.wait()

def read_result(path):
    if not path.exists(): return None
    if path.stat().st_size>16384: raise ValueError('RESULT_BOUND')
    value=json.loads(path.read_text())
    if not isinstance(value,dict): raise ValueError('RESULT_SCHEMA')
    return value

def canary_progress(root):
    file=root/'private-canary.log'
    if not file.exists(): return None
    with file.open('rb') as stream:
        stream.seek(max(0,file.stat().st_size-16384)); content=stream.read(16384).decode('utf8','replace')
    for line in reversed(content.splitlines()):
        try: value=json.loads(line)
        except ValueError: continue
        if not isinstance(value,dict) or set(value)!= {'ownConfigureEvents'}: continue
        entries=value['ownConfigureEvents']
        if not isinstance(entries,list) or not 1<=len(entries)<=8: continue
        keys={'width','height','clientWidth','clientHeight','maximized','fullscreen','iconified','resizable'}
        if all(isinstance(item,dict) and set(item)==keys
               and all(type(item[key]) is int and 0<item[key]<=16384 for key in ('width','height','clientWidth','clientHeight'))
               and all(type(item[key]) is bool for key in ('maximized','fullscreen','iconified','resizable')) for item in entries):
            return value
    return None

def native_progress(root):
    # Only own exact static stage labels escape the private compositor log.
    stages={'SCRIPT_ENTERED','CONTEXT_CALLBACK','OWN_WINDOW_FOUND','NATIVE_ADAPTER_READY','LOOP_START','OWN_WINDOW_DEADLINE','SCRIPT_EXCEPTION'}
    file=root/'private-compositor.log'
    content=''
    if file.exists():
        with file.open('rb') as stream:
            stream.seek(max(0,file.stat().st_size-131072)); content=stream.read(131072).decode('utf8','replace')
    observed=[]
    for line in content.splitlines():
        if 'LINUXCAST_S002_STAGE:' not in line: continue
        label=line.split('LINUXCAST_S002_STAGE:',1)[1].strip()
        if label in stages and label not in observed: observed.append(label)
    error_lines=[]
    for match in re.finditer(r'kwin-script\.js:([0-9]{1,7}): error:',content):
        number=int(match.group(1))
        if 0<number<=1000000 and number not in error_lines: error_lines.append(number)
        if len(error_lines)>=8: break
    debugger=None
    for line in content.splitlines():
        if 'LINUXCAST_S002_DEBUGGER:' not in line: continue
        try: candidate=json.loads(line.split('LINUXCAST_S002_DEBUGGER:',1)[1])
        except ValueError: continue
        debugger=parse_debugger_report(candidate)
        if debugger is not None: break
    return {'stages':observed,'scriptEvaluationErrorLogged':bool(error_lines),'publicBundleErrorLines':error_lines,
            'wire':read_result(root/'kwin-progress.json'),'ownClient':canary_progress(root),'debugger':debugger}

def inner(backend,root,restart=False,debugger=False,read_only_control=False):
    def unavailable(reason,progress=None):
        return report_unavailable(reason,progress,'read-only-control' if read_only_control else None)
    env=_context.private_environment(root,os.environ.get('LINUXCAST_S002_NODE'))
    env['DBUS_SESSION_BUS_ADDRESS']=os.environ['DBUS_SESSION_BUS_ADDRESS']
    for key in ('DISPLAY','XAUTHORITY'):
        if os.environ.get(key): env[key]=os.environ[key]
    wayland='wayland' in backend
    env['XDG_SESSION_TYPE']='wayland' if wayland else 'x11'
    env['GDK_BACKEND']='wayland' if wayland else 'x11'
    env['LIBGL_ALWAYS_SOFTWARE']='1'
    env['QT_QUICK_BACKEND']='software'
    env['LINUXCAST_S002_PRIVATE_GUEST']='1'
    env['LINUXCAST_S002_RESULT_DIR']=str(root)
    if read_only_control: env['LINUXCAST_S002_READ_ONLY_CONTROL']='1'
    socket='linuxcast-s002-wayland'
    if wayland: env['WAYLAND_DISPLAY']=socket
    if backend.startswith('gnome'):
        executable=shutil.which('gnome-shell')
        args=['--wayland','--headless','--no-x11','--virtual-monitor','1280x720','--wayland-display',socket] if wayland else ['--x11','--sm-disable']
        if backend=='gnome-wayland-nested': args=['--wayland','--nested','--no-x11','--wayland-display',socket]
    else:
        executable=shutil.which('kwin_wayland' if wayland else 'kwin_x11')
        args=['--virtual','--socket',socket,'--width','1280','--height','720','--no-lockscreen','--no-global-shortcuts','--no-kactivities'] if wayland else ['--replace']
    if not executable: return unavailable('GUEST_COMPOSITOR_PACKAGE_REQUIRED')
    children=[]
    def interrupted(_signal,_frame):
        raise InterruptedError()
    signal.signal(signal.SIGTERM,interrupted)
    signal.signal(signal.SIGINT,interrupted)
    rawlog=(root/'private-compositor.log').open('w')
    canarylog=(root/'private-canary.log').open('w')
    try:
        if backend.startswith('gnome'):
            setting=bounded(['gsettings','set','org.gnome.shell','enabled-extensions',"['s002-native@linuxcast.invalid']"],env)
            if setting.returncode: return unavailable('PRIVATE_EXTENSION_CONFIGURATION_FAILED')
        command=[executable,*args]
        def no_core():
            import resource
            resource.setrlimit(resource.RLIMIT_CORE,(0,0))
        if debugger:
            if not pathlib.Path('/usr/bin/gdb').is_file(): return unavailable('GUEST_DEBUGGER_PACKAGE_REQUIRED')
            env['DEBUGINFOD_URLS']=''
            command=['/usr/bin/gdb','--quiet','--nx','--nh','--batch',
                     '-iex','set auto-load off','-iex','set debuginfod enabled off',
                     '-iex','set startup-with-shell off','-iex','set disable-randomization off',
                     '-x',str(HERE/'debugger_filter.py'),'--args',*command]
        compositor=subprocess.Popen(command,env=env,stdout=rawlog,stderr=rawlog,start_new_session=True,preexec_fn=no_core if debugger else None)
        children.append(compositor)
        deadline=time.monotonic()+15
        bus_name='org.gnome.Shell' if backend.startswith('gnome') else 'org.kde.KWin'
        while time.monotonic()<deadline:
            if compositor.poll() is not None: return unavailable('NATIVE_COMPOSITOR_START_FAILED',native_progress(root) if debugger else None)
            owner=bounded(['gdbus','call','--session','--dest','org.freedesktop.DBus','--object-path','/org/freedesktop/DBus','--method','org.freedesktop.DBus.NameHasOwner',bus_name],env)
            if 'true' in owner.stdout and (not wayland or (pathlib.Path(env['XDG_RUNTIME_DIR'])/socket).exists()): break
            time.sleep(0.1)
        else: return unavailable('NATIVE_COMPOSITOR_START_DEADLINE')
        canary=subprocess.Popen(['/usr/bin/python3',str(HERE/'canary.py')],env=env,stdout=canarylog,stderr=subprocess.DEVNULL,start_new_session=True)
        children.append(canary)
        if backend.startswith('kwin'):
            env['LINUXCAST_S002_CANARY_PID']=str(canary.pid)
            if restart:
                driver=subprocess.Popen(['/usr/bin/python3',str(HERE/'restart-driver.py')],env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,start_new_session=True)
                children.append(driver)
                try: driver.communicate(timeout=20)
                except subprocess.TimeoutExpired: return unavailable('NATIVE_RESTART_SCENARIO_DEADLINE')
                result=read_result(root/'restart-result.json')
                if not result: return unavailable('NATIVE_RESTART_RESULT_REQUIRED')
                print(json.dumps(result))
                return 0 if driver.returncode==0 and result.get('state')=='passed' else 3
            helper=subprocess.Popen(['/usr/bin/python3',str(HERE/'kwin-bus.py')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
            children.append(helper)
            helper_deadline=time.monotonic()+5
            while time.monotonic()<helper_deadline:
                if helper.poll() is not None: return unavailable('PRIVATE_COMPANION_START_FAILED')
                present=bounded(['gdbus','call','--session','--dest','org.freedesktop.DBus','--object-path','/org/freedesktop/DBus','--method','org.freedesktop.DBus.NameHasOwner','io.github.ianwijma.Linuxcast.Spike.Desktop1'],env)
                if present.returncode==0 and 'true' in present.stdout: break
                time.sleep(0.05)
            else: return unavailable('PRIVATE_COMPANION_START_DEADLINE')
            loaded=bounded(['gdbus','call','--session','--dest','org.kde.KWin','--object-path','/Scripting','--method','org.kde.kwin.Scripting.loadScript',str(HERE/'kwin-script.js'),'linuxcast-s002-canary'],env)
            import re
            match=re.search(r'\((?:int32 )?([0-9]+),?\)',loaded.stdout)
            if loaded.returncode or not match: return unavailable('KWIN_SCRIPT_LOAD_FAILED')
            started=bounded(['gdbus','call','--session','--dest','org.kde.KWin','--object-path','/Scripting/Script'+match.group(1),'--method','org.kde.kwin.Script.run'],env)
            if started.returncode: return unavailable('KWIN_SCRIPT_START_FAILED')
        result_path=root/('gnome-result.json' if backend.startswith('gnome') else 'kwin-result.json')
        deadline=time.monotonic()+25
        result=None
        while time.monotonic()<deadline:
            if canary.poll() is not None:
                progress=native_progress(root) if backend.startswith('kwin') else {}
                progress['canaryExitCode']=canary.returncode
                progress['debuggerWrapperExitCode' if debugger else 'compositorExitCode']=compositor.poll()
                return unavailable('OWN_NATIVE_CANARY_FAILED',progress)
            result=read_result(result_path)
            if result: break
            time.sleep(0.1)
        if not result: return unavailable('NATIVE_ADAPTER_PROBE_DEADLINE',native_progress(root) if backend.startswith('kwin') else None)
        quiet=None
        if backend=='kwin-wayland':
            if result.get('pollingStopped') is True:
                quiet=observe_post_stop([compositor,canary,helper],lambda:read_result(root/'kwin-progress.json'))
            else:
                quiet={'seconds':QUIET_SECONDS,'completed':False,'allOwnProcessesAlive':False,
                       'controlTrafficStable':False,'reason':'POST_STOP_REPORT_REQUIRED'}
        clipboard=None
        if backend=='kwin-wayland' and not read_only_control and quiet is not None and quiet['completed']:
            native=bounded([env.get('LINUXCAST_S002_NODE','/usr/bin/node'),str(HERE/'clipboard-client.mjs')],env,timeout=10)
            clipboard=read_result(root/'clipboard-result.json')
            if not clipboard: clipboard={'state':'unavailable','reason':'NATIVE_CLIPBOARD_CLIENT_REQUIRED'}
        if not wayland:
            private_selection=bounded(['/usr/bin/python3',str(HERE/'x11-private-selection.py')],env,timeout=5)
            try: clipboard=json.loads(private_selection.stdout)
            except ValueError: clipboard={'state':'unavailable','reason':'PRIVATE_X11_SELECTION_CANARY_REQUIRED'}
        packages=bounded(['dpkg-query','-W','gnome-shell','mutter','kwin-wayland','kwin-x11','gjs','wl-clipboard','libgl1-mesa-dri'],env)
        report={'backend':backend,'state':result.get('state'),'adapter':result,'clipboard':clipboard,
                'evidenceKind':'actual-isolated-software-compositor-native-API','packages':packages.stdout.splitlines(),
                'sourceManifest':json.loads((HERE/'manifest.json').read_text()),
                'kernel':os.uname().release,'scale':1,'rendering':'software-requested; no GPU passthrough; actual renderer must be recorded separately',
                'physicalDesktopMatrixEstablished':False,'hostDisplayClipboardOrSettingsUsed':False,'postStopQuiet':quiet}
        if quiet is not None and not quiet['completed']:
            report['state']='unavailable'
            report['reason']='POST_STOP_QUIET_FAILED'
            progress=native_progress(root)
            progress['canaryExitCode']=canary.poll()
            progress['privateHelperExitCode']=helper.poll()
            progress['debuggerWrapperExitCode' if debugger else 'compositorExitCode']=compositor.poll()
            report['nativeProgress']=progress
        if clipboard and clipboard.get('state')!='passed': report['state']='unavailable'
        if read_only_control:
            complete=(result.get('state')=='diagnostic' and result.get('diagnosticStatus')=='READ_ONLY_CONTROL_COMPLETE'
                      and result.get('nativePlacementAttempted') is False and quiet is not None and quiet['completed'])
            report.update(state='diagnostic',diagnosticStatus='READ_ONLY_CONTROL_COMPLETE' if complete else 'READ_ONLY_CONTROL_FAILED',
                          diagnosticScenario='read-only-control',evidenceKind='actual-isolated-read-only-diagnostic-control',
                          nativePlacementAttempted=result.get('nativePlacementAttempted'),actualRestartTested=False,
                          placementAcceptanceEstablished=False,clipboardAcceptanceEstablished=False,
                          clipboard={'state':'not-exercised','reason':'READ_ONLY_DIAGNOSTIC_CONTROL'})
        (root/'report.json').write_text(json.dumps(report))
        print(json.dumps(report))
        if read_only_control: return 4 if report['diagnosticStatus']=='READ_ONLY_CONTROL_COMPLETE' else 3
        return 0 if report['state']=='passed' else 3
    except (OSError,ValueError,subprocess.TimeoutExpired):
        return unavailable('PRIVATE_GUEST_NATIVE_HARNESS_FAILED')
    finally:
        for child in reversed(children): terminate(child)
        rawlog.close()
        canarylog.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backend',choices=BACKENDS)
    parser.add_argument('--private-guest',action='store_true')
    parser.add_argument('--inner',type=pathlib.Path)
    parser.add_argument('--restart-scenario',action='store_true')
    parser.add_argument('--debugger-scenario',action='store_true')
    parser.add_argument('--read-only-control',action='store_true')
    arguments=parser.parse_args()
    if not arguments.private_guest or not _context.guest_allowed(pathlib.Path('/etc/os-release').read_text(),os.getuid(),pathlib.Path('/run/linuxcast-input-spike-lab').exists()):
        return report_unavailable('EXPLICIT_DISPOSABLE_DEBIAN13_GUEST_REQUIRED')
    if arguments.read_only_control and (arguments.backend!='kwin-wayland' or arguments.restart_scenario):
        return report_unavailable('READ_ONLY_CONTROL_REQUIRES_KWIN_WAYLAND_WITHOUT_RESTART')
    if arguments.debugger_scenario and (arguments.backend!='kwin-wayland' or arguments.restart_scenario):
        return report_unavailable('DEBUGGER_ONLY_KWIN_WAYLAND_SUCCESS_SCENARIO')
    if arguments.restart_scenario and not arguments.backend.startswith('kwin'):
        return report_unavailable('KWIN_RESTART_BACKEND_REQUIRED')
    if arguments.inner:
        try: root=_context.private_context(str(arguments.inner),arguments.backend)
        except (OSError,ValueError,RuntimeError): return report_unavailable('PRIVATE_GUEST_CONTEXT_REQUIRED')
        return inner(arguments.backend,root,arguments.restart_scenario,arguments.debugger_scenario,arguments.read_only_control)
    root=pathlib.Path(tempfile.mkdtemp(prefix='linuxcast-s002-',dir='/tmp'))
    env=_context.private_environment(root,os.environ.get('LINUXCAST_S002_NODE'))
    for name in _context.DIRECTORIES.values(): (root/name).mkdir(mode=0o700)
    services=root/'services'; services.mkdir(mode=0o700)
    config=root/'bus.conf'
    config.write_text('<busconfig><type>session</type><listen>unix:path='+str(root/'dbus-session')+'</listen><auth>EXTERNAL</auth><servicedir>'+str(services)+'</servicedir><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>')
    config.chmod(0o600)
    extension=pathlib.Path(env['XDG_DATA_HOME'])/'gnome-shell/extensions/s002-native@linuxcast.invalid'
    extension.mkdir(parents=True,mode=0o700)
    for filename in ('metadata.json','extension.js','desktop-api.js'):
        if (HERE/filename).exists(): shutil.copyfile(HERE/filename,extension/filename)
    command=['dbus-run-session','--config-file',str(config),'--','/usr/bin/python3',str(pathlib.Path(__file__).resolve()),arguments.backend,'--private-guest','--inner',str(root)]
    if arguments.restart_scenario: command.append('--restart-scenario')
    if arguments.debugger_scenario: command.append('--debugger-scenario')
    if arguments.read_only_control: command.append('--read-only-control')
    if arguments.backend.endswith('x11') or arguments.backend=='gnome-wayland-nested':
        command=['xvfb-run','-a','-f',str(root/'xauthority'),'-s','-screen 0 1280x720x24 -nolisten tcp',*command]
    try:
        # This outer owner adopts and tears down all detached descendants too.
        # Cleanup signals the tree concurrently; it never hard-kills an inner
        # supervisor merely because its serial per-child cleanup needs >2s.
        with Supervisor():
            child=subprocess.Popen(command,env=env,start_new_session=True)
            try: return child.wait(timeout=60)
            except subprocess.TimeoutExpired:
                return report_unavailable('PRIVATE_GUEST_SESSION_DEADLINE')
    except Cancelled:
        return report_unavailable('PRIVATE_GUEST_SESSION_CANCELLED')
    except OSError:
        return report_unavailable('PRIVATE_GUEST_SUPERVISION_UNAVAILABLE')
    finally:
        shutil.rmtree(root)

if __name__=='__main__': sys.exit(main())
