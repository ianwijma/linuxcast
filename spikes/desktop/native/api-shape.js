// Read-only GI type metadata; no clipboard instance, window list or Shell eval.
/* global imports, print */
const Meta = imports.gi.Meta;
const St = imports.gi.St;
print(JSON.stringify({
    selectionTransferAsync: typeof Meta.Selection.prototype.transfer_async === 'function',
    selectionTransferFinish: typeof Meta.Selection.prototype.transfer_finish === 'function',
    selectionMimeTypes: typeof Meta.Selection.prototype.get_mimetypes === 'function',
    windowFrameGeometry: typeof Meta.Window.prototype.get_frame_rect === 'function',
    windowMoveResize: typeof Meta.Window.prototype.move_resize_frame === 'function',
    stClipboardContent: typeof St.Clipboard.prototype.get_content === 'function',
}));
