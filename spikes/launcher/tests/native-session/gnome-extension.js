/* global global, TextDecoder, print */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

print('LINUXCAST_S001_OBSERVER:MODULE_ENTERED');

const launcherId = 'io.github.ianwijma.Linuxcast';
const decoyId = 'io.github.ianwijma.Linuxcast.S001Decoy';
const rectangle = value => {
    if (!value || ![value.x,value.y,value.width,value.height].every(Number.isFinite) || value.width <= 0 || value.height <= 0) return null;
    return {x:value.x,y:value.y,width:value.width,height:value.height};
};
const empty = count => ({count,identityMatches:false,nativeBackend:'unsupported',focused:false,hidden:true,geometry:null,workArea:null});
const identityStatus = (value,id) => typeof value !== 'string' ? 'non-string' : value === id ? 'match' : value.length ? 'mismatch' : 'empty';
const diagnostic = count => ({pidMatch:count === 0 ? 'none' : count === 1 ? 'single' : 'multiple',primaryIdentity:'not-inspected',secondaryIdentity:'not-inspected',geometry:'not-inspected',workArea:'not-inspected'});
export default class LauncherObserver extends Extension {
    enable() {
        print('LINUXCAST_S001_OBSERVER:ENABLE_ENTERED');
        const root = GLib.getenv('LINUXCAST_S001_MATRIX_ROOT');
        if (GLib.getenv('LINUXCAST_S001_PRIVATE_MATRIX') !== '1' || !root || !GLib.path_get_basename(root).startsWith('linuxcast-s001-matrix-')) {
            print('LINUXCAST_S001_OBSERVER:PRIVATE_CONTEXT_REJECTED'); return;
        }
        print('LINUXCAST_S001_OBSERVER:PRIVATE_CONTEXT_ACCEPTED');
        this._last = 0;
        let firstTick = true;
        const prevalidationSeen = new Set();
        const prevalidation = category => {
            if (prevalidationSeen.size < 8 && !prevalidationSeen.has(category)) {
                prevalidationSeen.add(category); print(`LINUXCAST_S001_OBSERVER:${category}`);
            }
        };
        this._poll = GLib.timeout_add(GLib.PRIORITY_DEFAULT,100,() => {
            if (firstTick) { firstTick = false; print('LINUXCAST_S001_OBSERVER:FIRST_POLL_TICK'); }
            let validatedRequest = 0, failureStage = 'enumerate', prevalidationFailure = 'PREVALIDATION_FAILED';
            try {
                const file = Gio.File.new_for_path(`${root}/context.json`);
                prevalidationFailure = 'CONTEXT_NOT_OBSERVED';
                if (!file.query_exists(null)) { prevalidation('CONTEXT_NOT_OBSERVED'); return GLib.SOURCE_CONTINUE; }
                prevalidationFailure = 'READ_FAILED';
                const [,bytes] = file.load_contents(null);
                if (bytes.length > 4096) { prevalidation('SIZE_REJECTED'); return GLib.SOURCE_CONTINUE; }
                prevalidationFailure = 'DECODE_FAILED';
                const decoded = new TextDecoder().decode(bytes);
                prevalidationFailure = 'JSON_REJECTED';
                const context = JSON.parse(decoded);
                prevalidationFailure = 'SCHEMA_REJECTED';
                if (Object.keys(context).sort().join(',') !== 'decoyPid,operation,pid,request' || !Number.isSafeInteger(context.request)) {
                    prevalidation('SCHEMA_REJECTED'); return GLib.SOURCE_CONTINUE;
                }
                if (context.request <= this._last) {
                    prevalidation(context.request > 0 ? 'STALE_REQUEST' : 'SCHEMA_REJECTED'); return GLib.SOURCE_CONTINUE;
                }
                if (context.request > 1000 || ![context.pid,context.decoyPid].every(pid => Number.isSafeInteger(pid) && pid > 1 && pid <= 4194304)
                    || context.pid === context.decoyPid || !['observe','activate-decoy'].includes(context.operation)) {
                    prevalidation('SCHEMA_REJECTED'); return GLib.SOURCE_CONTINUE;
                }
                validatedRequest = context.request;
                print(`LINUXCAST_S001_OBSERVER:REQUEST_VALIDATED:${validatedRequest}`);
                // Mutter actors may outlive their nullable Meta.Window during close.
                // Before identity checks, inspect only the fixed launched PIDs.
                const windows = global.get_window_actors().map(actor => actor.meta_window).filter(window => window !== null && window !== undefined);
                const own = (pid,id) => {
                    const matches = windows.filter(window => window.get_pid() === pid);
                    const probe = diagnostic(matches.length);
                    if (matches.length !== 1) return {value:empty(matches.length),window:null,diagnostic:probe};
                    const window = matches[0];
                    // Only fixed expected-ID comparisons survive; raw metadata is
                    // discarded, and no metadata is read before the own PID gate.
                    probe.primaryIdentity = identityStatus(window.get_gtk_application_id(),id);
                    probe.secondaryIdentity = identityStatus(window.get_wm_class(),id);
                    const identity = probe.primaryIdentity === 'match' || probe.secondaryIdentity === 'match';
                    if (!identity) return {value:empty(1),window:null,diagnostic:probe};
                    const type = window.get_client_type();
                    const geometry = rectangle(window.get_frame_rect()), workArea = rectangle(window.get_work_area_current_monitor());
                    probe.geometry = geometry ? 'ready' : 'not-ready'; probe.workArea = workArea ? 'ready' : 'not-ready';
                    return {window:geometry && workArea ? window : null,diagnostic:probe,value:{count:1,identityMatches:true,
                        nativeBackend:type === Meta.WindowClientType.WAYLAND ? 'wayland' : type === Meta.WindowClientType.X11 ? 'x11' : 'unsupported',
                        focused:window.has_focus(),hidden:window.is_hidden(),geometry,workArea}};
                };
                failureStage = 'launcher';
                const launcher = own(context.pid,launcherId);
                failureStage = 'decoy';
                const decoy = own(context.decoyPid,decoyId);
                let decoyActivationIssued = false;
                // Explicit challenge setup only. The launcher is NEVER activated,
                // raised, moved or resized by this diagnostic extension.
                failureStage = 'activation';
                if (context.operation === 'activate-decoy' && decoy.window) {
                    decoy.window.activate(global.get_current_time()); decoyActivationIssued = true;
                }
                failureStage = 'publish';
                Gio.File.new_for_path(`${root}/observation.json`).replace_contents(JSON.stringify({request:context.request,
                    launcher:launcher.value,decoy:decoy.value,decoyActivationIssued,
                    diagnostics:{launcher:launcher.diagnostic,decoy:decoy.diagnostic}}),null,false,Gio.FileCreateFlags.PRIVATE,null);
                this._last = context.request;
                print(`LINUXCAST_S001_OBSERVER:REPLY_PUBLISHED:${validatedRequest}`);
            } catch {
                // Only a fully validated request permits a fixed public failure.
                // No exception text or partial native data crosses this boundary.
                if (!validatedRequest) prevalidation(prevalidationFailure);
                if (validatedRequest) {
                    // Consume even if publication fails: do not repeat an uncertain activation.
                    this._last = validatedRequest;
                    try {
                        Gio.File.new_for_path(`${root}/observation.json`).replace_contents(JSON.stringify({request:validatedRequest,
                            hookFailure:{stage:failureStage,outcome:'native-read-failed'}}),null,false,Gio.FileCreateFlags.PRIVATE,null);
                        print(`LINUXCAST_S001_OBSERVER:HOOK_FAILURE_PUBLISHED:${validatedRequest}`);
                    } catch { /* A failed failure publication stays a missing reply. */ }
                }
            }
            return GLib.SOURCE_CONTINUE;
        });
        print('LINUXCAST_S001_OBSERVER:POLL_INSTALLED');
    }
    disable() { print('LINUXCAST_S001_OBSERVER:DISABLED'); if (this._poll) GLib.source_remove(this._poll); this._poll = 0; }
}
