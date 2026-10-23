"""Public synthetic owned-target fixtures. No Xlib load, display, bus or guest."""
import contextlib
import ctypes as C
import importlib.util
import io
import json
import pathlib
import sys
import types
from unittest.mock import patch

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('owned_x11',HERE/'owned-x11.py');o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o)
NAME=sys.argv[1]
CLASS=(o.APP_ID.lower()+'\0'+o.APP_ID+'\0').encode()
BIND={'command':'bind','generation':1,'nonce':'a'*64,'pid':101,'xid':123}
OBS={'command':'observe','generation':1,'nonce':'a'*64,'request':1}
class Lease:
    def __init__(self):self.live=True;self.closed=False
    def alive(self):return self.live
    def close(self):self.closed=True
class Native:
    def __init__(self):
        self.pids={123:101,124:101,125:999};self.classes={123:CLASS,124:CLASS,125:b'synthetic-private-canary'};self.members=[123,124]
        self.calls=[];self.queued=[];self.after_geometry=None;self.fail=None;self.fd=99
    def pid(self,xid):
        self.calls.append(('pid',xid))
        if self.fail=='pid' or xid not in self.pids:raise o.MissingWindow()
        return self.pids[xid]
    def class_(self,xid):
        self.calls.append(('class',xid))
        if self.fail=='class':raise o.MissingWindow()
        return self.classes[xid]
    def watch(self,xid):
        self.calls.append(('watch',xid))
        if self.fail=='watch':raise o.MissingWindow()
    def events(self,xid):
        self.calls.append(('events',xid));result=self.queued;self.queued=[];return result
    def clients(self):self.calls.append(('clients',0));return self.members
    def geometry(self,xid,allow_unavailable=False):
        self.calls.append(('geometry',xid))
        if self.fail=='geometry':raise o.MissingWindow()
        if self.after_geometry:self.after_geometry()
        if NAME.startswith('two-owned-missing-'):assert allow_unavailable
        frame=None if NAME in ('two-owned-missing-frame','two-owned-missing-both') else {'x':32,'y':32,'width':720,'height':429}
        area=None if NAME in ('two-owned-missing-workarea','two-owned-missing-both') else {'x':0,'y':0,'width':1280,'height':900}
        return frame,area,False,False
    def close(self):self.calls.append(('closed',0))
def fixture(bind=BIND):
    native=Native();lease=Lease();target=o.Target(native,lambda pid:lease)
    if bind is not None:assert target.bind(dict(bind))=={'bound':True}
    return native,lease,target
def rejects(call):
    try:call()
    except (o.Rejected,o.MissingWindow):return
    raise AssertionError('SYNTHETIC_REJECTION_REQUIRED')
def no_geometry(native):assert not any(name=='geometry' for name,_ in native.calls)

if NAME in ('two-owned-candidates','two-owned-missing-frame','two-owned-missing-workarea','two-owned-missing-both'):
    x,lease,target=fixture();reply=target.command(dict(OBS));assert reply['launcher']['count']==1 and reply['launcher']['identityMatches']
    assert all(xid==123 for name,xid in x.calls if name in ('pid','class','geometry','watch','events'))
    assert reply['decoy']==o.empty() and not reply['decoyActivationIssued'];target.close();assert lease.closed
    assert (reply['launcher']['geometry'] is None)==(NAME in ('two-owned-missing-frame','two-owned-missing-both'))
    assert (reply['launcher']['workArea'] is None)==(NAME in ('two-owned-missing-workarea','two-owned-missing-both'))
elif NAME=='foreign-pid':
    x,lease,target=fixture(None);rejects(lambda:target.bind({**BIND,'xid':125}));no_geometry(x);assert ('class',125) not in x.calls
elif NAME in ('class-mismatch','class-suffix','class-no-nul','class-extra-nul','class-private','class-nonbytes'):
    x,lease,target=fixture(None)
    x.classes[123]={'class-mismatch':b'other\0Other\0','class-suffix':CLASS+b'private','class-no-nul':CLASS[:-1],
        'class-extra-nul':CLASS+b'\0','class-private':b'synthetic-private-canary\0private\0','class-nonbytes':'synthetic-private-canary'}[NAME]
    rejects(lambda:target.bind(dict(BIND)));no_geometry(x)
