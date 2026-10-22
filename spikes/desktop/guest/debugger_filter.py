"""Child-only GDB diagnostic. Export categories, never stack arguments or addresses."""
import json
import os

MODULES = {
    'libkwin.so.6': 'KWIN',
    'libQt6Qml.so.6': 'QT_QML',
    'libQt6Quick.so.6': 'QT_QUICK',
    'libQt6Core.so.6': 'QT_CORE',
    'libQt6Gui.so.6': 'QT_GUI',
    'libQt6WaylandClient.so.6': 'QT_WAYLAND',
    'libwayland-server.so.0': 'WAYLAND_SERVER',
    'libwayland-client.so.0': 'WAYLAND_CLIENT',
    'libc.so.6': 'LIBC',
    'libstdc++.so.6': 'LIBSTDCXX',
    'libEGL_mesa.so.0': 'MESA_EGL',
    'libgbm.so.1': 'GBM',
    'kwin_wayland': 'KWIN_EXECUTABLE',
}
FUNCTIONS = {
    'KWin::QPA::EGLPlatformContext::swapBuffers(': 'KWIN_QPA_SWAP_BUFFERS',
    'KWin::QPA::BackingStore::flush(': 'KWIN_QPA_BACKING_STORE_FLUSH',
    'KWin::Window::moveResize(': 'KWIN_MOVE_RESIZE',
    'KWin::XdgToplevelWindow::moveResizeInternal(': 'KWIN_XDG_MOVE_RESIZE',
    'KWin::WaylandCompositor::composite(': 'KWIN_WAYLAND_COMPOSITE',
    'KWin::Script::callDBus(': 'KWIN_SCRIPT_DBUS',
    'KWin::': 'KWIN_OTHER',
    # Qt6.8.2 public source class families; these categories do not claim
    # that any particular function was observed in the earlier coarse trace.
    'QPainter::': 'QT_PAINTER',
    'QPainterPrivate::': 'QT_PAINTER',
    'QRasterPaintEngine::': 'QT_RASTER_PAINT_ENGINE',
    'QRasterPaintEnginePrivate::': 'QT_RASTER_PAINT_ENGINE',
    'QPaintEngine::': 'QT_PAINT_ENGINE',
    'QPaintEngineEx::': 'QT_PAINT_ENGINE',
    'QImage::': 'QT_IMAGE',
    'QImageData::': 'QT_IMAGE',
    'QRegion::': 'QT_REGION',
    'QBackingStore::': 'QT_BACKING_STORE',
    'QBackingStorePrivate::': 'QT_BACKING_STORE',
    'QPlatformBackingStore::': 'QT_BACKING_STORE',
    'QOpenGLContext::': 'QT_OPENGL_CONTEXT',
    'QPlatformOpenGLContext::': 'QT_OPENGL_CONTEXT',
    'QPlatformWindow::': 'QT_PLATFORM_WINDOW',
    'QWindow::': 'QT_PLATFORM_WINDOW',
    'QSpanData::': 'QT_RASTER_DATA',
    'QRasterBuffer::': 'QT_RASTER_DATA',
    # Exact Debian Qt6.8.2 painting sources also dispatch through free helpers.
    # These are classification hypotheses, not observed fault identities.
    'qt_blend_': 'QT_IMAGE_BLEND',
    'qt_scale_image_': 'QT_IMAGE_SCALE',
    'qt_transform_image_': 'QT_IMAGE_TRANSFORM',
    'fetchTransformed': 'QT_TEXTURE_FETCH',
    'QJSEngine::': 'QT_JS_ENGINE',
    'QV4::': 'QT_JS_RUNTIME',
    'QQuickWindow::': 'QT_QUICK_WINDOW',
    'QQuick': 'QT_QUICK_OTHER',
    'QCoreApplication::': 'QT_EVENT_DELIVERY',
    'QObject::': 'QT_OBJECT',
}


def module_category(path):
    name = os.path.basename(path or '')
    if name.startswith('libkwin.so.6.'): return 'KWIN'
    if name.startswith('libgallium-') and name.endswith('.so'): return 'MESA_GALLIUM'
    return MODULES.get(name, 'UNKNOWN')


def function_category(name):
    for prefix, category in FUNCTIONS.items():
        if (name or '').startswith(prefix): return category
    return 'UNKNOWN'


def frame_category(path, name):
    function = function_category(name)
    # GDB returns None when a frame has no symbol. Never substitute a nearest
    # symbol, address, raw name, arguments or arbitrary text for that absence.
    state = 'ABSENT' if not name else 'UNCLASSIFIED' if function == 'UNKNOWN' else 'CLASSIFIED'
    return {'module': module_category(path), 'function': function, 'symbolState': state}


def parse_report(value):
    if not isinstance(value, dict) or set(value) != {'signal', 'frames', 'inspectionFailed'}: return None
    if value['signal'] not in ('NONE', 'SIGSEGV', 'SIGABRT', 'OTHER_SIGNAL') or type(value['inspectionFailed']) is not bool: return None
    frames = value['frames']
    if not isinstance(frames, list) or len(frames) > 16: return None
    modules = set(MODULES.values()) | {'UNKNOWN', 'MESA_GALLIUM'}
    functions = set(FUNCTIONS.values()) | {'UNKNOWN'}
    for frame in frames:
        if not isinstance(frame, dict) or set(frame) != {'module', 'function', 'symbolState'}: return None
        if not isinstance(frame['module'], str) or frame['module'] not in modules: return None
        if not isinstance(frame['function'], str) or frame['function'] not in functions: return None
        if frame['symbolState'] not in ('ABSENT', 'CLASSIFIED', 'UNCLASSIFIED'): return None
        if (frame['symbolState'] == 'CLASSIFIED') != (frame['function'] != 'UNKNOWN'): return None
    return value


def main():
    import gdb
    signal = 'NONE'

    def stopped(event):
        nonlocal signal
        if isinstance(event, gdb.SignalEvent):
            signal = event.stop_signal if event.stop_signal in ('SIGSEGV', 'SIGABRT') else 'OTHER_SIGNAL'

    gdb.events.stop.connect(stopped)
    # These affect only this debugger and its child. No attach, remote target,
    # inferior function calls, startup files, auto-load or symbol network fetch.
    for setting in ('auto-load off', 'debuginfod enabled off', 'pagination off',
                    'confirm off', 'startup-with-shell off', 'disable-randomization off',
                    'may-call-functions off'):
        gdb.execute('set ' + setting, to_string=True)
    gdb.execute('handle SIGPIPE nostop noprint pass', to_string=True)
    failed = False
    try:
        gdb.execute('run', to_string=True)
    except gdb.error:
        failed = True
    frames = []
    try:
        frame = gdb.newest_frame()
        while frame is not None and len(frames) < 16:
            library = gdb.solib_name(frame.pc())
            if library is None: library = gdb.current_progspace().filename
            frames.append(frame_category(library, frame.name()))
            frame = frame.older()
    except gdb.error:
        failed = True
    gdb.write('LINUXCAST_S002_DEBUGGER:' + json.dumps({'signal': signal, 'frames': frames, 'inspectionFailed': failed}) + '\n')
    try:
        gdb.execute('kill', to_string=True)
    except gdb.error:
        pass
    # A debugger wrapper exit is not relabelled the original child exit/signal.
    gdb.execute('quit 86', to_string=True)


if __name__ == '__main__':
    main()
