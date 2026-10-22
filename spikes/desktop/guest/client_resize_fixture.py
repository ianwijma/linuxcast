"""No-display tests for the disposable window's single resize request."""
import copy
import contextlib
import os

from client_resize import AckTrigger, Reader, Writer, evaluate, parse_control, parse_adapter


@contextlib.contextmanager
def stdin_end(descriptor):
    saved = os.dup(0)
    os.dup2(descriptor, 0)
    os.close(descriptor)
    try:
        yield
    finally:
        os.dup2(saved, 0)
        os.close(saved)


def initial():
    return dict(clientWidth=327, clientHeight=160, maximized=False,
                fullscreen=False, iconified=False, resizable=True)


def reader_cases():
    for case in ('normal', 'duplicate-before', 'duplicate-after', 'wrong', 'eof', 'state', 'callback'):
        read, write = os.pipe2(os.O_CLOEXEC | os.O_NONBLOCK)
        calls = []
        state = initial()
        if case == 'state': state['maximized'] = True
        def resize(width, height):
            calls.append((width, height))
            if case == 'callback': raise ValueError('synthetic-private-canary')
        try:
            with stdin_end(read):
                reader = Reader(lambda: (state, 2), resize)
                assert reader.ready() is True  # Nonblocking wait does not resize.
                assert not calls
                if case == 'eof':
                    os.close(write); write = None
                else:
                    os.write(write, b'RR' if case == 'duplicate-before' else b'X' if case == 'wrong' else b'R')
                keep = reader.ready()
                if case in ('normal', 'duplicate-after'):
                    assert keep and calls == [(400, 203)]
                    if case == 'duplicate-after':
                        os.write(write, b'R')
                        assert reader.ready() is False and reader.failed
                        assert calls == [(400, 203)]
                    else:
                        os.close(write); write = None
                        assert reader.ready() is False and not reader.failed
                        assert reader.value['requestPipeClosed']
                else:
                    assert keep is False and reader.failed
                    assert len(calls) == (1 if case == 'callback' else 0)
                assert parse_control(reader.value) is not None
                assert 'synthetic-private-canary' not in str(reader.value)
                reader.close()
        finally:
            if write is not None: os.close(write)


def writer_and_ack_cases():
    read, write = os.pipe2(os.O_CLOEXEC | os.O_NONBLOCK)
    try:
        with stdin_end(write):
            writer = Writer()
            trigger = AckTrigger(writer)
            request = dict(protocolVersion=1, backend='kwin6.3')
            trigger.after_reply('Handshake', request, dict(protocolVersion=1, generation=7))
            command = dict(id='7-1', generation=7, expires=1000, operation='geometry',
                           handle=dict(session='public', instance='public', generation=7, id='public'))
            trigger.after_reply('NextCommand', dict(protocolVersion=1, generation=7),
                                dict(kind='command', command=command, expiresInMs=1000))
            assert not writer.sent
            ack = dict(protocolVersion=1, generation=7, id='7-1', outcome='ok')
            trigger.after_reply('Ack', ack, dict(kind='ack'))
            assert writer.sent and writer.closed and os.read(read, 8) == b'R'
            for action in (lambda: writer.send_once(),
                           lambda: trigger.after_reply('Ack', ack, dict(kind='ack'))):
                try: action()
                except ValueError: pass
                else: raise AssertionError('DUPLICATE_RESIZE_ACCEPTED')
            assert os.read(read, 8) == b''
    finally:
        os.close(read)
    for request in (dict(protocolVersion=True, backend='kwin6.3'),
                    dict(protocolVersion=1, backend='other'),
                    dict(protocolVersion=1, backend='kwin6.3', private='synthetic-private-canary')):
        class Counter:
            count = 0
            def send_once(self): self.count += 1
        counter = Counter()
        try: AckTrigger(counter).after_reply('Handshake', request, dict(protocolVersion=1, generation=7))
        except ValueError: pass
        else: raise AssertionError('INVALID_HANDSHAKE_ACCEPTED')
        assert counter.count == 0


def report_cases():
    control = dict(resizeAttemptCount=1, requestedClientSize=dict(width=400, height=203),
                   initialClient=initial(), configureCountAtRequest=1,
                   requestPipeClosed=True, state='requested', reason='FIXED_REQUEST_APPLIED')
    before = dict(initial(), width=379, height=249)
    after = dict(before, clientWidth=400, clientHeight=203, width=452, height=292)
    client = dict(ownConfigureEvents=[before, after], clientResizeControl=control)
    first = dict(x=476, y=261, width=327, height=197)
    final = dict(first, width=400, height=240)
    adapter = dict(kind='diagnostic', state='diagnostic', diagnosticStatus='OWN_CLIENT_RESIZE_GEOMETRY_READY',
                   kindEvidence='own-client-resize-not-placement-or-clipboard-acceptance',
                   nativePlacementAttempted=False, placementAcceptanceEstablished=False,
                   clipboardAcceptanceEstablished=False, normalClipboardTouched=False,
                   nativeGeometryChanged=True, pollingStopped=True, observations=[first, first, final],
                   requested=None, transportAckCount=3, outcomes=['ok'] * 3,
                   terminalReason='COMPANION_RESTARTED')
    assert evaluate(adapter, client)[0]
    for case in ('wrong-client', 'early-configure', 'wrong-frame', 'unchanged', 'not-stopped',
                 'placement', 'private-client', 'private-adapter', 'duplicate-count', 'open-pipe'):
        a = copy.deepcopy(adapter); c = copy.deepcopy(client)
        if case == 'wrong-client': c['ownConfigureEvents'][-1]['clientWidth'] = 399
        elif case == 'early-configure': c['clientResizeControl']['configureCountAtRequest'] = 2
        elif case == 'wrong-frame': a['observations'][-1]['height'] = 239
        elif case == 'unchanged': a['observations'][-1] = first
        elif case == 'not-stopped': a['pollingStopped'] = False
        elif case == 'placement': a['nativePlacementAttempted'] = True
        elif case == 'private-client': c['clientResizeControl']['private'] = 'synthetic-private-canary'
        elif case == 'private-adapter': a['private'] = 'synthetic-private-canary'
        elif case == 'duplicate-count': c['clientResizeControl']['resizeAttemptCount'] = 2
        elif case == 'open-pipe': c['clientResizeControl']['requestPipeClosed'] = False
        assert not evaluate(a, c)[0], case
    assert parse_adapter(dict(adapter, requested='synthetic-private-canary')) is None


if __name__ == '__main__':
    before = len(os.listdir('/proc/self/fd'))
    reader_cases()
    writer_and_ack_cases()
    report_cases()
    assert len(os.listdir('/proc/self/fd')) == before
    print('own-window-single-resize-fixture-passed')
