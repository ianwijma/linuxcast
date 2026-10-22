#!/usr/bin/python3
"""Prepared only: explicitly reserved disposable Debian13 compositor, no host display.
Requires source review and coordinator VM release before any graphical execution.
"""
import argparse
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import stat
import tempfile
import time
from private import private_root, private_environment, target_guard
from supervision import Supervisor, Cancelled
from artifacts import public_manifest, fallback_result, publish
from observer_startup import ShellDrain, query_once, diagnostic as startup_diagnostic, runtime_sample

HERE=pathlib.Path(__file__).resolve().parent
BACKENDS=('gnome-wayland','gnome-x11','kwin-wayland','kwin-x11')
BUS='io.github.ianwijma.Linuxcast.Spike.LauncherMatrix1'
def verify_build(directory,source=HERE):
    file=directory/'manifest.json'
    if file.stat().st_size>16384: raise ValueError('BUILD_MANIFEST_BOUND')
    manifest=public_manifest(json.loads(file.read_text()))
    for names,base in ((manifest['sourceSha256'],source),(manifest['outputSha256'],directory)):
        for name,expected in names.items():
            if hashlib.sha256((base/name).read_bytes()).hexdigest()!=expected: raise ValueError('BUILD_MANIFEST_MISMATCH')
    if hashlib.sha256((source.parents[3]/'docs/design/tokens.json').read_bytes()).hexdigest()!=manifest.get('designTokensSha256'):
        raise ValueError('BUILD_TOKENS_MISMATCH')
    if hashlib.sha256((source.parents[1]/'resources/io.github.ianwijma.Linuxcast.desktop').read_bytes()).hexdigest()!=manifest.get('launcherDesktopFileSha256'):
        raise ValueError('BUILD_DESKTOP_ENTRY_MISMATCH')
    return manifest

def unavailable(reason):
    print(json.dumps({'status':'unavailable','reason':reason,'physicalDesktopMatrixEstablished':False}))
    return 3

def bounded(args,env,timeout=5):
    return subprocess.run(args,env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=timeout)

def has_owner(name,env):
    value=bounded(['gdbus','call','--session','--dest','org.freedesktop.DBus','--object-path','/org/freedesktop/DBus','--method','org.freedesktop.DBus.NameHasOwner',name],env)
    return value.returncode==0 and value.stdout.strip()=='(true,)'

