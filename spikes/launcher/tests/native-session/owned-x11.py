"""Private exact-owned-target observer; never a general X11 or plugin endpoint."""
import ctypes as C
import json
import os
import pathlib
import re
import select
import selectors
import sys
from private import target_guard, private_root

APP_ID='io.github.ianwijma.Linuxcast'
FAILURES=('binding','abi','identity','lifetime','native-query','overflow','guard','protocol','deadline')
class Rejected(Exception):
    def __init__(self,kind):
        self.kind=kind if kind in FAILURES else 'native-query'
        super().__init__('OWNED_TARGET_REJECTED')
def require(value,kind='protocol'):
    if not value: raise Rejected(kind)
def keys(value,names):require(type(value) is dict and set(value)==set(names))
def integer(value,low,high):require(type(value) is int and low<=value<=high);return value
def unique(pairs):
    result={}
    for key,value in pairs:
        require(key not in result);result[key]=value
    return result

def decode_property(actual,fmt,count,remaining,pointer,expected,format_,maximum,exact=None):
    """Xlib format32 is C-long storage even on LP64, not packed uint32."""
    require(actual==expected and fmt==format_ and remaining==0,'identity')
    require(type(count) is int and 0<=count<=maximum and (exact is None or count==exact),'identity')
    require(count==0 or bool(pointer),'native-query')
    if format_==8:return C.string_at(pointer,count)
    require(format_==32,'native-query')
    values=[int(C.cast(pointer,C.POINTER(C.c_ulong))[i]) for i in range(count)]
    require(all(0<=number<=0xffffffff for number in values),'identity')
    return values

class Attributes(C.Structure):
    _fields_=[('x',C.c_int),('y',C.c_int),('width',C.c_int),('height',C.c_int),('border_width',C.c_int),('depth',C.c_int),
        ('visual',C.c_void_p),('root',C.c_ulong),('class_',C.c_int),('bit_gravity',C.c_int),('win_gravity',C.c_int),('backing_store',C.c_int),
        ('backing_planes',C.c_ulong),('backing_pixel',C.c_ulong),('save_under',C.c_int),('colormap',C.c_ulong),('map_installed',C.c_int),
        ('map_state',C.c_int),('all_event_masks',C.c_long),('your_event_mask',C.c_long),('do_not_propagate_mask',C.c_long),('override_redirect',C.c_int),('screen',C.c_void_p)]
class ErrorEvent(C.Structure):
    _fields_=[('type',C.c_int),('display',C.c_void_p),('resourceid',C.c_ulong),('serial',C.c_ulong),('error_code',C.c_ubyte),('request_code',C.c_ubyte),('minor_code',C.c_ubyte)]
class DestroyEvent(C.Structure):
    _fields_=[('type',C.c_int),('serial',C.c_ulong),('send_event',C.c_int),('display',C.c_void_p),('event',C.c_ulong),('window',C.c_ulong)]
class PropertyEvent(C.Structure):
    _fields_=[('type',C.c_int),('serial',C.c_ulong),('send_event',C.c_int),('display',C.c_void_p),('window',C.c_ulong),('atom',C.c_ulong),('time',C.c_ulong),('state',C.c_int)]
class Event(C.Union):_fields_=[('type',C.c_int),('destroy',DestroyEvent),('property',PropertyEvent),('pad',C.c_long*24)]
class MissingWindow(Exception):pass