elif NAME in ('swapped-request','stale-generation','wrong-nonce','request-replay','extra-private','second-bind','boolean-generation'):
    x,lease,target=fixture()
    if NAME=='swapped-request':value={**OBS,'xid':124}
    elif NAME=='stale-generation':value={**OBS,'generation':2}
    elif NAME=='boolean-generation':value={**OBS,'generation':True}
    elif NAME=='wrong-nonce':value={**OBS,'nonce':'b'*64}
    elif NAME=='extra-private':value={**OBS,'private':'synthetic-private-canary'}
    elif NAME=='second-bind':rejects(lambda:target.bind(dict(BIND)));value=None
    else:target.command(dict(OBS));x.calls=[];value=dict(OBS)
    if value is not None:rejects(lambda:target.command(value))
    no_geometry(x)
elif NAME in ('owner-dead','destroy-reuse','identity-event','identity-restored','unmanaged','during-geometry-death','during-geometry-swap'):
    x,lease,target=fixture()
    if NAME=='owner-dead':lease.live=False
    elif NAME=='destroy-reuse':x.queued=['destroy'];x.pids[123]=101
    elif NAME in ('identity-event','identity-restored'):x.queued=['identity-change']
    elif NAME=='unmanaged':x.members=[124]
    elif NAME=='during-geometry-death':x.after_geometry=lambda:setattr(lease,'live',False)
    else:x.after_geometry=lambda:x.pids.update({123:999})
    rejects(lambda:target.command(dict(OBS)))
    if not NAME.startswith('during-'):no_geometry(x)
elif NAME in ('bad-window-pid','bad-window-class','bad-window-watch','bad-window-geometry'):
    x,lease,target=fixture(None);x.fail=NAME.removeprefix('bad-window-')
    if x.fail=='geometry':target.bind(dict(BIND));rejects(lambda:target.command(dict(OBS)))
    else:rejects(lambda:target.bind(dict(BIND)));no_geometry(x)
elif NAME in ('retired-absent','retired-reused','retired-stale-list','retired-live','retired-exit-bool','retired-identity-event'):
    x,lease,target=fixture();x.calls=[];lease.live=NAME=='retired-live'
    retire={k:OBS[k] for k in ('generation','nonce')};retire.update(command='retire',exitCode=False if NAME=='retired-exit-bool' else 0)
    if NAME in ('retired-live','retired-exit-bool'):rejects(lambda:target.command(retire))
    else:
        target.command(retire)
        if NAME!='retired-reused':del x.pids[123]
        if NAME!='retired-stale-list':x.members=[124]
        if NAME=='retired-identity-event':x.queued=['identity-change']
        if NAME=='retired-absent':assert target.command(dict(OBS))['launcher']==o.empty()
        else:rejects(lambda:target.command(dict(OBS)))
    no_geometry(x);assert not any(name=='class' for name,_ in x.calls)
elif NAME.startswith('lease-'):
    calls=[];live=[NAME!='lease-initial-dead'];x=Native();target=o.Target(x)
    def opened(pid,flags):
        calls.append('open');assert pid==101 and flags==0
        if NAME=='lease-open-failed':raise o.Rejected('lifetime')
        return 88
    class Poll:
        def register(self,fd,mask):assert fd==88;calls.append('poll-register')
        def poll(self,timeout):assert timeout==0;calls.append('poll');return [] if live[0] else [(88,o.select.POLLIN)]
    def ancestry(pid):
        assert pid==101;calls.append('ancestry')
        if NAME=='lease-ancestry-failed':raise o.Rejected('lifetime')
        # Numeric /proc can now describe a replacement, while the retained
        # original process handle reports death. No window lookup may follow.
        if NAME=='lease-race-replaced':live[0]=False
        return 100
    with patch.object(o.os,'pidfd_open',side_effect=opened),patch.object(o.os,'getppid',return_value=100),patch.object(o.os,'close',side_effect=lambda fd:calls.append(('close',fd))),patch.object(o.select,'poll',Poll),patch.object(o,'process_status',side_effect=ancestry):
        if NAME=='lease-open-first':
            target.bind(dict(BIND));target.close()
            assert calls[:4]==['open','poll-register','poll','ancestry'] and calls[-1]==('close',88)
        else:
            rejects(lambda:target.bind(dict(BIND)))
            assert x.calls==[]
            if NAME=='lease-open-failed':assert calls==['open']
            else:assert calls[-1]==('close',88) and calls.count(('close',88))==1
            if NAME=='lease-initial-dead':assert 'ancestry' not in calls
            if NAME=='lease-race-replaced':assert calls==['open','poll-register','poll','ancestry','poll-register','poll',('close',88)]
