"""Harmless entry-order/guard checks; no graphical or settings calls."""
import importlib.util
import json
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
from unittest.mock import patch
import private

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('matrix_runner',HERE/'run-session.py')
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
case=sys.argv[1]
with tempfile.TemporaryDirectory(prefix='linuxcast-s001-matrix-guard-') as temporary:
    root=pathlib.Path(temporary).resolve()
    for name in private.DIRECTORIES.values(): (root/name).mkdir(mode=0o700)
    env=private.private_environment(root)
    if case=='real-private-bus':
        services=root/'services';services.mkdir(mode=0o700)
        config=root/'bus.conf';config.write_text('<busconfig><type>session</type><listen>unix:path='+str(root/'dbus-session')+'</listen><auth>EXTERNAL</auth><servicedir>'+str(services)+'</servicedir><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>')
        env['WAYLAND_DISPLAY']='linuxcast-s001-wayland';env['XDG_SESSION_TYPE']='wayland'
        code='import os,sys;sys.path.insert(0,'+repr(str(HERE))+');import private;from unittest.mock import patch\nassert os.environ.get("PWD")=='+repr(str(root))+'\nwith patch.object(private,"guest_allowed",return_value=True): private.validate_driver("gnome-wayland",dict(os.environ))\nprint("private-bus-accepted")'
        child=subprocess.run(['/bin/sh','-c','exec "$@"','private-bus-driver','/usr/bin/dbus-run-session','--config-file',str(config),'--','/usr/bin/python3','-c',code],env=env,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=3)
        assert child.returncode==0 and child.stdout.strip()=='private-bus-accepted'
        print(json.dumps({'case':case,'validPrivateContext':True,'nativeCalls':0,'wrapperPwdValidated':True,'hostPlatformSubstituted':True}));sys.exit(0)
    if case=='platform-denied':
        assert not private.guest_allowed('ID=ubuntu\nVERSION_ID="13"',os.getuid(),False)
        assert not private.guest_allowed('ID=debian\nVERSION_ID="13"',0,False)
        assert not private.guest_allowed('ID=debian\nVERSION_ID="13"',os.getuid(),True)
        print(json.dumps({'case':case,'rejectedBeforeNative':True,'nativeCalls':0}));sys.exit(0)
    bus=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
    try:
        bus.bind(str(root/'dbus-session'))
        env['DBUS_SESSION_BUS_ADDRESS']='unix:path='+str(root/'dbus-session')+',guid='+'a'*32
        if case=='valid':
            assert private.private_root(str(root),'gnome-wayland',env)==root
            print(json.dumps({'case':case,'validPrivateContext':True,'nativeCalls':0}));sys.exit(0)
        if case.startswith('external-'):
            key={'external-home':'HOME','external-config':'XDG_CONFIG_HOME','external-data':'XDG_DATA_HOME','external-cache':'XDG_CACHE_HOME','external-runtime':'XDG_RUNTIME_DIR'}[case]
            env[key]='/tmp'
        elif case=='combined-escape':
            env['XDG_CONFIG_HOME']='/tmp';env['GSETTINGS_BACKEND']='dconf';env['DBUS_SESSION_BUS_ADDRESS']+=';unix:path=/run/user/1000/bus'
        elif case=='dconf': env['GSETTINGS_BACKEND']='dconf'
        elif case=='fallback-bus': env['DBUS_SESSION_BUS_ADDRESS']+=';unix:path=/run/user/1000/bus'
        elif case=='abstract-bus': env['DBUS_SESSION_BUS_ADDRESS']='unix:abstract=outside,guid='+'a'*32
        elif case=='outside-bus': env['DBUS_SESSION_BUS_ADDRESS']='unix:path=/run/user/1000/bus,guid='+'a'*32
        elif case=='non-socket-bus': bus.close();(root/'dbus-session').unlink();(root/'dbus-session').touch()
        elif case=='invalid-guid': env['DBUS_SESSION_BUS_ADDRESS']='unix:path='+str(root/'dbus-session')+',guid=invalid'
        elif case=='schema-override': env['GSETTINGS_SCHEMA_DIR']='/tmp'
        elif case=='loader-override': env['LD_PRELOAD']='/tmp/public-never-loaded.so'
        elif case=='unknown-env': env['SYNTHETIC_PRIVATE_CANARY']='not-retained'
        elif case=='outside-pwd': env['PWD']='/tmp'
        elif case=='symlink-config': (root/'config').rmdir();(root/'config').symlink_to(root/'cache',target_is_directory=True)
        elif case=='shared-config': (root/'config').chmod(0o755)
        elif case=='inherited-display': env['DISPLAY']=':1'
        else: raise ValueError('UNKNOWN_PUBLIC_GUARD_CASE')
        calls=[]
        # Isolate real inner-entry ordering from this host's non-Debian platform.
        with patch.dict(os.environ,env,clear=True),patch.object(sys,'argv',['run-session.py','gnome-wayland','--private-guest','--inner',str(root)]),patch.object(private,'guest_allowed',return_value=True),patch.object(runner,'verify_build',return_value={}),patch.object(runner,'inner',side_effect=lambda *_args:calls.append('native')):
            status=runner.main()
        assert status==3 and not calls
        # The same validator's driver branch is used by direct Node entry.
        env['WAYLAND_DISPLAY']='linuxcast-s001-wayland';env['XDG_SESSION_TYPE']='wayland'
        try: private.private_root(str(root),'gnome-wayland',env,driver=True)
        except (ValueError,OSError): pass
        else: raise AssertionError('DIRECT_DRIVER_GUARD_ACCEPTED_BAD_CONTEXT')
        print(json.dumps({'case':case,'rejectedBeforeNative':True,'nativeCalls':len(calls)}))
    finally: bus.close()