class Xlib:
    MASK=(1<<17)|(1<<22)  # own StructureNotify + PropertyChange ONLY
    def __init__(self):
        require(sys.byteorder=='little' and C.sizeof(C.c_ulong)==8 and os.uname().machine=='x86_64','abi')
        self.lib=C.CDLL('/usr/lib/x86_64-linux-gnu/libX11.so.6');self.error=None
        signatures={'XOpenDisplay':([C.c_char_p],C.c_void_p),'XCloseDisplay':([C.c_void_p],C.c_int),
            'XDefaultRootWindow':([C.c_void_p],C.c_ulong),'XConnectionNumber':([C.c_void_p],C.c_int),
            'XInternAtom':([C.c_void_p,C.c_char_p,C.c_int],C.c_ulong),'XSync':([C.c_void_p,C.c_int],C.c_int),
            'XSelectInput':([C.c_void_p,C.c_ulong,C.c_long],C.c_int),'XPending':([C.c_void_p],C.c_int),'XNextEvent':([C.c_void_p,C.POINTER(Event)],C.c_int),
            'XGetWindowProperty':([C.c_void_p,C.c_ulong,C.c_ulong,C.c_long,C.c_long,C.c_int,C.c_ulong,C.POINTER(C.c_ulong),C.POINTER(C.c_int),C.POINTER(C.c_ulong),C.POINTER(C.c_ulong),C.POINTER(C.c_void_p)],C.c_int),
            'XGetWindowAttributes':([C.c_void_p,C.c_ulong,C.POINTER(Attributes)],C.c_int),
            'XTranslateCoordinates':([C.c_void_p,C.c_ulong,C.c_ulong,C.c_int,C.c_int,C.POINTER(C.c_int),C.POINTER(C.c_int),C.POINTER(C.c_ulong)],C.c_int),
            'XFree':([C.c_void_p],C.c_int)}
        for name,(arguments,result) in signatures.items():
            function=getattr(self.lib,name);function.argtypes=arguments;function.restype=result
        handler=C.CFUNCTYPE(C.c_int,C.c_void_p,C.POINTER(ErrorEvent))
        def error(_display,event):self.error=int(event.contents.error_code);return 0
        self.handler=handler(error);self.lib.XSetErrorHandler.argtypes=[handler];self.lib.XSetErrorHandler.restype=C.c_void_p
        self.lib.XSetErrorHandler(self.handler)
        self.display=self.lib.XOpenDisplay(os.environ['DISPLAY'].encode());require(bool(self.display),'native-query')
        self.root=int(self.lib.XDefaultRootWindow(self.display));self.fd=self.lib.XConnectionNumber(self.display)
        names=('CARDINAL','WINDOW','STRING','WM_CLASS','_NET_WM_PID','_NET_CLIENT_LIST','_NET_FRAME_EXTENTS','_NET_NUMBER_OF_DESKTOPS','_NET_CURRENT_DESKTOP','_NET_WORKAREA','_NET_DESKTOP_VIEWPORT','_NET_ACTIVE_WINDOW')
        self.atoms={name:int(self.lib.XInternAtom(self.display,name.encode(),1)) for name in names}
        # These two optional geometry capabilities may be absent on a bare
        # private KWin session. Identity/lifetime properties remain mandatory.
        require(all(self.atoms[name] for name in names if name not in ('_NET_FRAME_EXTENTS','_NET_WORKAREA')),'native-query')
    def checked(self,call):
        self.error=None;result=call();self.lib.XSync(self.display,0)
        if self.error==3:raise MissingWindow()
        require(self.error is None,'native-query');return result
    def property(self,window,name,type_,fmt,maximum,exact=None,optional=False):
        if optional and not self.atoms[name]:return None
        require(bool(self.atoms[name]),'native-query')
        actual=C.c_ulong();format_=C.c_int();count=C.c_ulong();remaining=C.c_ulong();data=C.c_void_p()
        try:
            result=self.checked(lambda:self.lib.XGetWindowProperty(self.display,window,self.atoms[name],0,maximum if fmt==32 else (maximum+3)//4,0,self.atoms[type_],C.byref(actual),C.byref(format_),C.byref(count),C.byref(remaining),C.byref(data)))
            require(result==0,'native-query')
            if optional and actual.value==0 and format_.value==0 and count.value==0 and remaining.value==0 and not data:return None
            return decode_property(actual.value,format_.value,count.value,remaining.value,data,self.atoms[type_],fmt,maximum,exact)
        finally:
            if data:self.lib.XFree(data)
    def watch(self,window):self.checked(lambda:self.lib.XSelectInput(self.display,window,self.MASK))
    def events(self,window):
        result=[]
        for _ in range(64):
            if not self.lib.XPending(self.display):return result
            event=Event();self.lib.XNextEvent(self.display,C.byref(event))
            if event.type==17:
                require(event.destroy.window==window,'lifetime');result.append('destroy')
            elif event.type==28:
                require(event.property.window==window,'lifetime')
                if event.property.atom in (self.atoms['WM_CLASS'],self.atoms['_NET_WM_PID']):result.append('identity-change')
            elif event.type not in (18,19,21,22,24,26):raise Rejected('lifetime')
        require(not self.lib.XPending(self.display),'overflow');return result
    def pid(self,window):return self.property(window,'_NET_WM_PID','CARDINAL',32,1,1)[0]
    def class_(self,window):return self.property(window,'WM_CLASS','STRING',8,256)
    def clients(self):return self.property(self.root,'_NET_CLIENT_LIST','WINDOW',32,128)
    def geometry(self,window,allow_unavailable=False):
        attributes=Attributes();require(self.checked(lambda:self.lib.XGetWindowAttributes(self.display,window,C.byref(attributes)))!=0,'native-query')
        require(attributes.root==self.root and attributes.class_==1 and attributes.override_redirect==0 and attributes.border_width==0 and attributes.map_state in (0,1,2),'native-query')
        require(0<attributes.width<=65536 and 0<attributes.height<=65536,'native-query')
        extents=self.property(window,'_NET_FRAME_EXTENTS','CARDINAL',32,4,4,optional=allow_unavailable)
        if extents is not None:require(all(number<=65536 for number in extents),'native-query')
        x=C.c_int();y=C.c_int();child=C.c_ulong()
        require(self.checked(lambda:self.lib.XTranslateCoordinates(self.display,window,self.root,0,0,C.byref(x),C.byref(y),C.byref(child)))!=0,'native-query')
        require(abs(x.value)<=65536 and abs(y.value)<=65536,'native-query')
        frame=None
        if extents is not None:
            left,right,top,bottom=extents
            frame={'x':x.value-left,'y':y.value-top,'width':attributes.width+left+right,'height':attributes.height+top+bottom}
        desktops=self.property(self.root,'_NET_NUMBER_OF_DESKTOPS','CARDINAL',32,1,1)[0];require(1<=desktops<=64,'native-query')
        current=self.property(self.root,'_NET_CURRENT_DESKTOP','CARDINAL',32,1,1)[0];require(current<desktops,'native-query')
        viewport=self.property(self.root,'_NET_DESKTOP_VIEWPORT','CARDINAL',32,128,2*desktops);require(viewport[2*current:2*current+2]==[0,0],'native-query')
        areas=self.property(self.root,'_NET_WORKAREA','CARDINAL',32,256,4*desktops,optional=allow_unavailable)
        area=None if areas is None else dict(zip(('x','y','width','height'),areas[4*current:4*current+4]))
        for rectangle in (frame,area):
            if rectangle is None:continue
            require(all(type(v) is int and abs(v)<=65536 for v in rectangle.values()) and rectangle['width']>0 and rectangle['height']>0,'native-query')
        active=self.property(self.root,'_NET_ACTIVE_WINDOW','WINDOW',32,1,1)[0];require(0<=active<=0x1fffffff,'native-query')
        return frame,area,attributes.map_state!=2,active==window
    def close(self):self.lib.XCloseDisplay(self.display)

def process_status(pid):
    file=pathlib.Path('/proc')/str(pid)/'status'
    with file.open('rb') as stream:data=stream.read(16385)
    require(len(data)<=16384,'lifetime');rows=data.decode('ascii').splitlines()
    uid=next((line.split()[1:] for line in rows if line.startswith('Uid:')),[])
    parent=next((line.split()[1:] for line in rows if line.startswith('PPid:')),[])
    require(len(uid)==4 and all(item.isdecimal() and int(item)==os.getuid() for item in uid) and len(parent)==1 and parent[0].isdecimal(),'lifetime')
    return int(parent[0])
class ProcessLease:
    def __init__(self,pid):
        # Retain the original task before following any numeric /proc path.
        # A replacement encountered during ancestry cannot revive this pidfd.
        self.fd=os.pidfd_open(pid,0)
        try:
            require(self.alive(),'lifetime')
            current=pid
            for _ in range(32):
                if current==os.getppid():break
                require(current>1,'lifetime');current=process_status(current)
            else:raise Rejected('lifetime')
            require(self.alive(),'lifetime')
        except BaseException:
            os.close(self.fd)
            raise
    def alive(self):
        poll=select.poll();poll.register(self.fd,select.POLLIN|select.POLLERR|select.POLLHUP);return not poll.poll(0)
    def close(self):os.close(self.fd)

def empty():return {'count':0,'identityMatches':False,'nativeBackend':'unsupported','focused':False,'hidden':True,'geometry':None,'workArea':None}
class Target:
    def __init__(self,x,lease_factory=ProcessLease):
        self.x=x;self.lease_factory=lease_factory;self.bound=False;self.retired=False;self.invalid=False;self.managed=False;self.last=0;self.lease=None
    def identity(self):
        require(self.lease.alive(),'lifetime')
        require(self.x.pid(self.xid)==self.pid,'identity')
        require(self.x.class_(self.xid)==(APP_ID.lower()+'\0'+APP_ID+'\0').encode('ascii'),'identity')
    def events(self):
        values=self.x.events(self.xid)
        if 'identity-change' in values:raise Rejected('lifetime')
        if 'destroy' in values:self.invalid=True
    def bind(self,value):
        keys(value,('command','generation','nonce','pid','xid'));require(value['command']=='bind' and not self.bound,'binding')
        self.generation=integer(value['generation'],1,2);self.pid=integer(value['pid'],2,4194304);self.xid=integer(value['xid'],1,0x1fffffff)
        require(type(value['nonce']) is str and re.fullmatch('[0-9a-f]{64}',value['nonce']),'binding');self.nonce=value['nonce']
        self.lease=self.lease_factory(self.pid);self.identity();self.x.watch(self.xid);self.events();require(not self.invalid,'lifetime');self.identity()
        self.bound=True;return {'bound':True}
    def command(self,value):
        require(self.bound and type(value) is dict,'binding')
        require(value.get('generation')==self.generation and type(value.get('generation')) is int and value.get('nonce')==self.nonce,'binding')
        operation=value.get('command')
        if operation=='retire':
            keys(value,('command','generation','nonce','exitCode'));require(value['exitCode']==0 and type(value['exitCode']) is int and not self.retired and not self.lease.alive(),'lifetime')
            self.retired=True;return {'retired':True}
        keys(value,('command','generation','nonce','request'));require(operation=='observe')
        request=integer(value['request'],1,1000);require(request>self.last,'binding');self.last=request
        self.events()
        if self.retired:
            require(not self.lease.alive(),'lifetime')
            try:self.x.pid(self.xid)
            except MissingWindow:require(self.xid not in self.x.clients(),'lifetime')
            else:raise Rejected('lifetime')
            launcher=empty()
        else:
            require(not self.invalid,'lifetime');self.identity()
            require(self.managed or self.xid in self.x.clients(),'native-query')
            frame,area,hidden,focused=self.x.geometry(self.xid,allow_unavailable=True)
            require(self.managed or not hidden,'native-query');self.managed=True
            self.events();require(not self.invalid,'lifetime');self.identity()
            launcher={'count':1,'identityMatches':True,'nativeBackend':'x11','focused':focused,'hidden':hidden,'geometry':frame,'workArea':area}
        return {'request':request,'launcher':launcher,'decoy':empty(),'decoyActivationIssued':False}
    def close(self):
        if self.lease:self.lease.close()

def main():
    require(sys.argv[1:]==['--kwin-x11-lifecycle-only'],'guard');target_guard()
    private_root(os.environ.get('LINUXCAST_S001_MATRIX_ROOT',''),'kwin-x11',driver=True)
    require(os.environ.get('LINUXCAST_S001_BACKEND')=='kwin-x11','guard')
    x=Xlib();target=Target(x);selector=selectors.DefaultSelector();selector.register(sys.stdin.fileno(),selectors.EVENT_READ,'control');selector.register(x.fd,selectors.EVENT_READ,'native');buffer=b''
    try:
        while True:
            for key,_ in selector.select():
                if key.data=='native':
                    if target.bound:target.events()
                    else:raise Rejected('binding')
                else:
                    chunk=os.read(sys.stdin.fileno(),4096)
                    if not chunk:return 0
                    buffer+=chunk;require(len(buffer)<=4096,'overflow')
                    while b'\n' in buffer:
                        line,buffer=buffer.split(b'\n',1);value=json.loads(line.decode('utf8'),object_pairs_hook=unique)
                        if type(value) is dict and value.get('command')=='close':
                            keys(value,('command','generation','nonce'));require(target.bound and value['generation']==target.generation and type(value['generation']) is int and value['nonce']==target.nonce,'binding')
                            print('{"closed":true}',flush=True);return 0
                        reply=target.bind(value) if not target.bound else target.command(value)
                        encoded=json.dumps(reply,separators=(',',':'));require(len(encoded.encode())<=8192,'overflow');print(encoded,flush=True)
    finally:selector.close();target.close();x.close()

if __name__=='__main__':
    try:sys.exit(main())
    except Rejected as error:print(json.dumps({'failure':error.kind}),flush=True);sys.exit(3)
    except (Exception,KeyboardInterrupt):print('{"failure":"native-query"}',flush=True);sys.exit(3)
