/* global workspace, QTimer, callDBus, KWin, console */
import {kwinLoop,kwinWindow,BUS,parseHandle,parseRect} from './desktop-api.ts';
const tag = 'LINUXCAST_S002_RESTART:';
function timer(milliseconds,expired) {
    const clock=new QTimer(); clock.interval=milliseconds; clock.singleShot=true;
    clock.timeout.connect(expired); clock.start();
    return {elapsed:()=>Math.max(0,milliseconds-clock.remainingTime),cancel:()=>clock.stop()};
}
callDBus(BUS.service,BUS.path,BUS.interface,'CanaryContext',JSON.stringify({protocolVersion:1}),encoded => {
    try {
        const context=JSON.parse(encoded);
        if (Object.keys(context).sort().join() !== 'handle,phase,pid' || !['crash','fresh'].includes(context.phase)
            || !Number.isSafeInteger(context.pid) || context.pid<1 || context.pid>4194304) return;
        const handle=parseHandle(context.handle);
        const run=window=>{
        const native=kwinWindow(window,workspace,KWin.MaximizeArea);
        let executions=0,deniedInstances=0,placements=0;
        const observed=[];
        const emit=(event,extra={})=>console.log(tag+JSON.stringify({event,phase:context.phase,handle,executions,deniedInstances,placements,...extra}));
        emit('context');
        const loop=kwinLoop(callDBus,timer,command=>{
            if (JSON.stringify(command.handle)!==JSON.stringify(handle) || !native.alive()) {
                deniedInstances++; emit('stale-handle-denied'); return 'denied';
            }
            executions++;
            if (command.operation==='geometry') {
                const geometry=parseRect(native.geometry()); observed.push(geometry); emit('native-geometry',{geometry}); return 'ok';
            }
            placements++;
            // A placement reaching this callback makes the loss/restart test fail;
            // no physical/native move is performed by this fault-injection script.
            emit('unexpected-placement'); return 'denied';
        },(reason,action)=>{
            emit('stopped',{reason,action,observed}); native.dispose();
        });
        loop.start();
        };
        const ready=new QTimer(); ready.interval=100; ready.singleShot=false;
        let remaining=40;
        const find=()=>{
            const windows=workspace.windowList().filter(window=>window.pid===context.pid);
            if (windows.length===1) { ready.stop(); run(windows[0]); }
            else if (--remaining<=0) ready.stop();
        };
        ready.timeout.connect(find); ready.start(); find();
    } catch { /* No raw native exception or frame content enters diagnostics. */ }
});
