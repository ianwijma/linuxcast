"""Bounded own-process/control-wire observation after the KWin loop has stopped."""
import time

QUIET_SECONDS = 5.0
METHOD_COUNTS = {'CanaryContext': 1, 'Handshake': 1, 'NextCommand': 4, 'Ack': 3, 'CanaryObservation': 1}


def quiescent_wire(value):
    if not isinstance(value, dict) or set(value) != {'authenticatedRequests', 'replies', 'nodeExited'}: return False
    if value['nodeExited'] is not False: return False
    for key in ('authenticatedRequests', 'replies'):
        counts = value[key]
        if not isinstance(counts, dict) or set(counts) != set(METHOD_COUNTS): return False
        if any(type(counts[name]) is not int or counts[name] != expected for name, expected in METHOD_COUNTS.items()): return False
    return True


def observe_post_stop(processes, read_wire, clock=time.monotonic, pause=time.sleep):
    # No D-Bus request is issued or held here. Both comparison scenarios use
    # this same fixed interval only after their explicit end-of-loop report.
    started = clock()
    value = {'seconds': QUIET_SECONDS, 'completed': False, 'allOwnProcessesAlive': False,
             'controlTrafficStable': False, 'reason': 'POST_STOP_PROTOCOL_NOT_QUIESCENT'}
    if len(processes) != 3:
        value['reason'] = 'OWN_PROCESS_SET_REQUIRED'
        return value
    if not quiescent_wire(read_wire()): return value
    value['controlTrafficStable'] = True
    while True:
        if any(child.poll() is not None for child in processes):
            value['allOwnProcessesAlive'] = False
            value['reason'] = 'OWN_PROCESS_EXITED_AFTER_STOP'
            return value
        value['allOwnProcessesAlive'] = True
        if not quiescent_wire(read_wire()):
            value['controlTrafficStable'] = False
            value['reason'] = 'CONTROL_TRAFFIC_CHANGED_AFTER_STOP'
            return value
        remaining = QUIET_SECONDS - (clock() - started)
        if remaining <= 0:
            value.update(completed=True, reason='POST_STOP_QUIET_COMPLETE')
            return value
        pause(min(0.1, remaining))
