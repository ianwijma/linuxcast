"""Harmless local cancellation regression: no desktop, D-Bus, input or clipboard."""
import json
import os
import pathlib
import signal
import subprocess
import sys
import time
from supervision import Supervisor, Cancelled

mode=sys.argv[1]
root=pathlib.Path(sys.argv[2])
if mode=='grandchild':
    signal.signal(signal.SIGTERM,signal.SIG_IGN)
    signal.signal(signal.SIGINT,signal.SIG_IGN)
    (root/'grandchild-ready').touch()
    time.sleep(15)
elif mode=='child':
    signal.signal(signal.SIGTERM,signal.SIG_IGN)
    signal.signal(signal.SIGINT,signal.SIG_IGN)
    grandchild=subprocess.Popen([sys.executable,__file__,'grandchild',str(root)],start_new_session=True)
    deadline=time.monotonic()+2
    while not (root/'grandchild-ready').exists() and time.monotonic()<deadline: time.sleep(0.01)
    (root/'pids.json').write_text(json.dumps([os.getpid(),grandchild.pid]))
    time.sleep(15)
elif mode=='outer':
    try:
        with Supervisor(grace=0.3):
            subprocess.Popen([sys.executable,__file__,'child',str(root)],start_new_session=True)
            deadline=time.monotonic()+2
            while not (root/'pids.json').exists() and time.monotonic()<deadline: time.sleep(0.01)
            (root/'ready').touch()
            time.sleep(15)
    except Cancelled:
        pass
else:
    sys.exit(3)
