"""Private harness guard/schema, never a production integration endpoint."""
import json
import os
import pathlib
import tempfile

def private_root(value):
    root=pathlib.Path(value)
    base=pathlib.Path(tempfile.gettempdir()).resolve()
    if root!=root.resolve() or root.parent!=base or not root.name.startswith('linuxcast-s001-matrix-'):
        raise ValueError('PRIVATE_MATRIX_ROOT_REQUIRED')
    stat=root.stat()
    if not root.is_dir() or stat.st_uid!=os.getuid() or stat.st_mode & 0o077:
        raise ValueError('PRIVATE_MATRIX_ROOT_REQUIRED')
    if os.environ.get('LINUXCAST_S001_PRIVATE_MATRIX')!='1' or os.environ.get('HOME')!=str(root/'home') or os.environ.get('XDG_RUNTIME_DIR')!=str(root/'runtime'):
        raise ValueError('PRIVATE_MATRIX_ENV_REQUIRED')
    if not os.environ.get('DBUS_SESSION_BUS_ADDRESS','').startswith('unix:path='+str(root)+'/'):
        raise ValueError('PRIVATE_MATRIX_BUS_REQUIRED')
    return root

def read_context(root):
    file=root/'context.json'
    if not file.exists(): return {}
    if file.stat().st_size>4096: raise ValueError('CONTEXT_BOUND')
    value=json.loads(file.read_text())
    if not isinstance(value,dict) or set(value)!=set(('request','pid','decoyPid','operation')):
        raise ValueError('CONTEXT_SCHEMA')
    if any(type(value[key]) is not int or not 1<value[key]<=4194304 for key in ('pid','decoyPid')) or value['pid']==value['decoyPid']:
        raise ValueError('CONTEXT_PID')
    if type(value['request']) is not int or not 0<value['request']<=1000 or value['operation'] not in ('observe','activate-decoy'):
        raise ValueError('CONTEXT_SCHEMA')
    return value
