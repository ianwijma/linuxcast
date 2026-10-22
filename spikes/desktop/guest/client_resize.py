"""Private one-byte own-client diagnostic; no caller FD/path or native authority."""
import fcntl
import math
import os
import re
import stat

TARGET = {'width': 400, 'height': 203}
STATE_KEYS = {'clientWidth', 'clientHeight', 'maximized', 'fullscreen', 'iconified', 'resizable'}
EVENT_KEYS = STATE_KEYS | {'width', 'height'}
CONTROL_KEYS = {'resizeAttemptCount', 'requestedClientSize', 'initialClient', 'configureCountAtRequest',
                'requestPipeClosed', 'state', 'reason'}
REASONS = {'WAITING_FOR_FIXED_REQUEST', 'FIXED_REQUEST_APPLIED', 'FIXED_PIPE_PROTOCOL_FAILURE',
           'OWN_CLIENT_STATE_REJECTED', 'OWN_CLIENT_RESIZE_CALLBACK_FAILED'}


def own_state(value):
    return (isinstance(value, dict) and set(value) == STATE_KEYS
            and all(type(value[k]) is int and 0 < value[k] <= 16384 for k in ('clientWidth', 'clientHeight'))
            and all(type(value[k]) is bool for k in ('maximized', 'fullscreen', 'iconified', 'resizable')))


def normal(value):
    return own_state(value) and value['resizable'] and not any(value[k] for k in ('maximized', 'fullscreen', 'iconified'))


def configure_events(value):
    return (isinstance(value, list) and 1 <= len(value) <= 8
            and all(isinstance(item, dict) and set(item) == EVENT_KEYS
                    and own_state({key: item[key] for key in STATE_KEYS})
                    and all(type(item[k]) is int and 0 < item[k] <= 16384 for k in ('width', 'height')) for item in value))


def parse_control(value):
    if not isinstance(value, dict) or set(value) != CONTROL_KEYS: return None
    if type(value['resizeAttemptCount']) is not int or value['resizeAttemptCount'] not in (0, 1): return None
    target = value['requestedClientSize']
    if not isinstance(target, dict) or set(target) != set(TARGET) or any(type(target[k]) is not int or target[k] != TARGET[k] for k in TARGET): return None
    if type(value['requestPipeClosed']) is not bool or value['state'] not in ('waiting', 'requested', 'rejected'): return None
    if not isinstance(value['reason'], str) or value['reason'] not in REASONS: return None
    initial = value['initialClient']; count = value['configureCountAtRequest']
    if initial is not None and not own_state(initial): return None
    if count is not None and (type(count) is not int or not 0 <= count <= 8): return None
    if value['state'] == 'waiting' and (value['resizeAttemptCount'] != 0 or initial is not None or count is not None
                                      or value['requestPipeClosed'] or value['reason'] != 'WAITING_FOR_FIXED_REQUEST'): return None
    if value['state'] == 'requested' and (value['resizeAttemptCount'] != 1 or not normal(initial)
                                        or count is None or value['reason'] != 'FIXED_REQUEST_APPLIED'): return None
    if value['state'] == 'rejected' and value['reason'] not in REASONS - {'WAITING_FOR_FIXED_REQUEST', 'FIXED_REQUEST_APPLIED'}: return None
    return value


def stdin_pipe(direction):
    # Fixed fd0 only, inherited by Popen(stdin=owned_end). No --fd, path or
    # environment-selected descriptor. Reject regular files, sockets, named
    # FIFOs and the wrong direction before any write or GTK resize callback.
    flags = fcntl.fcntl(0, fcntl.F_GETFL)
    required = os.O_RDONLY if direction == 'read' else os.O_WRONLY
    if (not stat.S_ISFIFO(os.fstat(0).st_mode) or not re.fullmatch(r'pipe:\[[0-9]+\]', os.readlink('/proc/self/fd/0'))
            or flags & os.O_ACCMODE != required or not flags & os.O_NONBLOCK):
        raise ValueError('OWN_ANONYMOUS_PIPE_REQUIRED')


class Writer:
    def __init__(self):
        stdin_pipe('write')
        self.closed = False
        self.sent = False

    def send_once(self):
        if self.sent or self.closed: raise ValueError('RESIZE_REQUEST_REPLAYED')
        self.sent = True
        try:
            if os.write(0, b'R') != 1: raise ValueError('FIXED_PIPE_WRITE_FAILED')
        finally:
            self.close()

    def close(self):
        if not self.closed:
            self.closed = True
            os.close(0)