elif NAME.startswith('optional-'):
    x=object.__new__(o.Xlib);x.display=1;x.error=None;x.atoms={'_NET_FRAME_EXTENTS':0 if NAME=='optional-atom-absent' else 1,'CARDINAL':2};calls=[]
    storage=(C.c_ulong*4)(1,2,3,4)
    class DLL:
        def XGetWindowProperty(self,_d,_w,_p,_off,_len,_del,_req,actual,fmt,count,tail,data):
            calls.append('read');kind=NAME.removeprefix('optional-')
            C.cast(actual,C.POINTER(C.c_ulong))[0]=2 if kind in ('short','wrong-format') else 3 if kind=='wrong-type' else 0
            C.cast(fmt,C.POINTER(C.c_int))[0]=8 if kind=='wrong-format' else 32 if kind in ('short','wrong-type') else 0
            C.cast(count,C.POINTER(C.c_ulong))[0]=3 if kind=='short' else 4 if kind in ('wrong-format','wrong-type') else 1 if kind=='nonzero-count' else 0
            C.cast(tail,C.POINTER(C.c_ulong))[0]=4 if kind=='tail' else 0
            C.cast(data,C.POINTER(C.c_void_p))[0]=C.cast(storage,C.c_void_p).value if kind in ('pointer','short','wrong-format','wrong-type') else None
            return 0
        def XSync(self,*_):return 0
        def XFree(self,_):calls.append('free')
    x.lib=DLL()
    query=lambda optional:x.property(123,'_NET_FRAME_EXTENTS','CARDINAL',32,4,4,optional=optional)
    if NAME in ('optional-absent','optional-atom-absent'):
        assert query(True) is None;rejects(lambda:query(False))
        if NAME=='optional-atom-absent':assert calls==[]
    else:rejects(lambda:query(True))
    if NAME in ('optional-pointer','optional-short','optional-wrong-format','optional-wrong-type'):assert calls.count('free')==1
elif NAME in ('atoms-optional-absent','atoms-identity-absent'):
    missing=('_NET_FRAME_EXTENTS','_NET_WORKAREA') if NAME=='atoms-optional-absent' else ('_NET_WM_PID',)
    class Function:
        def __init__(self,call=lambda *_:1):self.call=call
        def __call__(self,*args):return self.call(*args)
    class DLL:
        def __init__(self):self.functions={}
        def __getattr__(self,name):
            if name not in self.functions:self.functions[name]=Function((lambda _display,atom,_only:0 if atom.decode() in missing else 1) if name=='XInternAtom' else lambda *_:1)
            return self.functions[name]
    with patch.object(o.C,'CDLL',return_value=DLL()),patch.dict(o.os.environ,{'DISPLAY':':99'}):
        if NAME=='atoms-optional-absent':x=o.Xlib();assert x.atoms['_NET_FRAME_EXTENTS']==x.atoms['_NET_WORKAREA']==0;x.close()
        else:rejects(o.Xlib)
elif NAME.startswith('property-') and NAME!='property-free-on-reject':
    expected=6;actual=6;fmt=32;remaining=0;count=4;maximum=4;exact=4
    longs=(C.c_ulong*4)(1,2,3,4);pointer=C.cast(longs,C.c_void_p)
    if NAME=='property-wrong-type':actual=7
    elif NAME=='property-wrong-format':fmt=8
    elif NAME=='property-oversize':count=5
    elif NAME=='property-short':count=3
    elif NAME=='property-tail':remaining=4
    elif NAME=='property-null':pointer=C.c_void_p()
    elif NAME=='property-highbits':longs[0]=1<<40
    elif NAME=='property-bool-count':count=True
    elif NAME!='property-long-stride':raise AssertionError('UNKNOWN_PROPERTY_CASE')
    call=lambda:o.decode_property(actual,fmt,count,remaining,pointer,expected,32,maximum,exact)
    if NAME=='property-long-stride':assert C.sizeof(C.c_ulong)==8 and call()==[1,2,3,4]
    else:rejects(call)
