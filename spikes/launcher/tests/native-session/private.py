"""Private harness guard/schema; never a production authorization endpoint."""
import json
import os
import pathlib
import re
import stat
import sys

BACKENDS=('gnome-wayland','gnome-x11','kwin-wayland','kwin-x11')
DIRECTORIES={'HOME':'home','XDG_CONFIG_HOME':'config','XDG_DATA_HOME':'data','XDG_CACHE_HOME':'cache','XDG_RUNTIME_DIR':'runtime'}
FORBIDDEN=('DBUS_STARTER_ADDRESS','DBUS_STARTER_BUS_TYPE','DBUS_SYSTEM_BUS_ADDRESS','GSETTINGS_SCHEMA_DIR','DCONF_PROFILE','GIO_EXTRA_MODULES','GI_TYPELIB_PATH','LD_PRELOAD','LD_LIBRARY_PATH','PYTHONPATH','PYTHONHOME','NODE_OPTIONS','NODE_PATH','GTK_MODULES','GTK_PATH','QT_PLUGIN_PATH','QT_QPA_PLATFORM_PLUGIN_PATH','SESSION_MANAGER','AT_SPI_BUS_ADDRESS','SPEECHD_ADDRESS')
ALLOWED=set(DIRECTORIES)|set(('PATH','LANG','LC_ALL','TMPDIR','GSETTINGS_BACKEND','XDG_DATA_DIRS','XDG_CONFIG_DIRS',
    'LINUXCAST_S001_PRIVATE_MATRIX','LINUXCAST_S001_MATRIX_ROOT','LINUXCAST_S001_NODE','LINUXCAST_S001_BACKEND',
    'DBUS_SESSION_BUS_ADDRESS','DISPLAY','XAUTHORITY','WAYLAND_DISPLAY','XDG_SESSION_TYPE','GDK_BACKEND','LIBGL_ALWAYS_SOFTWARE','QT_QUICK_BACKEND','PWD'))

def guest_allowed(release,uid,input_marker):
    lines=release.splitlines()
    return uid!=0 and 'ID=debian' in lines and 'VERSION_ID="13"' in lines and not input_marker

def target_guard():
    if os.geteuid()==0 or not guest_allowed(pathlib.Path('/etc/os-release').read_text(),os.getuid(),pathlib.Path('/run/linuxcast-input-spike-lab').exists()):
        raise ValueError('EXPLICIT_DISPOSABLE_DEBIAN13_USER_REQUIRED')

def directory(path,uid):
    if not path.is_absolute() or path!=path.resolve(strict=True): raise ValueError('PRIVATE_CANONICAL_DIRECTORY_REQUIRED')
    metadata=path.lstat()
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid!=uid or stat.S_IMODE(metadata.st_mode)!=0o700:
        raise ValueError('PRIVATE_OWNED_DIRECTORY_REQUIRED')

