/* global global, TextDecoder */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const launcherId = 'io.github.ianwijma.Linuxcast';
const decoyId = 'io.github.ianwijma.Linuxcast.S001Decoy';
const rectangle = value => {
    if (![value.x,value.y,value.width,value.height].every(Number.isFinite) || value.width <= 0 || value.height <= 0) throw new Error('OWN_GEOMETRY_NOT_READY');
    return {x:value.x,y:value.y,width:value.width,height:value.height};
};
const empty = count => ({count,identityMatches:false,nativeBackend:'unsupported',focused:false,hidden:true,geometry:null,workArea:null});
export default class LauncherObserver extends Extension {
    enable() {
        const root = GLib.getenv('LINUXCAST_S001_MATRIX_ROOT');
        if (GLib.getenv('LINUXCAST_S001_PRIVATE_MATRIX') !== '1' || !root || !GLib.path_get_basename(root).startsWith('linuxcast-s001-matrix-')) return;
        this._last = 0;
        this._poll = GLib.timeout_add(GLib.PRIORITY_DEFAULT,100,() => {
            try {
                const file = Gio.File.new_for_path(`${root}/context.json`);
                if (!file.query_exists(null)) return GLib.SOURCE_CONTINUE;
                const [,bytes] = file.load_contents(null);
                if (bytes.length > 4096) return GLib.SOURCE_CONTINUE;
                const context = JSON.parse(new TextDecoder().decode(bytes));
                if (Object.keys(context).sort().join(',') !== 'decoyPid,operation,pid,request'
                    || !Number.isSafeInteger(context.request) || context.request <= this._last || context.request > 1000
                    || ![context.pid,context.decoyPid].every(pid => Number.isSafeInteger(pid) && pid > 1 && pid <= 4194304)
                    || context.pid === context.decoyPid || !['observe','activate-decoy'].includes(context.operation)) return GLib.SOURCE_CONTINUE;
                // Before identity checks, inspect only the fixed launched PIDs.
                const windows = global.get_window_actors().map(actor => actor.meta_window);
                const own = (pid,id) => {
                    const matches = windows.filter(window => window.get_pid() === pid);
                    if (matches.length !== 1) return {value:empty(matches.length),window:null};
                    const window = matches[0];
                    const identity = window.get_gtk_application_id() === id || window.get_wm_class() === id;
                    if (!identity) return {value:empty(1),window:null};
                    const type = window.get_client_type();
                    return {window,value:{count:1,identityMatches:true,
                        nativeBackend:type === Meta.WindowClientType.WAYLAND ? 'wayland' : type === Meta.WindowClientType.X11 ? 'x11' : 'unsupported',
                        focused:window.has_focus(),hidden:window.is_hidden(),geometry:rectangle(window.get_frame_rect()),workArea:rectangle(window.get_work_area_current_monitor())}};
                };
                const launcher = own(context.pid,launcherId), decoy = own(context.decoyPid,decoyId);
                let decoyActivationIssued = false;
                // Explicit challenge setup only. The launcher is NEVER activated,
                // raised, moved or resized by this diagnostic extension.
                if (context.operation === 'activate-decoy' && decoy.window) {
                    decoy.window.activate(global.get_current_time()); decoyActivationIssued = true;
                }
                Gio.File.new_for_path(`${root}/observation.json`).replace_contents(JSON.stringify({request:context.request,
                    launcher:launcher.value,decoy:decoy.value,decoyActivationIssued}),null,false,Gio.FileCreateFlags.PRIVATE,null);
                this._last = context.request;
            } catch { /* Bounded missing observation becomes a driver failure. */ }
            return GLib.SOURCE_CONTINUE;
        });
    }
    disable() { if (this._poll) GLib.source_remove(this._poll); this._poll = 0; }
}
