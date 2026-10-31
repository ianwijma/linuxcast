# Notes window — Instrument composition, actual Electron captures (U1-01 bounded UI refresh)

Captured from the production Electron 45.0.0 Notes window (read-only `ELECTRON_OVERRIDE_DIST_PATH`) by the
existing U1-01 integration flows:

- `apps/desktop/tests/notes.integration.test.ts`
- `apps/desktop/tests/notes-empty-trash.integration.test.ts`
- `apps/desktop/tests/notes-markdown-import.integration.test.ts`

The runs used:

- the Chromium sandbox (`chromiumSandbox:true`, no `--no-sandbox`);
- a private Xvfb from `xvfb-run -a -s "-nolisten tcp …"` with its xauth cookie;
- an isolated HOME/XDG profile;
- `env -u DBUS_SESSION_BUS_ADDRESS -u WAYLAND_DISPLAY`, with the test's own nonexistent bus path;
- `LINUXCAST_PRIVATE_DISPLAY=1`;
- Node 24.22.1 and Bun 1.4.4, with the pinned SQLite native module rebuilt in this checkout by `node apps/desktop/setup-sqlite.ts` (version not re-queried).

The flows use only their existing instrumented native chooser and confirmation responses, and synthetic
public note content. They made no host clipboard, keyring, provider, desktop, input, Orca or native-observer
calls. Each copy here is the same PNG the flow writes to its historical path, which was then restored, so
every historical `apps/desktop/evidence/*.png` is unchanged. The flows' own axe assertions (0 violations)
ran for each themed capture.

| Capture | State |
|---|---|
| `notes-application-dark-saved.png`, `notes-application-light-saved.png` | After an explicit confirmed Save: neutral controller message band, selected row with rail, bound `Ctrl` `S` keycap |
| `notes-application-native-zoom-200-light.png` | `webContents.setZoomFactor(2)` on the actual window, captured with `capturePage()`. Asserted: devicePixelRatio 2, stacked single-column panes, no horizontal overflow, the title keeps focus and stays in view; zoom reset to 1 |
| `notes-application-slash-native-zoom-200.png` | Open slash menu, then `setZoomFactor(2)`: the menu repositions on the zoom resize and is clamped inside the actual clipping region with internal scrolling. Asserted: active option and whole menu inside the region, hit-testable, body keeps focus; also asserted at zoom 1 before and after; captured with `capturePage()` |
| `notes-trash-confirm-application-dark.png` | Inline Trash confirmation, Keep note with `Escape` keycap |
| `notes-trash-application-light.png` | Trashed read-only note in the trashed collection |
| `notes-revision-preview-application-light.png`, `notes-revision-confirm-application-dark.png` | Saved revision preview and Restore-as-draft confirmation |
| `notes-application-pending-draft.png` | Durable draft acknowledged before the forced crash, not a Save |
| `notes-empty-trash-application-confirm-{dark,light}.png` | Whole-Trash confirmation with count, default Keep notes and `Escape` keycap |
| `notes-markdown-import-application-review-{dark,light}.png` | Read-only Markdown import review |

Limits: a private Xvfb X11 display on Pop!_OS 22.04 amd64 (Linux 7.1.1). This is not Debian 13, GNOME or KDE
on Wayland or X11, Orca, native high contrast or release acceptance. U1-01 task, native, desktop, AT and
release acceptance remain pending.

## Coordinator integration on approved PR91/PR92

Opus source `e896a13` is integrated unchanged at `ec55310` on approved
`8de8612` (PR92), including the PR91 renderer. All five root-query selectors
retain the merged combobox role. The two old-base search-limit unit failures
are resolved by PR91's existing test-only5614-command boundary correction;
no Notes controller or search behavior changes were needed.

Current corrected coordinator checks pass:482 units,36 contracts,258 security,
101 browser cases (74/53.8s and27/18.2s),40 integrations46.54s, full typecheck,
lint, plan and whitespace. Actual sandboxed private-Xvfb Notes30.564s,
EmptyTrash5.557s and MarkdownImport5.512s retain original owner/restart/crash/
receipt/no-replay/privacy assertions. All28 new captures (15 component,13 product)
remain author-identical; incidental historical and Instrument recaptures restored.

Initial independent Security/Spec review `fa38a7fc` of frozen `ec55310` is
clear:301 focused units,14 synthetic Chromium boundary probes, all25 original
captures and semantic/product assertions pass. Standards `00e3b125` found one P2
slash-menu visibility regression. Original Opus5.5medium author corrected it in
`e5a5b8c`, integrated `041f723`: bounded caret anchoring intersects the viewport
and every clipping/scrolling ancestor, with active-option scrolling confined to
the menu. Parent independently ran all four new100/150/200/narrow cases separately
against original `e896a13` (four fail), restored fixed source (four pass), and
inspected all three new captures. The actual Electron flow also checks the open
menu across zoom1→2→1. Editor focus/caret/scroll and input guards remain intact.
The initial P2 is parent-verified resolved; no second independent final clean
review or native/full-task acceptance is claimed.
