/* global workspace, QTimer, callDBus, KWin */
// Private diagnostic script, not a production companion or incoming D-Bus API.
const service = 'io.github.ianwijma.Linuxcast.Spike.LauncherMatrix1';
const path = '/io/github/ianwijma/Linuxcast/Spike/LauncherMatrix1';
const launcherId = 'io.github.ianwijma.Linuxcast', decoyId = 'io.github.ianwijma.Linuxcast.S001Decoy';
const rectangle = value => {
    if (!value || ![value.x,value.y,value.width,value.height].every(Number.isFinite) || value.width <= 0 || value.height <= 0) return null;
    return {x:value.x,y:value.y,width:value.width,height:value.height};
};
const empty = count => ({count,identityMatches:false,nativeBackend:'unsupported',focused:false,hidden:true,geometry:null,workArea:null});
const identityStatus = (value,id) => typeof value !== 'string' ? 'non-string' : value === id ? 'match' : value.length ? 'mismatch' : 'empty';
const diagnostic = count => ({pidMatch:count === 0 ? 'none' : count === 1 ? 'single' : 'multiple',primaryIdentity:'not-inspected',secondaryIdentity:'not-inspected',geometry:'not-inspected',workArea:'not-inspected'});
let last = 0, pending = false, ticks = 0;
const timer = new QTimer(); timer.interval = 100; timer.singleShot = false;
timer.timeout.connect(() => {
    if (pending) { if (++ticks >= 30) timer.stop(); return; }
    pending = true; ticks = 0;
    callDBus(service,path,service,'Context','{}',encoded => {
        try {
            const context = JSON.parse(encoded);
            if (!Number.isSafeInteger(context.request) || context.request <= last) { pending = false; return; }
            const windows = workspace.windowList();
            const own = (pid,id) => {
                const matches = windows.filter(window => window.pid === pid);
                const probe = diagnostic(matches.length);
                if (matches.length !== 1) return {value:empty(matches.length),window:null,diagnostic:probe};
                const window = matches[0];
                probe.primaryIdentity = identityStatus(window.resourceClass,id);
                probe.secondaryIdentity = identityStatus(window.desktopFileName,id);
                if (probe.primaryIdentity !== 'match' && probe.secondaryIdentity !== 'match') return {value:empty(1),window:null,diagnostic:probe};
                // Qt's QObject wrapper string exposes its native metaobject class.
                // Convert only this already identity/PID-matched object; never
                // retain the address/object name. Unknown native classes fail.
                const nativeClass = String(window).split('(')[0];
                const nativeBackend = nativeClass === 'KWin::XdgToplevelWindow' ? 'wayland' : nativeClass === 'KWin::X11Window' ? 'x11' : 'unsupported';
                const geometry = rectangle(window.frameGeometry), workArea = rectangle(workspace.clientArea(KWin.MaximizeArea,window));
                probe.geometry = geometry ? 'ready' : 'not-ready'; probe.workArea = workArea ? 'ready' : 'not-ready';
                return {window:geometry && workArea ? window : null,diagnostic:probe,value:{count:1,identityMatches:true,nativeBackend,focused:window.active,
                    hidden:window.hidden,geometry,workArea}};
            };
            const launcher = own(context.pid,launcherId), decoy = own(context.decoyPid,decoyId);
            let decoyActivationIssued = false;
            if (context.operation === 'activate-decoy' && decoy.window) { workspace.activeWindow = decoy.window; decoyActivationIssued = true; }
            last = context.request;
            callDBus(service,path,service,'Observation',JSON.stringify({request:context.request,launcher:launcher.value,decoy:decoy.value,decoyActivationIssued,
                diagnostics:{launcher:launcher.diagnostic,decoy:decoy.diagnostic}}),() => { pending = false; });
        } catch { timer.stop(); }
    });
});
timer.start();