class AckTrigger:
    """Called only after the Gio reply to an authenticated native invocation."""
    def __init__(self, writer):
        self.writer = writer
        self.generation = None
        self.pending = None
        self.acknowledged = set()

    def after_reply(self, name, request, reply):
        if name == 'Handshake':
            if (self.generation is not None or not isinstance(request, dict)
                    or request != {'protocolVersion': 1, 'backend': 'kwin6.3'}
                    or type(request['protocolVersion']) is not int
                    or not isinstance(reply, dict) or set(reply) != {'protocolVersion', 'generation'}
                    or type(reply['protocolVersion']) is not int or reply['protocolVersion'] != 1 or type(reply['generation']) is not int or reply['generation'] <= 0):
                raise ValueError('RESIZE_HANDSHAKE_REJECTED')
            self.generation = reply['generation']
        elif name == 'NextCommand' and isinstance(reply, dict) and reply.get('kind') == 'command':
            command = reply.get('command')
            if (self.pending is not None or self.generation is None or not isinstance(command, dict)
                    or set(reply) != {'kind', 'command', 'expiresInMs'}
                    or set(command) != {'id', 'generation', 'expires', 'operation', 'handle'}
                    or request != {'protocolVersion': 1, 'generation': self.generation}
                    or type(request['protocolVersion']) is not int or type(request['generation']) is not int
                    or command.get('operation') != 'geometry' or type(command.get('generation')) is not int or command['generation'] != self.generation
                    or not isinstance(command.get('id'), str) or not re.fullmatch(r'[1-9][0-9]*-[1-9][0-9]*', command['id'])
                    or len(command['id']) > 40 or command['id'] in self.acknowledged):
                raise ValueError('RESIZE_COMMAND_REJECTED')
            self.pending = command['id']
        elif name == 'Ack':
            if (not isinstance(request, dict) or set(request) != {'protocolVersion', 'generation', 'id', 'outcome'}
                    or type(request['protocolVersion']) is not int or request['protocolVersion'] != 1 or type(request['generation']) is not int or request['generation'] != self.generation
                    or self.pending is None or request['id'] != self.pending or request['outcome'] != 'ok' or reply != {'kind': 'ack'}
                    or len(self.acknowledged) >= 3):
                raise ValueError('RESIZE_ACK_REJECTED')
            self.acknowledged.add(self.pending); self.pending = None
            if len(self.acknowledged) == 1: self.writer.send_once()


class Reader:
    def __init__(self, snapshot, resize):
        stdin_pipe('read')
        self.snapshot = snapshot
        self.resize = resize
        self.closed = False
        self.failed = False
        self.value = {'resizeAttemptCount': 0, 'requestedClientSize': dict(TARGET), 'initialClient': None,
                      'configureCountAtRequest': None, 'requestPipeClosed': False,
                      'state': 'waiting', 'reason': 'WAITING_FOR_FIXED_REQUEST'}

    def close(self):
        if not self.closed:
            self.closed = True
            os.close(0)
        self.value['requestPipeClosed'] = True

    def reject(self, reason):
        self.failed = True
        self.value.update(state='rejected', reason=reason)
        self.close()
        return False

    def ready(self):
        if self.closed: return False
        try: byte = os.read(0, 2)
        except BlockingIOError: return True
        except OSError: return self.reject('FIXED_PIPE_PROTOCOL_FAILURE')
        if not byte:
            if self.value['resizeAttemptCount'] != 1: return self.reject('FIXED_PIPE_PROTOCOL_FAILURE')
            self.close(); return False
        if byte != b'R' or self.value['resizeAttemptCount']:
            return self.reject('FIXED_PIPE_PROTOCOL_FAILURE')
        try:
            initial, count = self.snapshot()
            if not normal(initial) or type(count) is not int or not 0 <= count <= 8:
                return self.reject('OWN_CLIENT_STATE_REJECTED')
            self.value.update(initialClient=initial, configureCountAtRequest=count, resizeAttemptCount=1,
                              state='requested', reason='FIXED_REQUEST_APPLIED')
            self.resize(TARGET['width'], TARGET['height'])
        except Exception:
            return self.reject('OWN_CLIENT_RESIZE_CALLBACK_FAILED')
        return True


