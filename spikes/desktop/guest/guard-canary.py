"""Harmless entry-order regression; no settings, compositor, display or VM calls."""
import importlib.util
import json
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
from unittest.mock import patch

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('runner',HERE/'run-session.py')
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
_context=runner._context
case=sys.argv[1]
with tempfile.TemporaryDirectory(prefix='linuxcast-s002-guard-',dir='/tmp') as temporary:
    root=pathlib.Path(temporary)
    for name in _context.DIRECTORIES.values(): (root/name).mkdir(mode=0o700)
    env=_context.private_environment(root)
    if case=='real-private-bus':
        services=root/'services';services.mkdir(mode=0o700)
        config=root/'bus.conf';config.write_text('<busconfig><type>session</type><listen>unix:path='+str(root/'dbus-session')+'</listen><auth>EXTERNAL</auth><servicedir>'+str(services)+'</servicedir><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>')
        code='import sys;sys.path.insert(0,'+repr(str(HERE))+');from private_context import private_context;private_context('+repr(str(root))+',"gnome-wayland");print("private-bus-accepted")'
        child=subprocess.run(['/usr/bin/dbus-run-session','--config-file',str(config),'--','/usr/bin/python3','-c',code],env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=3)
        assert child.returncode==0 and child.stdout.strip()=='private-bus-accepted'
        print(json.dumps({'case':case,'validPrivateContext':True,'nativeCalls':0}));sys.exit(0)
    bus=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
    try:
        bus.bind(str(root/'dbus-guard'))
        env['DBUS_SESSION_BUS_ADDRESS']='unix:path='+str(root/'dbus-guard')+',guid='+'a'*32
        if case=='valid':
            assert _context.private_context(str(root),'gnome-wayland',env)==root
            print(json.dumps({'case':case,'validPrivateContext':True,'nativeCalls':0}));sys.exit(0)
        if case.startswith('external-'):
            key={'external-home':'HOME','external-config':'XDG_CONFIG_HOME','external-data':'XDG_DATA_HOME','external-cache':'XDG_CACHE_HOME','external-runtime':'XDG_RUNTIME_DIR'}[case]
            env[key]='/tmp'
        elif case=='dconf': env['GSETTINGS_BACKEND']='dconf'
        elif case=='fallback-bus': env['DBUS_SESSION_BUS_ADDRESS']+=';unix:path=/run/user/1000/bus'
        elif case=='abstract-bus': env['DBUS_SESSION_BUS_ADDRESS']='unix:abstract=outside,guid='+'a'*32
        elif case=='outside-bus': env['DBUS_SESSION_BUS_ADDRESS']='unix:path=/run/user/1000/bus,guid='+'a'*32
        elif case=='backend-override': env['GSETTINGS_SCHEMA_DIR']='/tmp'
        elif case=='symlink-config':
            (root/'config').rmdir();(root/'config').symlink_to(root/'cache',target_is_directory=True)
        elif case=='shared-config': (root/'config').chmod(0o755)
        elif case=='inherited-display': env['DISPLAY']=':1'
        else: raise ValueError('UNKNOWN_PUBLIC_GUARD_CASE')
        calls=[]
        # Platform proof is independently exercised below. This fixture isolates
        # real --inner validation ordering on the ordinary non-Debian host.
        with patch.dict(os.environ,env,clear=True),patch.object(sys,'argv',['run-session.py','gnome-wayland','--private-guest','--inner',str(root)]),patch.object(_context,'guest_allowed',return_value=True),patch.object(runner,'inner',side_effect=lambda *_args:calls.append('native')):
            status=runner.main()
        assert status==3 and not calls
        print(json.dumps({'case':case,'rejectedBeforeNative':True,'nativeCalls':len(calls)}))
    finally:
        bus.close()
