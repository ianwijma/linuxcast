"""Outbound KWin-only observation bridge on a fresh private bus. No native control."""
import json
import os
import sys
import gi
from private import private_root, read_context, target_guard
gi.require_version('Gio','2.0')
from gi.repository import Gio, GLib

BUS='io.github.ianwijma.Linuxcast.Spike.LauncherMatrix1'
PATH='/io/github/ianwijma/Linuxcast/Spike/LauncherMatrix1'
XML='<node><interface name="'+BUS+'">'+''.join('<method name="'+name+'"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>' for name in ('Context','Observation'))+'</interface></node>'

def main():
    target_guard()
    root=private_root(os.environ.get('LINUXCAST_S001_MATRIX_ROOT',''),os.environ.get('LINUXCAST_S001_BACKEND'),driver=True)
    loop=GLib.MainLoop()
    connection=Gio.bus_get_sync(Gio.BusType.SESSION,None)
    def method(_connection,sender,_path,_interface,name,parameters,invocation):
        result={}
        try:
            owner=connection.call_sync('org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','GetNameOwner',GLib.Variant('(s)',('org.kde.KWin',)),GLib.VariantType.new('(s)'),Gio.DBusCallFlags.NONE,1000,None).unpack()[0]
            encoded=parameters.unpack()[0]
            if sender!=owner or len(encoded.encode())>8192: raise ValueError('KWIN_PEER_REQUIRED')
            context=read_context(root)
            if name=='Context' and encoded=='{}': result=context
            elif name=='Observation':
                value=json.loads(encoded)
                if not context or not isinstance(value,dict) or set(value)!=set(('request','launcher','decoy','decoyActivationIssued')) or value['request']!=context['request'] or type(value['decoyActivationIssued']) is not bool:
                    raise ValueError('OBSERVATION_SCHEMA')
                # This file is private and Node validates every nested scalar
                # before public evidence. Only the actual KWin owner may write.
                (root/'observation.json').write_text(json.dumps(value))
                result={'accepted':True}
        except (ValueError,KeyError,OSError,GLib.Error): pass
        invocation.return_value(GLib.Variant('(s)',(json.dumps(result),)))
    registration=connection.register_object(PATH,Gio.DBusNodeInfo.new_for_xml(XML).interfaces[0],method,None,None)
    owner=Gio.bus_own_name_on_connection(connection,BUS,Gio.BusNameOwnerFlags.NONE,None,None)
    try: loop.run()
    finally:
        Gio.bus_unown_name(owner)
        connection.unregister_object(registration)

if __name__=='__main__':
    try: main()
    except (ValueError,OSError): sys.exit(3)
