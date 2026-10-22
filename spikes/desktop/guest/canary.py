#!/usr/bin/python3
"""Persistent public GTK window; no clipboard, keyboard capture or host display."""
import os
import sys
import gi

gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gio

if os.environ.get('LINUXCAST_S002_PRIVATE_GUEST') != '1':
    sys.exit(3)
app = Gtk.Application(application_id='io.github.ianwijma.Linuxcast.S002Canary',
                      flags=Gio.ApplicationFlags.NON_UNIQUE)

def activate(application):
    window = Gtk.ApplicationWindow(application=application, title='Linuxcast public native canary')
    window.set_default_size(280, 160)
    window.add(Gtk.Label(label='Public Linuxcast native API canary\nNo user clipboard or private window content'))
    window.show_all()

app.connect('activate', activate)
sys.exit(app.run([]))
