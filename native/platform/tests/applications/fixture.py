#!/usr/bin/python3
"""Public synthetic launch target; writes only this test's private marker."""
import json
import os
import sys
marker = os.environ['LINUXCAST_FIXTURE_MARKER']
with open(marker + '.tmp', 'w', encoding='utf-8') as output:
    json.dump({'argv': sys.argv[1:], 'stdin': sys.stdin.read()}, output)
os.replace(marker + '.tmp', marker)
print('SYNTHETIC_CHILD_STDOUT')
print('SYNTHETIC_CHILD_STDERR', file=sys.stderr)
