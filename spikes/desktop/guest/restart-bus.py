#!/usr/bin/python3
"""Actual private Gio helper process; hold one real reply before external SIGKILL."""
import json
import os
import pathlib
import subprocess
import sys
import gi

gi.require_version('Gio','2.0')
from gi.repository import Gio, GLib
ROOT=pathlib.Path(os.environ.get('LINUXCAST_S002_RESULT_DIR',''))
PHASE=os.environ.get('LINUXCAST_S002_RESTART_PHASE')
if os.environ.get('LINUXCAST_S002_PRIVATE_GUEST')!='1' or not str(ROOT).startswith('/tmp/linuxcast-s002-') or PHASE not in ('crash','fresh'): sys.exit(3)
BUS='io.github.ianwijma.Linuxcast.Spike.Desktop1'
PATH='/io/github/ianwijma/Linuxcast/Spike/Desktop1'
METHODS=('CanaryContext','Handshake','NextCommand','Ack')
XML='<node><interface name="'+BUS+'">'+''.join('<method name="'+name+'"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>' for name in METHODS)+'</interface></node>'

def main():
    loop=GLib.MainLoop()
    node=os.environ.get('LINUXCAST_S002_NODE','/usr/bin/node')
    child=subprocess.Popen([node,str(pathlib.Path(__file__).with_name('restart-helper.mjs'))],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1)
    connection=Gio.bus_get_sync(Gio.BusType.SESSION,None)
    waiting={}; held=[]; serial=0; counts={name:0 for name in METHODS}
    def metrics(): (ROOT/('restart-'+PHASE+'-requests.json')).write_text(json.dumps(counts))
    metrics()
    def reply(invocation,value): invocation.return_value(GLib.Variant('(s)',(json.dumps(value),)))
    def method(_connection,sender,_path,_interface,name,params,invocation):
        nonlocal serial
        try:
            owner=connection.call_sync('org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','GetNameOwner',GLib.Variant('(s)',('org.kde.KWin',)),GLib.VariantType.new('(s)'),Gio.DBusCallFlags.NONE,1000,None).unpack()[0]
            encoded=params.unpack()[0]
            if sender!=owner or name not in METHODS or len(encoded.encode())>32768 or waiting or held: raise ValueError()
            value=json.loads(encoded)
            if not isinstance(value,dict): raise ValueError()
            counts[name]+=1; metrics(); serial+=1; waiting[serial]=(invocation,name)
            child.stdin.write(json.dumps({'id':serial,'method':name,'peer':sender,'body':value})+'\n'); child.stdin.flush()
        except Exception: reply(invocation,{'kind':'error','reason':'PRIVATE_RESTART_REQUEST_REJECTED'})
    def ready(_fd,_condition):
        line=child.stdout.readline(65537)
        if not line or len(line)>65536: loop.quit(); return False
        try:
            frame=json.loads(line); invocation,name=waiting.pop(frame['id']); value=frame['reply']
            if PHASE=='crash' and name=='NextCommand' and value.get('kind')=='command' and value['command']['operation']=='place':
                held.append(invocation)
                (ROOT/'restart-held.json').write_text(json.dumps({'actualDbusInvocationPending':True,'queueInFlight':True,'deliveredToScript':False,'id':value['command']['id']}))
                return True
            reply(invocation,value)
        except Exception: loop.quit(); return False
        return True
    registration=connection.register_object(PATH,Gio.DBusNodeInfo.new_for_xml(XML).interfaces[0],method,None,None)
    owner=Gio.bus_own_name_on_connection(connection,BUS,Gio.BusNameOwnerFlags.NONE,None,None)
    watch=GLib.io_add_watch(child.stdout.fileno(),GLib.IO_IN|GLib.IO_HUP,ready)
    timeout=GLib.timeout_add(20000,lambda:(loop.quit(),False)[1])
    try: loop.run()
    finally:
        GLib.source_remove(watch); GLib.source_remove(timeout); Gio.bus_unown_name(owner); connection.unregister_object(registration)
        child.terminate()
        try: child.wait(timeout=2)
        except subprocess.TimeoutExpired: child.kill(); child.wait()

if __name__=='__main__': main()
