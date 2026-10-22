"""Private engineering harness guard; never a production authorization endpoint."""
import os
import pathlib
import re
import stat

DIRECTORIES={'HOME':'home','XDG_CONFIG_HOME':'config','XDG_DATA_HOME':'data','XDG_CACHE_HOME':'cache','XDG_RUNTIME_DIR':'runtime'}
FORBIDDEN=('DBUS_STARTER_ADDRESS','DBUS_STARTER_BUS_TYPE','DBUS_SYSTEM_BUS_ADDRESS','GSETTINGS_SCHEMA_DIR','DCONF_PROFILE','GIO_EXTRA_MODULES','GI_TYPELIB_PATH','LD_PRELOAD','LD_LIBRARY_PATH','PYTHONPATH','GTK_MODULES','SESSION_MANAGER')


def guest_allowed(release,uid,input_marker):
    values=release.splitlines()
    return uid!=0 and 'ID=debian' in values and 'VERSION_ID="13"' in values and not input_marker


def directory(path,uid):
    if not path.is_absolute() or path!=path.resolve(strict=True): raise ValueError('PRIVATE_CANONICAL_DIRECTORY_REQUIRED')
    value=path.lstat()
    if not stat.S_ISDIR(value.st_mode) or value.st_uid!=uid or stat.S_IMODE(value.st_mode)!=0o700:
        raise ValueError('PRIVATE_OWNED_DIRECTORY_REQUIRED')


def private_context(value,backend,env=None,uid=None):
    env=os.environ if env is None else env
    uid=os.getuid() if uid is None else uid
    root=pathlib.Path(value)
    if root.parent!=pathlib.Path('/tmp').resolve() or not re.fullmatch(r'linuxcast-s002-[A-Za-z0-9_-]{6,64}',root.name):
        raise ValueError('PRIVATE_ROOT_REQUIRED')
    directory(root,uid)
    if env.get('LINUXCAST_S002_PRIVATE_GUEST')!='1' or env.get('LINUXCAST_S002_RESULT_DIR')!=str(root): raise ValueError('PRIVATE_ENV_REQUIRED')
    for key,name in DIRECTORIES.items():
        expected=root/name
        if env.get(key)!=str(expected): raise ValueError('PRIVATE_XDG_REQUIRED')
        directory(expected,uid)
    if env.get('GSETTINGS_BACKEND')!='keyfile' or env.get('XDG_DATA_DIRS')!='/usr/local/share:/usr/share' or env.get('XDG_CONFIG_DIRS')!='/etc/xdg':
        raise ValueError('PRIVATE_SETTINGS_REQUIRED')
    if any(env.get(name) for name in FORBIDDEN): raise ValueError('PRIVATE_ENV_OVERRIDE_REJECTED')
    match=re.fullmatch(r'unix:path=('+re.escape(str(root))+r'/dbus-[A-Za-z0-9_-]{1,64}),guid=[0-9a-f]{32}',env.get('DBUS_SESSION_BUS_ADDRESS',''))
    if not match: raise ValueError('PRIVATE_SINGLE_BUS_REQUIRED')
    bus=pathlib.Path(match.group(1)); metadata=bus.lstat()
    if not stat.S_ISSOCK(metadata.st_mode) or metadata.st_uid!=uid: raise ValueError('PRIVATE_BUS_SOCKET_REQUIRED')
    if env.get('WAYLAND_DISPLAY'): raise ValueError('INHERITED_WAYLAND_DISPLAY_REJECTED')
    needs_x11=backend.endswith('x11') or backend=='gnome-wayland-nested'
    if needs_x11:
        auth=root/'xauthority'
        if env.get('XAUTHORITY')!=str(auth) or not re.fullmatch(r':[0-9]{2,5}',env.get('DISPLAY','')): raise ValueError('PRIVATE_X11_REQUIRED')
        value=auth.lstat()
        if auth!=auth.resolve(strict=True) or not stat.S_ISREG(value.st_mode) or value.st_uid!=uid or stat.S_IMODE(value.st_mode)!=0o600:
            raise ValueError('PRIVATE_XAUTHORITY_REQUIRED')
    elif env.get('DISPLAY') or env.get('XAUTHORITY'):
        raise ValueError('INHERITED_X11_DISPLAY_REJECTED')
    return root


def private_environment(root,node=None):
    # No inherited service addresses, loader overrides, settings or credentials.
    env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','LC_ALL':'C.UTF-8','GSETTINGS_BACKEND':'keyfile',
         'XDG_DATA_DIRS':'/usr/local/share:/usr/share','XDG_CONFIG_DIRS':'/etc/xdg',
         'LINUXCAST_S002_PRIVATE_GUEST':'1','LINUXCAST_S002_RESULT_DIR':str(root)}
    if node: env['LINUXCAST_S002_NODE']=node
    for key,name in DIRECTORIES.items(): env[key]=str(root/name)
    return env
