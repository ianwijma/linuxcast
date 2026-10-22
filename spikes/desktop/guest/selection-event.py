#!/usr/bin/python3
"""Fixed watch callback: bounded public comparison only, never output content."""
import json
import os
import sys
if os.environ.get('LINUXCAST_S002_PRIVATE_GUEST') != '1':
    sys.exit(3)
content = sys.stdin.buffer.read(1024*1024+1)
print(json.dumps({'event':'native-selection-change','state':os.environ.get('CLIPBOARD_STATE','unknown'),
    'bytesAtMost':len(content),'publicPayloadMatches':content==b'public Linuxcast S0-02 isolated Wayland selection'}),flush=True)
