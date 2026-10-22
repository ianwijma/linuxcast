"""Fixed public own-window focus challenge. No clipboard or key event handlers."""
import os
import sys
import gi
gi.require_version('Gtk','3.0')
from gi.repository import Gio, GLib
if os.environ.get('LINUXCAST_S001_PRIVATE_MATRIX')!='1': sys.exit(3)
GLib.set_prgname('io.github.ianwijma.Linuxcast.S001Decoy')
from gi.repository import Gtk
app=Gtk.Application(application_id='io.github.ianwijma.Linuxcast.S001Decoy',flags=Gio.ApplicationFlags.NON_UNIQUE)
def activate(application):
    window=Gtk.ApplicationWindow(application=application,title='Linuxcast public focus decoy')
    window.set_default_size(360,180)
    window.add(Gtk.Label(label='Public launcher focus challenge\nNo private content or clipboard'))
    window.show_all()
app.connect('activate',activate)
sys.exit(app.run([]))