def private_root(value,backend,env=None,uid=None,driver=False):
    env=os.environ if env is None else env
    uid=os.getuid() if uid is None else uid
    root=pathlib.Path(value)
    base=pathlib.Path(env.get('TMPDIR','/tmp'))
    if not base.is_absolute() or base!=base.resolve(strict=True) or backend not in BACKENDS or root.parent!=base or not re.fullmatch(r'linuxcast-s001-matrix-[A-Za-z0-9_-]{6,64}',root.name):
        raise ValueError('PRIVATE_MATRIX_ROOT_REQUIRED')
    directory(root,uid)
    if env.get('LINUXCAST_S001_PRIVATE_MATRIX')!='1' or env.get('LINUXCAST_S001_MATRIX_ROOT')!=str(root): raise ValueError('PRIVATE_MATRIX_ENV_REQUIRED')
    for key,name in DIRECTORIES.items():
        expected=root/name
        if env.get(key)!=str(expected): raise ValueError('PRIVATE_XDG_REQUIRED')
        directory(expected,uid)
    if env.get('GSETTINGS_BACKEND')!='keyfile' or env.get('XDG_DATA_DIRS')!='/usr/local/share:/usr/share' or env.get('XDG_CONFIG_DIRS')!='/etc/xdg':
        raise ValueError('PRIVATE_SETTINGS_REQUIRED')
    if any(key in env for key in FORBIDDEN) or any(key not in ALLOWED for key in env): raise ValueError('PRIVATE_ENV_OVERRIDE_REJECTED')
    if env.get('PATH')!='/usr/bin:/bin': raise ValueError('PRIVATE_EXECUTABLE_SEARCH_REQUIRED')
    if env.get('PWD') is not None and env['PWD']!=str(pathlib.Path.cwd().resolve()): raise ValueError('PRIVATE_WRAPPER_CWD_REQUIRED')
    if env.get('LANG')!='C.UTF-8' or env.get('LC_ALL')!='C.UTF-8': raise ValueError('PRIVATE_LOCALE_REQUIRED')
    match=re.fullmatch(r'unix:path=('+re.escape(str(root))+r'/dbus-session)(?:,guid=[0-9a-f]{32})?',env.get('DBUS_SESSION_BUS_ADDRESS',''))
    if not match: raise ValueError('PRIVATE_SINGLE_BUS_REQUIRED')
    socket=pathlib.Path(match.group(1))
    if socket!=socket.resolve(strict=True): raise ValueError('PRIVATE_BUS_SOCKET_REQUIRED')
    metadata=socket.lstat()
    if not stat.S_ISSOCK(metadata.st_mode) or metadata.st_uid!=uid: raise ValueError('PRIVATE_BUS_SOCKET_REQUIRED')
    if backend.endswith('x11'):
        auth=root/'xauthority'
        if env.get('XAUTHORITY')!=str(auth) or not re.fullmatch(r':[0-9]{2,5}',env.get('DISPLAY','')): raise ValueError('PRIVATE_X11_REQUIRED')
        metadata=auth.lstat()
        if auth!=auth.resolve(strict=True) or not stat.S_ISREG(metadata.st_mode) or metadata.st_uid!=uid or stat.S_IMODE(metadata.st_mode)!=0o600:
            raise ValueError('PRIVATE_XAUTHORITY_REQUIRED')
        if env.get('WAYLAND_DISPLAY'): raise ValueError('INHERITED_WAYLAND_DISPLAY_REJECTED')
    elif env.get('DISPLAY') or env.get('XAUTHORITY'):
        raise ValueError('INHERITED_X11_DISPLAY_REJECTED')
    elif env.get('WAYLAND_DISPLAY')!=(('linuxcast-s001-wayland') if driver else None):
        raise ValueError('PRIVATE_WAYLAND_SOCKET_REQUIRED')
    if driver and env.get('XDG_SESSION_TYPE')!=('wayland' if backend.endswith('wayland') else 'x11'):
        raise ValueError('PRIVATE_SESSION_TYPE_REQUIRED')
    return root

def private_environment(root,node=None):
    env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','LC_ALL':'C.UTF-8','GSETTINGS_BACKEND':'keyfile',
         'XDG_DATA_DIRS':'/usr/local/share:/usr/share','XDG_CONFIG_DIRS':'/etc/xdg',
         'LINUXCAST_S001_PRIVATE_MATRIX':'1','LINUXCAST_S001_MATRIX_ROOT':str(root)}
    if node: env['LINUXCAST_S001_NODE']=node
    # Disk-backed TMPDIR supplied by the coordinator remains a staging root,
    # never a source of inherited settings, loader overrides or service sockets.
    env['TMPDIR']=str(root.parent)
    for key,name in DIRECTORIES.items(): env[key]=str(root/name)
    return env

def read_context(root):
    file=root/'context.json'
    if not file.exists(): return {}
    if file.stat().st_size>4096: raise ValueError('CONTEXT_BOUND')
    value=json.loads(file.read_text())
    if not isinstance(value,dict) or set(value)!=set(('request','pid','decoyPid','operation')): raise ValueError('CONTEXT_SCHEMA')
    if any(type(value[key]) is not int or not 1<value[key]<=4194304 for key in ('pid','decoyPid')) or value['pid']==value['decoyPid']: raise ValueError('CONTEXT_PID')
    if type(value['request']) is not int or not 0<value['request']<=1000 or value['operation'] not in ('observe','activate-decoy'): raise ValueError('CONTEXT_SCHEMA')
    return value

def validate_driver(backend,env):
    target_guard()
    return private_root(env.get('LINUXCAST_S001_MATRIX_ROOT',''),backend,env,driver=True)

if __name__=='__main__':
    try:
        if len(sys.argv)!=3 or sys.argv[1]!='--driver': raise ValueError('PRIVATE_DRIVER_ENTRY_REQUIRED')
        encoded=sys.stdin.read(65537)
        if len(encoded)>65536: raise ValueError('DRIVER_ENV_BOUND')
        env=json.loads(encoded)
        if type(env) is not dict or any(type(key) is not str or type(value) is not str for key,value in env.items()): raise ValueError('DRIVER_ENV_SCHEMA')
        validate_driver(sys.argv[2],env)
        print('PRIVATE_MATRIX_VERIFIED')
    except (ValueError,OSError): sys.exit(3)
