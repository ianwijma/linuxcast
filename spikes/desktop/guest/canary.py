#!/usr/bin/python3
"""Persistent public GTK window; no clipboard, keyboard capture or host display."""
import os
import json
import sys
import gi

gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gio, Gdk, GLib
from client_resize import Reader

if os.environ.get('LINUXCAST_S002_PRIVATE_GUEST') != '1':
    sys.exit(3)
control_mode = sys.argv[1:] == ['--own-client-resize-control']
if sys.argv[1:] and not control_mode: sys.exit(3)
control_reader = None
app = Gtk.Application(application_id='io.github.ianwijma.Linuxcast.S002Canary',
                      flags=Gio.ApplicationFlags.NON_UNIQUE)

def activate(application):
    global control_reader
    window = Gtk.ApplicationWindow(application=application, title='Linuxcast public native canary')
    window.set_default_size(280, 160)
    window.add(Gtk.Label(label='Public Linuxcast native API canary\nNo user clipboard or private window content'))
    observations = []
    last_record = None
    def publish():
        nonlocal last_record
        value = {'ownConfigureEvents': observations}
        if control_reader is not None: value['clientResizeControl'] = control_reader.value
        encoded = json.dumps(value)
        if encoded != last_record:
            print(encoded, flush=True)
            last_record = encoded
    if control_mode:
        def snapshot():
            width, height = window.get_size()
            state = window.get_window().get_state()
            return ({'clientWidth':width, 'clientHeight':height,
                     'maximized':bool(state & Gdk.WindowState.MAXIMIZED),
                     'fullscreen':bool(state & Gdk.WindowState.FULLSCREEN),
                     'iconified':bool(state & Gdk.WindowState.ICONIFIED),
                     'resizable':window.get_resizable()}, len(observations))
        try: control_reader = Reader(snapshot, window.resize)
        except (OSError, ValueError):
            sys.exit(3)
        def request_ready(_fd, _condition):
            keep = control_reader.ready()
            publish()
            if control_reader.failed: application.quit()
            return keep
        GLib.io_add_watch(0, GLib.IO_IN | GLib.IO_HUP, request_ready)
    def configured(_window, event):
        # Only the first eight events of this synthetic window leave stdout.
        # The runner keeps this private log transient and exports this schema.
        if len(observations) >= 8: return False
        client = tuple(window.get_size())
        if any(not isinstance(value, int) or not 0 < value <= 16384 for value in (event.width, event.height, *client)):
            return False
        state = window.get_window().get_state()
        observations.append({'width':event.width,'height':event.height,
            'clientWidth':client[0],'clientHeight':client[1],
            'maximized':bool(state & Gdk.WindowState.MAXIMIZED),
            'fullscreen':bool(state & Gdk.WindowState.FULLSCREEN),
            'iconified':bool(state & Gdk.WindowState.ICONIFIED),
            'resizable':window.get_resizable()})
        publish()
        return False
    window.connect('configure-event', configured)
    window.show_all()

app.connect('activate', activate)
status = app.run([])
if control_reader is not None:
    control_reader.close()
    if control_reader.failed: status = 3
sys.exit(status)
