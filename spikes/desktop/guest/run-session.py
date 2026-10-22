#!/usr/bin/python3
"""Run only after coordinator VM release. Never installs packages or uses host displays.
A fresh HOME, XDG runtime and D-Bus surround each bounded synthetic compositor.
"""
import argparse
import json
import os
import pathlib
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from supervision import Supervisor, Cancelled

HERE=pathlib.Path(__file__).resolve().parent
BACKENDS=('gnome-wayland','gnome-wayland-nested','gnome-x11','kwin-wayland','kwin-x11')

def bounded(command,env,timeout=5):
    return subprocess.run(command,env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=timeout)

def report_unavailable(reason):
    print(json.dumps({'state':'unavailable','reason':reason,'physicalDesktopMatrixEstablished':False}))
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

def inner(backend,root,restart=False):
    env=dict(os.environ)
    wayland='wayland' in backend
    env['XDG_SESSION_TYPE']='wayland' if wayland else 'x11'
    env['GDK_BACKEND']='wayland' if wayland else 'x11'
    env['LIBGL_ALWAYS_SOFTWARE']='1'
    env['QT_QUICK_BACKEND']='software'
    env['LINUXCAST_S002_PRIVATE_GUEST']='1'
    env['LINUXCAST_S002_RESULT_DIR']=str(root)
    socket='linuxcast-s002-wayland'
    if wayland: env['WAYLAND_DISPLAY']=socket
    if backend.startswith('gnome'):
        executable=shutil.which('gnome-shell')
        args=['--wayland','--headless','--no-x11','--virtual-monitor','1280x720','--wayland-display',socket] if wayland else ['--x11','--sm-disable']
        if backend=='gnome-wayland-nested': args=['--wayland','--nested','--no-x11','--wayland-display',socket]
    else:
        executable=shutil.which('kwin_wayland' if wayland else 'kwin_x11')
        args=['--virtual','--socket',socket,'--width','1280','--height','720','--no-lockscreen','--no-global-shortcuts','--no-kactivities'] if wayland else ['--replace']
    if not executable: return report_unavailable('GUEST_COMPOSITOR_PACKAGE_REQUIRED')
    children=[]
    def interrupted(_signal,_frame):
        raise InterruptedError()
    signal.signal(signal.SIGTERM,interrupted)
    signal.signal(signal.SIGINT,interrupted)
    rawlog=(root/'private-compositor.log').open('w')
    try:
        if backend.startswith('gnome'):
            setting=bounded(['gsettings','set','org.gnome.shell','enabled-extensions',"['s002-native@linuxcast.invalid']"],env)
            if setting.returncode: return report_unavailable('PRIVATE_EXTENSION_CONFIGURATION_FAILED')
        compositor=subprocess.Popen([executable,*args],env=env,stdout=rawlog,stderr=rawlog,start_new_session=True)
        children.append(compositor)
        deadline=time.monotonic()+15
        bus_name='org.gnome.Shell' if backend.startswith('gnome') else 'org.kde.KWin'
        while time.monotonic()<deadline:
            if compositor.poll() is not None: return report_unavailable('NATIVE_COMPOSITOR_START_FAILED')
            owner=bounded(['gdbus','call','--session','--dest','org.freedesktop.DBus','--object-path','/org/freedesktop/DBus','--method','org.freedesktop.DBus.NameHasOwner',bus_name],env)
            if 'true' in owner.stdout and (not wayland or (pathlib.Path(env['XDG_RUNTIME_DIR'])/socket).exists()): break
            time.sleep(0.1)
        else: return report_unavailable('NATIVE_COMPOSITOR_START_DEADLINE')
        canary=subprocess.Popen(['/usr/bin/python3',str(HERE/'canary.py')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
        children.append(canary)
        if backend.startswith('kwin'):
            env['LINUXCAST_S002_CANARY_PID']=str(canary.pid)
            if restart:
                driver=subprocess.Popen(['/usr/bin/python3',str(HERE/'restart-driver.py')],env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,start_new_session=True)
                children.append(driver)
                try: driver.communicate(timeout=20)
                except subprocess.TimeoutExpired: return report_unavailable('NATIVE_RESTART_SCENARIO_DEADLINE')
                result=read_result(root/'restart-result.json')
                if not result: return report_unavailable('NATIVE_RESTART_RESULT_REQUIRED')
                print(json.dumps(result))
                return 0 if driver.returncode==0 and result.get('state')=='passed' else 3
            helper=subprocess.Popen(['/usr/bin/python3',str(HERE/'kwin-bus.py')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
            children.append(helper)
            time.sleep(0.5)
            loaded=bounded(['gdbus','call','--session','--dest','org.kde.KWin','--object-path','/Scripting','--method','org.kde.kwin.Scripting.loadScript',str(HERE/'kwin-script.js'),'linuxcast-s002-canary'],env)
            import re
            match=re.search(r'\((?:int32 )?([0-9]+),?\)',loaded.stdout)
            if loaded.returncode or not match: return report_unavailable('KWIN_SCRIPT_LOAD_FAILED')
            started=bounded(['gdbus','call','--session','--dest','org.kde.KWin','--object-path','/Scripting/Script'+match.group(1),'--method','org.kde.kwin.Script.run'],env)
            if started.returncode: return report_unavailable('KWIN_SCRIPT_START_FAILED')
        result_path=root/('gnome-result.json' if backend.startswith('gnome') else 'kwin-result.json')
        deadline=time.monotonic()+25
        result=None
        while time.monotonic()<deadline:
            if canary.poll() is not None: return report_unavailable('OWN_NATIVE_CANARY_FAILED')
            result=read_result(result_path)
            if result: break
            time.sleep(0.1)
        if not result: return report_unavailable('NATIVE_ADAPTER_PROBE_DEADLINE')
        clipboard=None
        if backend=='kwin-wayland':
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
                'physicalDesktopMatrixEstablished':False,'hostDisplayClipboardOrSettingsUsed':False}
        if clipboard and clipboard.get('state')!='passed': report['state']='unavailable'
        (root/'report.json').write_text(json.dumps(report))
        print(json.dumps(report))
        return 0 if report['state']=='passed' else 3
    except (OSError,ValueError,subprocess.TimeoutExpired):
        return report_unavailable('PRIVATE_GUEST_NATIVE_HARNESS_FAILED')
    finally:
        for child in reversed(children): terminate(child)
        rawlog.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backend',choices=BACKENDS)
    parser.add_argument('--private-guest',action='store_true')
    parser.add_argument('--inner',type=pathlib.Path)
    parser.add_argument('--restart-scenario',action='store_true')
    arguments=parser.parse_args()
    if not arguments.private_guest or 'VERSION_ID="13"' not in pathlib.Path('/etc/os-release').read_text():
        return report_unavailable('EXPLICIT_DISPOSABLE_DEBIAN13_GUEST_REQUIRED')
    if arguments.restart_scenario and not arguments.backend.startswith('kwin'):
        return report_unavailable('KWIN_RESTART_BACKEND_REQUIRED')
    if arguments.inner:
        root=arguments.inner.resolve()
        if root.parent!=pathlib.Path(tempfile.gettempdir()).resolve() or not root.name.startswith('linuxcast-s002-') or root!=arguments.inner:
            return report_unavailable('PRIVATE_GUEST_CONTEXT_REQUIRED')
        stat=root.stat()
        if stat.st_uid!=os.getuid() or stat.st_mode & 0o077 or os.environ.get('LINUXCAST_S002_PRIVATE_GUEST')!='1' or os.environ.get('HOME')!=str(root/'home') or os.environ.get('XDG_RUNTIME_DIR')!=str(root/'runtime'):
            return report_unavailable('PRIVATE_GUEST_CONTEXT_REQUIRED')
        return inner(arguments.backend,root,arguments.restart_scenario)
    root=pathlib.Path(tempfile.mkdtemp(prefix='linuxcast-s002-'))
    env=dict(os.environ)
    env['LINUXCAST_S002_PRIVATE_GUEST']='1'
    env['LINUXCAST_S002_RESULT_DIR']=str(root)
    for name in ('DISPLAY','WAYLAND_DISPLAY','DBUS_SESSION_BUS_ADDRESS','DBUS_STARTER_ADDRESS','DBUS_STARTER_BUS_TYPE','XAUTHORITY'):
        env.pop(name,None)
    for key,child in [('HOME','home'),('XDG_CONFIG_HOME','config'),('XDG_DATA_HOME','data'),('XDG_CACHE_HOME','cache'),('XDG_RUNTIME_DIR','runtime')]:
        target=root/child; target.mkdir(mode=0o700); env[key]=str(target)
    extension=pathlib.Path(env['XDG_DATA_HOME'])/'gnome-shell/extensions/s002-native@linuxcast.invalid'
    extension.mkdir(parents=True,mode=0o700)
    for filename in ('metadata.json','extension.js','desktop-api.js'):
        if (HERE/filename).exists(): shutil.copyfile(HERE/filename,extension/filename)
    command=['dbus-run-session','--','/usr/bin/python3',str(pathlib.Path(__file__).resolve()),arguments.backend,'--private-guest','--inner',str(root)]
    if arguments.restart_scenario: command.append('--restart-scenario')
    if arguments.backend.endswith('x11') or arguments.backend=='gnome-wayland-nested':
        command=['xvfb-run','-a','-s','-screen 0 1280x720x24 -nolisten tcp',*command]
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
