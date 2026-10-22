/* global global, TextEncoder */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {gnomeWindow, gnomeSelectionSource, parseRect} from './desktop-api.js';

const appId = 'io.github.ianwijma.Linuxcast.S002Canary';
const payload = 'public Linuxcast S0-02 private Meta.Selection canary';
// Harness cancellation signal, backed by the adapter's actual Gio.Cancellable.
// This is not a replacement Meta.Selection/Window implementation.
class Cancellation {
    aborted = false;
    callbacks = new Set();
    addEventListener(_name, callback) { this.callbacks.add(callback); }
    removeEventListener(_name, callback) { this.callbacks.delete(callback); }
    abort() { this.aborted = true; for (const callback of this.callbacks) callback(); }
}
export default class NativeCanary extends Extension {
    enable() {
        if (GLib.getenv('LINUXCAST_S002_PRIVATE_GUEST') !== '1') return;
        this._stopped = false;
        this._sources = new Set();
        this._native = null;
        this._selection = null;
        this._ownerSignal = null;
        this._cancel = null;
        this._result = {kind:'actual-GNOME48-native-private-selection-and-own-window',state:'running',
            normalClipboardTouched:false,privateSelection:true,ownerEvents:0};
        let remaining = 100;
        this._poll = GLib.timeout_add(GLib.PRIORITY_DEFAULT,100,() => {
            if (this._stopped) return GLib.SOURCE_REMOVE;
            const windows = global.get_window_actors().map(actor => actor.meta_window)
                .filter(window => window.get_gtk_application_id() === appId);
            if (windows.length === 1) {
                this._poll = 0;
                this._probe(windows[0]).catch(error => {
                    this._result.errorKind = error instanceof TypeError ? 'TYPE_ERROR' : error instanceof RangeError ? 'RANGE_ERROR' : 'NATIVE_OR_PROBE_ERROR';
                    this._finish('failed','NATIVE_PROBE_FAILED');
                });
                return GLib.SOURCE_REMOVE;
            }
            if (--remaining <= 0) { this._poll = 0; this._finish('unavailable','OWN_CANARY_WINDOW_REQUIRED'); return GLib.SOURCE_REMOVE; }
            return GLib.SOURCE_CONTINUE;
        });
    }
    async _probe(window) {
        this._result.stage = 'WINDOW_ADAPTER';
        this._result.windowApiPresent = ['get_frame_rect','get_work_area_current_monitor','move_resize_frame','is_fullscreen','get_maximized','connect','disconnect']
            .every(name => typeof window[name] === 'function');
        this._result.nativeWaylandClient = window.get_client_type() === Meta.WindowClientType.WAYLAND;
        if (GLib.getenv('GDK_BACKEND') === 'wayland' && !this._result.nativeWaylandClient) throw new Error('NATIVE_WAYLAND_CLIENT_REQUIRED');
        this._native = gnomeWindow(window);
        this._result.stage = 'INITIAL_GEOMETRY';
        const before = parseRect(this._native.geometry());
        this._result.stage = 'WORK_AREA';
        const area = parseRect(this._native.workArea());
        this._result.stage = 'WINDOW_STATE';
        if (this._native.state() !== 'normal') throw new Error('OWN_WINDOW_NOT_NORMAL');
        this._result.initialGeometry = before;
        this._result.workArea = area;
        const target = {x:before.x === area.x+32 ? area.x+64 : area.x+32,y:area.y+32,width:Math.min(400,area.width-64),height:Math.min(240,area.height-64)};
        this._result.requested = target;
        this._result.stage = 'NATIVE_PLACEMENT';
        this._native.place(target);
        await this._delay(300);
        this._result.finalGeometry = parseRect(this._native.geometry());
        this._result.liveGeometryChanged = JSON.stringify(before) !== JSON.stringify(this._result.finalGeometry);
        this._result.targetApplied = Object.keys(target).every(key => Math.abs(target[key]-this._result.finalGeometry[key]) <= 1);
        // A distinct native manager is deliberately NOT global.display.get_selection().
        // Real Meta owner signals/transfers are exercised without normal CLIPBOARD.
        this._result.stage = 'PRIVATE_SELECTION_SETUP';
        this._selection = Meta.Selection.new(global.display);
        this._ownerSignal = this._selection.connect('owner-changed',() => { this._result.ownerEvents++; });
        const type = Meta.SelectionType.SELECTION_CLIPBOARD;
        const bytes = new TextEncoder().encode(payload);
        const source = Meta.SelectionSourceMemory.new('text/plain',new GLib.Bytes(bytes));
        this._selection.set_owner(type,source);
        this._sources.add(source);
        this._result.mimeObserved = this._selection.get_mimetypes(type).includes('text/plain');
        const reader = gnomeSelectionSource(this._selection,type,
            () => Gio.MemoryOutputStream.new_resizable(),() => new Gio.Cancellable());
        this._cancel = new Cancellation();
        this._result.stage = 'PRIVATE_SELECTION_TRANSFER';
        const content = await reader.read('text/plain',4097,this._cancel);
        this._result.publicPayloadMatches = content.length === bytes.length && content.every((byte,index) => byte === bytes[index]);
        const oversize = Meta.SelectionSourceMemory.new('text/plain',new GLib.Bytes(new Uint8Array(8192).fill(65)));
        this._selection.set_owner(type,oversize); this._sources.add(oversize);
        const capped = await reader.read('text/plain',4097,new Cancellation());
        this._result.nativeByteLimit = capped.length <= 4097;
        this._result.oversizeDetectable = capped.length > 4096;
        const cancel = new Cancellation();
        const pending = reader.read('text/plain',4097,cancel);
        cancel.abort();
        try { await pending; this._result.nativeCancellation = false; }
        catch { this._result.nativeCancellation = true; }
        const unsupported = Meta.SelectionSourceMemory.new('application/x-linuxcast-s002-unsupported',new GLib.Bytes(bytes));
        this._selection.set_owner(type,unsupported); this._sources.add(unsupported);
        this._result.unsupportedMimeObserved = this._selection.get_mimetypes(type).includes('application/x-linuxcast-s002-unsupported');
        try { await reader.read('text/plain',4097,new Cancellation()); this._result.unsupportedMimeRejected = false; }
        catch { this._result.unsupportedMimeRejected = true; }
        this._selection.unset_owner(type,unsupported);
        this._sources.delete(oversize);
        const remainingTypes = this._selection.get_mimetypes(type);
        this._result.privateSelectionReleased = remainingTypes === null || remainingTypes.length === 0;
        const passed = ['liveGeometryChanged','targetApplied','unsupportedMimeObserved','unsupportedMimeRejected','mimeObserved','publicPayloadMatches','nativeByteLimit','oversizeDetectable','nativeCancellation','privateSelectionReleased']
            .every(key => this._result[key] === true) && this._result.ownerEvents >= 2;
        this._finish(passed ? 'passed' : 'failed',passed ? 'READY' : 'NATIVE_ASSERTION_FAILED');
    }
    _delay(milliseconds) {
        return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT,milliseconds,() => { resolve(); return GLib.SOURCE_REMOVE; }));
    }
    _finish(state,reason) {
        if (this._stopped) return;
        this._result.state = state; this._result.reason = reason;
        const root = GLib.getenv('LINUXCAST_S002_RESULT_DIR');
        if (!root || !root.startsWith('/tmp/linuxcast-s002-')) return;
        const file = Gio.File.new_for_path(`${root}/gnome-result.json`);
        file.replace_contents(JSON.stringify(this._result),null,false,Gio.FileCreateFlags.PRIVATE,null);
    }
    disable() {
        this._stopped = true;
        if (this._poll) GLib.source_remove(this._poll);
        this._poll = 0;
        this._cancel?.abort();
        if (this._ownerSignal) this._selection?.disconnect(this._ownerSignal);
        this._ownerSignal = null;
        this._sources?.clear();
        this._selection = null;
        this._native?.dispose();
        this._native = null;
    }
}
