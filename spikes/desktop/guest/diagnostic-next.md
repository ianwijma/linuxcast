# Next bounded native diagnostic proposal — unexecuted

The guest is released to the coordinator after the reviewed two-run comparison. This note authorizes no further VM, compositor or debugger invocation. Earlier traces retain the exact source patches and manifests under which they ran. No renderer/backend, timer or geometry assertion changes are proposed.

## Finer fixed Qt GUI categories

The installed transaction records Qt GUI `6.8.2+dfsg-9+deb13u2` and QML/Quick `6.8.2+dfsg-7`. The first debugger result has four `QT_GUI/UNKNOWN` frames, followed by KWin frames including its Wayland compositor. This is a stack observation, not a root-cause attribution.

The offline filter extends only its static function-prefix map. Every input name remains internal; output remains a fixed enum, bounded to 16 frames and independently schema-validated. Unknown names still become `UNKNOWN`. No names, arguments, addresses, paths or source text are exported.

| Fixed category | Upstream class families | Primary versioned source |
| --- | --- | --- |
| `QT_PAINTER` / `QT_PAINT_ENGINE` | QPainter, QPainterPrivate, QPaintEngine, QPaintEngineEx | [QPainter header](https://raw.githubusercontent.com/qt/qtbase/v6.8.2/src/gui/painting/qpainter.h) and [raster engine](https://raw.githubusercontent.com/qt/qtbase/v6.8.2/src/gui/painting/qpaintengine_raster.cpp) |
| `QT_RASTER_PAINT_ENGINE` / `QT_RASTER_DATA` | QRasterPaintEngine, QRasterPaintEnginePrivate, QRasterBuffer, QSpanData | [raster engine implementation](https://raw.githubusercontent.com/qt/qtbase/v6.8.2/src/gui/painting/qpaintengine_raster.cpp) |
| `QT_IMAGE` | QImage, QImageData | [image implementation](https://raw.githubusercontent.com/qt/qtbase/v6.8.2/src/gui/image/qimage.cpp) |
| `QT_REGION` | QRegion | [Qt 6.8 public class documentation](https://doc.qt.io/qt-6.8/qregion.html) and its use in the pinned raster source above; the documentation tracks the 6.8 maintenance series, not the exact Debian binary |
| `QT_BACKING_STORE` | QBackingStore, QBackingStorePrivate, QPlatformBackingStore | [backing-store implementation](https://raw.githubusercontent.com/qt/qtbase/v6.8.2/src/gui/painting/qbackingstore.cpp) |
| `QT_OPENGL_CONTEXT` | QOpenGLContext, QPlatformOpenGLContext | [OpenGL context implementation](https://raw.githubusercontent.com/qt/qtbase/v6.8.2/src/gui/kernel/qopenglcontext.cpp) |
| `QT_PLATFORM_WINDOW` | QPlatformWindow, QWindow | [platform window implementation](https://raw.githubusercontent.com/qt/qtbase/v6.8.2/src/gui/kernel/qplatformwindow.cpp) |

This is upstream source justification for public categories, not evidence that those symbols are available in the stripped Debian package or that any family caused the crash. The existing privacy regression now exercises each new family with synthetic private method/argument text and requires only the fixed category. The coordinator reviewed this extension without a finding. Its no-GUI preparation/privacy regression passes 24/24; one reviewed ordinary native rerun now records a QT_PAINTER category and SIGSEGV. The actual result is retained separately and does not establish a cause.

## Reviewed read-only control versus placement

After the guest returns and source review passes, use the same fresh KWin Wayland environment, runtime, own GTK canary, script/queue protocol, relative timers, observation period and debugger wrapper. Change one command at the helper's existing second-command position: geometry read instead of placement. Keep initial geometry, final geometry, three native acknowledgements and the ordinary explicit stop of polling. The ordinary placement scenario retains its exact target/assertions.

Label the control `diagnostic read-only`, with `nativePlacementAttempted=false`; stable actual geometry and a quiet own-process observation period can establish that control only. It cannot satisfy the placement acceptance assertion. A diagnostic-complete result remains separate from ordinary native success. Do not hold a D-Bus reply past the watchdog to obtain the quiet period: observe the own compositor/client after polling has already stopped, with the same bounded quiet period in the compared scenario. No extra requests, focus, keys, renderer choice or repeated resize is added.

A control that survives while placement crashes would locate a trigger in the placement/configure/render sequence, without proving a specific faulty function or a safe production workaround. A control crash would redirect investigation to initial rendering/transport/lifecycle. Preserve either outcome, exact source/build hashes, actual signal categories and cleanup; do not silently substitute this control for the required placement or restart tests. The reviewed control is implemented with strict separate diagnostic status/exit. Its actual bounded run completes as diagnostic/exit 4, with no placement attempt or clipboard test, while ordinary placement on the same source still crashes. See the guest README and exact comparison report. Source fixtures remain distinct from those actual observations; no functional acceptance is closed.

## Source-only free-helper and symbol-state increment

The three initial `QT_GUI/UNKNOWN` frames in the finer placement artifact do not distinguish a missing GDB symbol from a named function outside the classifier. The next bounded observation adds `symbolState=ABSENT|CLASSIFIED|UNCLASSIFIED` to each frame. A missing/empty GDB name is `ABSENT`; other unrecognized names are `UNCLASSIFIED`, and recognized families are `CLASSIFIED`. Only the latter can have a non-`UNKNOWN` function category. Exact-key validation rejects arbitrary states, inconsistent pairs and raw/private fields. The 16-frame limit is unchanged. No nearest-symbol lookup, argument/local inspection, address export or symbol download is added.

The exact Debian package sources justify four additional fixed hypotheses:

| Fixed category | Internal prefix | Exact package source |
| --- | --- | --- |
| `QT_IMAGE_BLEND` | `qt_blend_` | [Qt base 6.8.2+dfsg-9+deb13u2, qblendfunctions.cpp](https://sources.debian.org/data/main/q/qt6-base/6.8.2%2Bdfsg-9%2Bdeb13u2/src/gui/painting/qblendfunctions.cpp), functions from lines 143–334 |
| `QT_IMAGE_SCALE` | `qt_scale_image_` | Same source, lines 93–138 and 413–460 |
| `QT_IMAGE_TRANSFORM` | `qt_transform_image_` | Same source, lines 463–548 |
| `QT_TEXTURE_FETCH` | `fetchTransformed` | [Exact Qt qdrawhelper.cpp](https://sources.debian.org/data/main/q/qt6-base/6.8.2%2Bdfsg-9%2Bdeb13u2/src/gui/painting/qdrawhelper.cpp), source-fetch and bilinear helper families from lines 906–1929 |

[KWin 4:6.3.6-1 ItemRendererQPainter::renderSurfaceItem](https://sources.debian.org/data/main/k/kwin/4%3A6.3.6-1/src/scene/itemrenderer_qpainter.cpp), lines 126–187, derives source/target rectangles and calls `QPainter::drawImage`. [The exact Qt raster drawImage path](https://sources.debian.org/data/main/q/qt6-base/6.8.2%2Bdfsg-9%2Bdeb13u2/src/gui/painting/qpaintengine_raster.cpp), lines 2199–2333, includes transform/scale dispatch. These sources motivate classification; no helper family is yet observed in the actual crash and no compositor renderer or root cause follows from the proposal. Stripping, inlining or another function may still produce `ABSENT`/`UNCLASSIFIED`.

This increment changes only the filter, source/privacy fixtures and documentation. Native KWin/window/renderer/backend/queue/placement/timer/quiet-period behavior remains the frozen comparison behavior. Historical artifacts retain their old source/schema and are not relabelled. A future ordinary diagnostic run needs coordinator review, exact hashes and a new guest reservation. If names are absent, additional prefix-only reruns would not resolve them; a separately reviewed own-client resize control could instead test whether placement is necessary for the observed failure. Such a control is not implemented or authorized here. All native acceptance remains pending.