elif NAME=='property-free-on-reject':
    x=object.__new__(o.Xlib);x.display=1;x.error=None;x.atoms={'WM_CLASS':1,'STRING':2};storage=C.create_string_buffer(b'private');freed=[]
    class DLL:
        def XGetWindowProperty(self,_d,_w,_p,_off,_len,_del,_req,actual,fmt,count,tail,data):
            C.cast(actual,C.POINTER(C.c_ulong))[0]=3;C.cast(fmt,C.POINTER(C.c_int))[0]=8;C.cast(count,C.POINTER(C.c_ulong))[0]=7
            C.cast(tail,C.POINTER(C.c_ulong))[0]=0;C.cast(data,C.POINTER(C.c_void_p))[0]=C.cast(storage,C.c_void_p).value;return 0
        def XSync(self,*_):return 0
        def XFree(self,value):freed.append(value)
    x.lib=DLL();rejects(lambda:x.class_(123));assert len(freed)==1
elif NAME.startswith('event-'):
    x=object.__new__(o.Xlib);x.display=1;x.atoms={'WM_CLASS':1,'_NET_WM_PID':2}
    queued=[17] if NAME in ('event-destroy','event-foreign') else [28] if NAME=='event-identity' else [6] if NAME=='event-input' else [22]*65
    class DLL:
        def XPending(self,*_):return len(queued)
        def XNextEvent(self,_display,pointer):
            event=C.cast(pointer,C.POINTER(o.Event)).contents;event.type=queued.pop(0)
            if event.type==17:event.destroy.window=124 if NAME=='event-foreign' else 123
            elif event.type==28:event.property.window=123;event.property.atom=1
            return 0
    x.lib=DLL()
    if NAME=='event-destroy':assert x.events(123)==['destroy']
    elif NAME=='event-identity':assert x.events(123)==['identity-change']
    else:rejects(lambda:x.events(123))