def inner(backend,root):
    root=private_root(str(root),backend)
    env=private_environment(root,os.environ.get('LINUXCAST_S001_NODE'))
    env['DBUS_SESSION_BUS_ADDRESS']=os.environ['DBUS_SESSION_BUS_ADDRESS']
    if backend.endswith('x11'):
        env['DISPLAY']=os.environ['DISPLAY']; env['XAUTHORITY']=os.environ['XAUTHORITY']
    env['LINUXCAST_S001_BACKEND']=backend
    wayland=backend.endswith('wayland')
    env.update(XDG_SESSION_TYPE='wayland' if wayland else 'x11',GDK_BACKEND='wayland' if wayland else 'x11',
               LIBGL_ALWAYS_SOFTWARE='1',QT_QUICK_BACKEND='software')
    if wayland:
        if 'DISPLAY' in env: return unavailable('WAYLAND_DISPLAY_ISOLATION_REQUIRED')
        env['WAYLAND_DISPLAY']='linuxcast-s001-wayland'
    family='gnome' if backend.startswith('gnome') else 'kwin'
    executable=shutil.which('gnome-shell' if family=='gnome' else 'kwin_wayland' if wayland else 'kwin_x11')
    if not executable: return unavailable('TARGET_COMPOSITOR_PACKAGE_REQUIRED')
    if family=='gnome':
        args=['--wayland','--headless','--no-x11','--virtual-monitor','1280x900','--wayland-display',env['WAYLAND_DISPLAY']] if wayland else ['--x11','--sm-disable']
        # Keyfile backend and fresh config are private to this test process tree.
        settings=bounded(['gsettings','set','org.gnome.shell','enabled-extensions',"['s001-launcher-observer@linuxcast.invalid']"],env)
        if settings.returncode: return unavailable('PRIVATE_EXTENSION_CONFIGURATION_FAILED')
    else:
        args=['--virtual','--socket',env['WAYLAND_DISPLAY'],'--width','1280','--height','900','--no-lockscreen','--no-kactivities'] if wayland else ['--replace']
    with open(os.devnull,'w') as log:
        compositor=subprocess.Popen([executable,*args],env=env,stdout=subprocess.PIPE if family=='gnome' else log,
            stderr=subprocess.STDOUT if family=='gnome' else log,start_new_session=True,bufsize=0)
        monitor=ShellDrain(compositor.stdout) if family=='gnome' else None
        before_checker=None
        lifecycle={}
        try:
            owner='org.gnome.Shell' if family=='gnome' else 'org.kde.KWin'
            deadline=time.monotonic()+45
            while time.monotonic()<deadline:
                if compositor.poll() is not None: return unavailable('TARGET_COMPOSITOR_START_FAILED')
                if has_owner(owner,env) and (not wayland or (root/'runtime'/env['WAYLAND_DISPLAY']).exists()): break
                time.sleep(0.2)
            else: return unavailable('TARGET_COMPOSITOR_START_DEADLINE')
            if monitor:
                monitor.set_info(query_once(env,deadline))
                if time.monotonic()>=deadline: return unavailable('TARGET_COMPOSITOR_START_DEADLINE')
            if family=='kwin':
                subprocess.Popen(['/usr/bin/python3',str(HERE/'kwin-bus.py')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
                deadline=time.monotonic()+5
                while time.monotonic()<deadline and not has_owner(BUS,env): time.sleep(0.1)
                if not has_owner(BUS,env): return unavailable('PRIVATE_OBSERVER_BUS_REQUIRED')
                loaded=bounded(['gdbus','call','--session','--dest',owner,'--object-path','/Scripting','--method','org.kde.kwin.Scripting.loadScript',str(HERE/'dist/kwin-script.js'),'linuxcast-s001-observer'],env)
                match=re.fullmatch(r'\((?:int32 )?([0-9]+),?\)\s*',loaded.stdout)
                if loaded.returncode or not match: return unavailable('NATIVE_OBSERVER_LOAD_FAILED')
                started=bounded(['gdbus','call','--session','--dest',owner,'--object-path','/Scripting/Script'+match.group(1),'--method','org.kde.kwin.Script.run'],env)
                if started.returncode: return unavailable('NATIVE_OBSERVER_START_FAILED')
            node=env.get('LINUXCAST_S001_NODE')
            if not node: return unavailable('PINNED_NODE_REQUIRED')
            if monitor:
                lifecycle['beforeChecker']=runtime_sample(compositor,monitor)
                before_checker=monitor.snapshot()
                (root/'observer-startup.json').write_text(json.dumps(startup_diagnostic({'beforeChecker':before_checker,'latest':before_checker})))
            driver=subprocess.Popen([node,str(HERE/'check.ts'),backend],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
            try: return driver.wait(timeout=180)
            except subprocess.TimeoutExpired: return unavailable('LAUNCHER_MATRIX_DRIVER_DEADLINE')
            finally:
                if monitor: lifecycle['afterChecker']=runtime_sample(compositor,monitor)
        finally:
            if monitor:
                monitor.close()
                lifecycle['finally']=runtime_sample(compositor,monitor)
                value={'latest':monitor.snapshot()}
                if before_checker is not None: value['beforeChecker']=before_checker
                value['lifecycle']=lifecycle
                (root/'observer-startup.json').write_text(json.dumps(startup_diagnostic(value)))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backend',choices=BACKENDS)
    parser.add_argument('--private-guest',action='store_true')
    parser.add_argument('--inner',type=pathlib.Path)
    arguments=parser.parse_args()
    if not arguments.private_guest:
        return unavailable('EXPLICIT_DISPOSABLE_DEBIAN13_USER_REQUIRED')
    try: target_guard()
    except (ValueError,OSError): return unavailable('EXPLICIT_DISPOSABLE_DEBIAN13_USER_REQUIRED')
    if arguments.inner:
        try:
            root=private_root(str(arguments.inner),arguments.backend)
            verify_build(HERE/'dist')
            return inner(arguments.backend,root)
        except (ValueError,OSError,subprocess.TimeoutExpired): return unavailable('PRIVATE_COMPOSITOR_HARNESS_FAILED')
    try: verify_build(HERE/'dist')
    except (ValueError,OSError): return unavailable('BUILD_REVIEWED_HARNESS_FIRST')
    node=shutil.which('node')
    if not node: return unavailable('PINNED_NODE_REQUIRED')
    root=pathlib.Path(tempfile.mkdtemp(prefix='linuxcast-s001-matrix-'))
    # Do not inherit user service sockets, display/session credentials or portals.
    env=private_environment(root,node)
    for key,name in [('HOME','home'),('XDG_CONFIG_HOME','config'),('XDG_DATA_HOME','data'),('XDG_CACHE_HOME','cache'),('XDG_RUNTIME_DIR','runtime')]:
        target=root/name; target.mkdir(mode=0o700); env[key]=str(target)
    extension=root/'data/gnome-shell/extensions/s001-launcher-observer@linuxcast.invalid'
    extension.mkdir(parents=True,mode=0o700)
    for name in ('extension.js','metadata.json'): shutil.copyfile(HERE/'dist'/name,extension/name)
    applications=root/'data/applications'; applications.mkdir(mode=0o700)
    # Private identity metadata only: never installed on the host or launched as
    # an arbitrary Exec string. The driver starts the fixed reviewed binary.
    (applications/'io.github.ianwijma.Linuxcast.desktop').write_text('[Desktop Entry]\nType=Application\nName=Linuxcast\nExec=/usr/bin/false\nStartupWMClass=io.github.ianwijma.Linuxcast\nNoDisplay=true\n')
    services=root/'services'; services.mkdir()
    (root/'bus.conf').write_text('<busconfig><type>session</type><listen>unix:path='+str(root/'dbus-session')+'</listen><auth>EXTERNAL</auth><servicedir>'+str(services)+'</servicedir><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>')
    command=['dbus-run-session','--config-file',str(root/'bus.conf'),'--','/usr/bin/python3',str(HERE/'run-session.py'),arguments.backend,'--private-guest','--inner',str(root)]
    if arguments.backend.endswith('x11'):
        auth=root/'xauthority';auth.touch(mode=0o600)
        command=['xvfb-run','--auth-file',str(auth),'-a','-s','-screen 0 1280x900x24 -nolisten tcp',*command]
    status=3; cleanup=False
    try:
        with Supervisor():
            child=subprocess.Popen(command,env=env,cwd=root,start_new_session=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            try: status=child.wait(timeout=240)
            except subprocess.TimeoutExpired: status=3
        cleanup=True
        result_path=root/'result.json'
        if result_path.exists() and result_path.stat().st_size<=131072:
            metadata=result_path.lstat()
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid!=os.getuid(): raise ValueError('PRIVATE_RESULT_FILE_REQUIRED')
            result=json.loads(result_path.read_text())
        else: result=fallback_result(arguments.backend)
        startup=root/'observer-startup.json'
        if arguments.backend.startswith('gnome') and result.get('status')!='passed-bounded-native-probe' and startup.exists():
            metadata=startup.lstat()
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid!=os.getuid() or metadata.st_size>16384: raise ValueError('OBSERVER_STARTUP_FILE_REQUIRED')
            result['observerStartup']=startup_diagnostic(json.loads(startup.read_text()))
        packages=bounded(['dpkg-query','-W','-f=${Package} ${Version}\n','gnome-shell','mutter','kwin-wayland','kwin-x11','libqt6qml6'],env)
        destination=HERE.parents[1]/'evidence/native-session'/arguments.backend
        manifest=verify_build(HERE/'dist')
        status,state=publish(root,destination,result,manifest,arguments.backend,status,packages.stdout)
        print(json.dumps({'backend':arguments.backend,'status':state,'exitCode':status,'privateProcessTreeCleanupVerified':cleanup,'physicalDesktopMatrixEstablished':False}))
        return status
    except Cancelled: return unavailable('PRIVATE_MATRIX_CANCELLED')
    except (ValueError,OSError,subprocess.TimeoutExpired): return unavailable('PRIVATE_MATRIX_CLEANUP_OR_REPORT_FAILED')
    finally: shutil.rmtree(root)

if __name__=='__main__': sys.exit(main())