def control_progress(value):
    if not isinstance(value, dict) or set(value) != {'ownConfigureEvents', 'clientResizeControl'}: return None
    if not configure_events(value['ownConfigureEvents']) or parse_control(value['clientResizeControl']) is None: return None
    return value


def rect(value):
    return (isinstance(value, dict) and set(value) == {'x', 'y', 'width', 'height'}
            and all(type(v) in (int, float) and math.isfinite(v) and abs(v) <= 1000000 for v in value.values())
            and value['width'] > 0 and value['height'] > 0)


def parse_adapter(adapter):
    keys = {'kind', 'state', 'diagnosticStatus', 'kindEvidence', 'nativePlacementAttempted', 'placementAcceptanceEstablished',
            'clipboardAcceptanceEstablished', 'nativeGeometryChanged', 'pollingStopped', 'observations', 'requested',
            'transportAckCount', 'outcomes', 'terminalReason', 'normalClipboardTouched'}
    if (not isinstance(adapter, dict) or set(adapter) != keys or adapter['kind'] != 'diagnostic' or adapter['state'] != 'diagnostic'
            or adapter['diagnosticStatus'] not in ('OWN_CLIENT_RESIZE_GEOMETRY_READY', 'OWN_CLIENT_RESIZE_GEOMETRY_FAILED')
            or adapter['kindEvidence'] != 'own-client-resize-not-placement-or-clipboard-acceptance'
            or any(type(adapter[key]) is not bool for key in ('nativePlacementAttempted', 'placementAcceptanceEstablished', 'clipboardAcceptanceEstablished', 'normalClipboardTouched', 'nativeGeometryChanged', 'pollingStopped'))
            or (adapter['requested'] is not None and not rect(adapter['requested']))
            or type(adapter['transportAckCount']) is not int or not 0 <= adapter['transportAckCount'] <= 3
            or not isinstance(adapter['outcomes'], list) or len(adapter['outcomes']) != adapter['transportAckCount']
            or any(outcome not in ('ok', 'denied', 'expired', 'failed') for outcome in adapter['outcomes'])
            or adapter['terminalReason'] not in ('COMPANION_RESTARTED', 'COMPANION_DBUS_TIMEOUT', 'COMPANION_PROTOCOL_FAILURE')
            or not isinstance(adapter['observations'], list) or len(adapter['observations']) > 3 or not all(rect(item) for item in adapter['observations'])): return None
    return adapter


def evaluate(adapter, client):
    checks = {'resizeAttemptCount': 0, 'clientConfigureMatched': False, 'nativeFrameSizeMatched': False, 'geometryChanged': False}
    if control_progress(client) is None: return False, checks
    control = client['clientResizeControl']; checks['resizeAttemptCount'] = control['resizeAttemptCount']
    if (parse_adapter(adapter) is None or adapter['diagnosticStatus'] != 'OWN_CLIENT_RESIZE_GEOMETRY_READY'
            or any(adapter[key] is not False for key in ('nativePlacementAttempted', 'placementAcceptanceEstablished', 'clipboardAcceptanceEstablished', 'normalClipboardTouched'))
            or adapter['nativeGeometryChanged'] is not True or adapter['pollingStopped'] is not True or adapter['requested'] is not None
            or adapter['transportAckCount'] != 3 or adapter['outcomes'] != ['ok'] * 3
            or adapter['terminalReason'] != 'COMPANION_RESTARTED' or len(adapter['observations']) != 3): return False, checks
    if control['state'] != 'requested' or not control['requestPipeClosed']: return False, checks
    initial = control['initialClient']; events = client['ownConfigureEvents']
    checks['clientConfigureMatched'] = any(event['clientWidth'] == TARGET['width'] and event['clientHeight'] == TARGET['height']
                                           and normal({k: event[k] for k in STATE_KEYS})
                                           for event in events[control['configureCountAtRequest']:])
    first, _, final = adapter['observations']
    checks['geometryChanged'] = first['width'] != final['width'] or first['height'] != final['height']
    changed = initial['clientWidth'] != TARGET['width'] or initial['clientHeight'] != TARGET['height']
    border_width = first['width'] - initial['clientWidth']; border_height = first['height'] - initial['clientHeight']
    checks['nativeFrameSizeMatched'] = (border_width >= 0 and border_height >= 0
                                        and final['width'] == TARGET['width'] + border_width
                                        and final['height'] == TARGET['height'] + border_height)
    return changed and all(checks[k] for k in ('clientConfigureMatched', 'nativeFrameSizeMatched', 'geometryChanged')), checks