elif NAME.startswith('geometry-'):
    x=object.__new__(o.Xlib);x.display=1;x.root=10;x.error=None;calls=[]
    values={'_NET_FRAME_EXTENTS':[4,4,24,4], '_NET_NUMBER_OF_DESKTOPS':[1], '_NET_CURRENT_DESKTOP':[0],
        '_NET_DESKTOP_VIEWPORT':[0,0], '_NET_WORKAREA':[0,0,1280,900], '_NET_ACTIVE_WINDOW':[123]}
    mutation=NAME.removeprefix('geometry-')
    if mutation=='extents':values['_NET_FRAME_EXTENTS']=[65537,4,24,4]
    elif mutation=='desktop-count':values['_NET_NUMBER_OF_DESKTOPS']=[0]
    elif mutation=='desktop-index':values['_NET_CURRENT_DESKTOP']=[1]
    elif mutation=='viewport':values['_NET_DESKTOP_VIEWPORT']=[1,0]
    elif mutation=='workarea':values['_NET_WORKAREA']=[0,0,0,900]
    elif mutation=='active-highbits':values['_NET_ACTIVE_WINDOW']=[1<<40]
    if mutation.startswith('missing-'):
        if mutation in ('missing-frame','missing-both','missing-strict','missing-both-zero-client'):values['_NET_FRAME_EXTENTS']=None
        if mutation in ('missing-workarea','missing-both','missing-strict','missing-both-zero-client'):values['_NET_WORKAREA']=None
    class DLL:
        def XGetWindowAttributes(self,_display,window,pointer):
            assert window==123;calls.append('attributes');a=C.cast(pointer,C.POINTER(o.Attributes)).contents
            a.root=10;a.class_=1;a.width=712;a.height=401;a.map_state=0 if mutation=='hidden' else 2
            if mutation=='foreign-root':a.root=11
            if mutation=='override':a.override_redirect=1
            if mutation=='map-state':a.map_state=3
            if mutation=='bad-window':raise o.MissingWindow()
            if mutation=='missing-both-zero-client':a.width=0
            return 1
        def XTranslateCoordinates(self,_display,window,root,_x,_y,xp,yp,child):
            assert window==123 and root==10;calls.append('translate');C.cast(xp,C.POINTER(C.c_int))[0]=36;C.cast(yp,C.POINTER(C.c_int))[0]=56;return 1
        def XSync(self,*_):return 0
    def property_(window,name,type_,fmt,maximum,exact,optional=False):
        calls.append(name);assert window==(123 if name=='_NET_FRAME_EXTENTS' else 10)
        assert fmt==32 and type_==('WINDOW' if name=='_NET_ACTIVE_WINDOW' else 'CARDINAL')
        result=values[name]
        if result is None:
            if optional:return None
            raise o.Rejected('identity')
        assert len(result)==exact and len(result)<=maximum;return result
    x.lib=DLL();x.property=property_
    if mutation in ('valid','hidden'):
        frame,area,hidden,focused=x.geometry(123)
        assert frame=={'x':32,'y':32,'width':720,'height':429} and area=={'x':0,'y':0,'width':1280,'height':900}
        assert hidden==(mutation=='hidden') and focused
    elif mutation in ('missing-frame','missing-workarea','missing-both'):
        frame,area,hidden,focused=x.geometry(123,allow_unavailable=True)
        assert (frame is None)==(mutation in ('missing-frame','missing-both')) and (area is None)==(mutation in ('missing-workarea','missing-both'))
        assert not hidden and focused
        rejects(lambda:x.geometry(123))
    elif mutation=='missing-both-zero-client':rejects(lambda:x.geometry(123,allow_unavailable=True));assert calls==['attributes']
    else:rejects(lambda:x.geometry(123))
    if mutation in ('foreign-root','override','map-state','bad-window'):assert calls==['attributes']
elif NAME=='mask-and-abi':
    assert o.Xlib.MASK==((1<<17)|(1<<22)) and not o.Xlib.MASK&((1<<0)|(1<<1)|(1<<2)|(1<<3)|(1<<6))
    assert C.sizeof(o.Event)==24*C.sizeof(C.c_long) and C.sizeof(o.Attributes)==136
elif NAME=='guard-before-library':
    calls=[]
    with patch.object(o,'target_guard',side_effect=o.Rejected('guard')),patch.object(o,'Xlib',side_effect=lambda:calls.append('native')),patch.object(sys,'argv',['owned','--kwin-x11-lifecycle-only']):rejects(o.main)
    assert calls==[]
elif NAME in ('pipe-eof','pipe-overflow','pipe-private-json','pipe-duplicate'):
    x=Native();chunks={'pipe-eof':[b''],'pipe-overflow':[b'x'*4096,b'x'],
        'pipe-private-json':[b'{"private":"synthetic-private-canary"}\n'],'pipe-duplicate':[b'{"command":"bind","command":"private"}\n']}[NAME]
    class Selector:
        def register(self,*_):pass
        def select(self):return [(types.SimpleNamespace(data='control'),0)]
        def close(self):pass
    with patch.object(o,'target_guard'),patch.object(o,'private_root'),patch.dict(o.os.environ,{'LINUXCAST_S001_BACKEND':'kwin-x11'}),patch.object(o,'Xlib',return_value=x),patch.object(o.selectors,'DefaultSelector',Selector),patch.object(o.os,'read',side_effect=chunks),patch.object(sys,'argv',['owned','--kwin-x11-lifecycle-only']),contextlib.redirect_stdout(io.StringIO()) as stream:
        if NAME=='pipe-eof':assert o.main()==0
        else:rejects(o.main)
    assert not any(name in ('pid','class','geometry','watch') for name,_ in x.calls);assert 'synthetic-private' not in stream.getvalue()
else:raise AssertionError('UNKNOWN_OWNED_TARGET_CASE')
print('owned-'+NAME+'-passed')
