/* global workspace, QTimer, callDBus, KWin, console */
// Bundled with the current real kwinLoop/kwinWindow adapters. The only target
// metadata comes from a fixed private guest helper, never a title or raw object.
import {kwinLoop, kwinWindow, BUS, parseHandle, parseRect} from './desktop-api.ts';

const diagnostic = stage => console.log('LINUXCAST_S002_STAGE:'+stage);
diagnostic('SCRIPT_ENTERED');
function send(method,value,callback) {
    callDBus(BUS.service,BUS.path,BUS.interface,method,JSON.stringify(value),callback);
}
function timer(milliseconds,expired) {
    const clock = new QTimer();
    clock.interval = milliseconds;
    clock.singleShot = true;
    clock.timeout.connect(expired);
    clock.start();
    return {elapsed:() => Math.max(0,milliseconds-clock.remainingTime),cancel:() => clock.stop()};
}
send('CanaryContext',{protocolVersion:1},encoded => {
    diagnostic('CONTEXT_CALLBACK');
    try {
        const context = JSON.parse(encoded);
        if (Object.keys(context).sort().join() !== 'handle,pid' || !Number.isSafeInteger(context.pid) || context.pid <= 0 || context.pid > 4194304) return;
        const handle = parseHandle(context.handle);
        const run = window => {
        diagnostic('OWN_WINDOW_FOUND');
        const native = kwinWindow(window,workspace,KWin.MaximizeArea);
        diagnostic('NATIVE_ADAPTER_READY');
        const observations = [];
        let requested = null;
        let nativePlacementAttempted = false;
        const loop = kwinLoop(callDBus,timer,command => {
            if (JSON.stringify(command.handle) !== JSON.stringify(handle) || !native.alive()) return 'denied';
            if (command.operation === 'geometry') {
                observations.push(parseRect(native.geometry()));
                return 'ok';
            }
            if (native.state() !== 'normal') return 'denied';
            const area = parseRect(native.workArea());
            const rect = parseRect(command.rect);
            if (rect.x < area.x || rect.y < area.y || rect.x+rect.width > area.x+area.width || rect.y+rect.height > area.y+area.height) return 'denied';
            requested = rect;
            nativePlacementAttempted = true;
            native.place(rect);
            return 'ok';
        },(reason,action) => {
            // The loop is stopped before this fixed observation method. No
            // second NextCommand/Ack is outstanding and no control is forwarded.
            send('CanaryObservation',{protocolVersion:1,reason,action,observations,requested,nativePlacementAttempted},() => native.dispose());
        });
        diagnostic('LOOP_START');
        loop.start();
        };
        // The native GTK client may map after helper registration under TCG.
        const ready = new QTimer(); ready.interval = 100; ready.singleShot = false;
        let remaining = 40;
        const find = () => {
            const windows = workspace.windowList().filter(window => window.pid === context.pid);
            if (windows.length === 1) { ready.stop(); run(windows[0]); }
            else if (--remaining <= 0) { ready.stop(); diagnostic('OWN_WINDOW_DEADLINE'); }
        };
        ready.timeout.connect(find); ready.start(); find();
    } catch { diagnostic('SCRIPT_EXCEPTION'); /* No exception body is exported. */ }
});
