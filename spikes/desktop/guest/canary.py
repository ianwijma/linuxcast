#!/usr/bin/python3
"""Persistent public GTK window; no clipboard, keyboard capture or host display."""
import os
import json
import sys
import gi

gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gio, Gdk

if os.environ.get('LINUXCAST_S002_PRIVATE_GUEST') != '1':
    sys.exit(3)
app = Gtk.Application(application_id='io.github.ianwijma.Linuxcast.S002Canary',
                      flags=Gio.ApplicationFlags.NON_UNIQUE)

def activate(application):
    window = Gtk.ApplicationWindow(application=application, title='Linuxcast public native canary')
    window.set_default_size(280, 160)
    window.add(Gtk.Label(label='Public Linuxcast native API canary\nNo user clipboard or private window content'))
    observations = []
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
        print(json.dumps({'ownConfigureEvents':observations}),flush=True)
        return False
    window.connect('configure-event', configured)
    window.show_all()

app.connect('activate', activate)
sys.exit(app.run([]))
