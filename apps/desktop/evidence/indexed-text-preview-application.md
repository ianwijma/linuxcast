# Explicit indexed text preview application increment

29October2026; L2-03 with L2-02 UI integration. Task cards:
`docs/implementation/tasks/L2-03.md`, `docs/implementation/tasks/L2-02.md`.
This is a reviewed/tested unfinished increment; neither task is complete.

## Behaviour and boundary

Registered File search → native-selected/indexed folder → selected file →
Actions / Preview text → existing shared readonly Text view. Primary Details,
directory Browse and Copy path stay available. Escape/Back restores Results
query/selection/focus. Explicit Retry only after failure; no automatic reread.
Current selected result identity only crosses the named renderer API. Main owns
root/file metadata, foreground owner admission and query/generation freshness.
An elapsed four-second preflight cannot start a new late read; an already-started
read retains its slot until settlement. Text is discarded on navigation, source
generation/removal/index clear and disposal. No content index/cache/history,
network, external application, file mutation or plugin grant is introduced.

Existing fixed applications helper process performs one same-descriptor read:
Linux openat2 BENEATH/NO_SYMLINKS; selected relative file also NO_XDEV,
O_RDONLY/NOFOLLOW/NONBLOCK/CLOEXEC. Regular non-executable .txt/.text/.md/.csv/
.json/.log only, case-insensitive, <=64KiB, valid UTF8 with TAB/LF/CR permitted
and other C0/DEL refused. Indexed size/mtime and exact before/after fd
dev/ino/size/mtime/ctime checks reject stale or changing reads. Literal text
never goes through Markdown/HTML/link rendering. No original pathname reopen
or external handoff. Existing packaged helper deadline2.5s/output limits apply.

## Validation

- `bun run test:unit -- L2-03`:202PASS (91File search controller,29Copy
  presentation,3clipboard writer,79native process transport).
- `bun run test:contracts -- L2-03`:6PASS.
- `bun run test:security -- L2-03`:59PASS (28newpreview main,13existing
  fileIPC,8CopyIPC,10filepreload).
- UIauthor exactsigned1251b354:47Chromium keyboard/axe PASS (37File search,
  including12preview cases;10Copy),120focused controller/Copyunits PASS.
- `cargo test --locked -p linuxcast-platform`:20PASS in nativeauthor86a45c2
  (same integrated native tree), including7newpreview checks; strictprotocol,
  actual owned files, empty/exactlimit, invalidUTF8/controls/binary, executable/
  extension/large/FIFO/directory/symlink/stale/missing refusal, ancestor swaps
  and changedsize/same-size-restored-mtime snapshot rejection. Scoped rustfmtPASS.
- Fulltypecheck, scopedESLint, diffcheck and plan validation PASS. Production
  build66assets PASS. No dependency/lockfile/migration/newservice.
- `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a bun run test:integration -- L2-03`:
  actualproduction13.04s PASS. This duration is smoke evidence, not performance
  acceptance. Sandboxed Electron45/noNode renderer, real selected-root
  openat2/inotify/sole-ownerSQLite, real packaged reader and independentnative
  xclip. Only native chooser/confirmation choices instrumented. Public synthetic
  sources contain literal script/Markdown-looking text and Unicode. Explicit
  preview returns exact bytes; no script/link/image nodes or remote requests;
  no clipboard write. Escape restores original query/selection/focus. Paused
  changedsource refuses without displaying changed bytes; explicit deliberate
  retries only. Process restart remains paused; derived-index clear closes
  loaded preview, discards text and rejects saved old read/copy identity.
  Index clearing/removal preserve source bytes. Existing filters/navigation/
  nativecopy/watch/clear/cancelled+confirmedremoval/Quitwithwatcher pass.

Initial application harness waits relied on unchanged1row counts and immediate
ownerstate instead of debounced replacement results/rendererevent publication.
Corrected to exact selectedfilename and eventual preview removal; finalrun above
passes. No production workaround or unresolved failing check. Independentreview
P2 latepreflight-aftertimeout fixedb9dd63f, with deferredgetState regression.

## Design and review

DESIGN.md Shell and navigation; Results and actions; List/grid/detail/form;
States and motion; Accessibility; tokens.json. Existing host Text/ViewSession,
semantic controls/tokens, no featureCSS. Source text remains untrusted data.
Eight public component captures under file-search/evidence/*text-preview*.png
cover dark/light literal/loading/empty/error/invalid/unavailable/200% with
keyboard/axe. Actual public captures under universal-actions/evidence/: updated
application-dark/light-indexed-path.png, application-dark/light-text-preview.png
and application-text-preview-stale.png. No personal data/credentials.

All agents GPT-6.1 SOL/high. UIauthor1251b354 integratedd655af2; nativeauthor
86a45c2 integrated5a8f14f; coordinatorcontractafdf8d6/mainc049274/reviewfixb9dd63f.
Independent reviewer reconciled exactsigned UI/source/eightcaptures, main and
native source clean after timeout repair. Final actualtest/captures reviewed
separately before merge.

## Remaining acceptance

Partial L2-03 AC01/cardinality, AC02/source preservation, UI/privacy and L2-02
AC02/UI evidence only. Content indexing/extraction still needs per-root opt-in,
MIME/search/recentfile scope and budgets; manual preview does not enable it.
Full typed actions/multifilebuffer/large-text/image/PDF/open/open-with/reveal/
move/rename/trash/conflicts/terminal remain. Native Open branch
codex/indexed-file-open at8fdc37d is preserved, unavailable and unmerged:
unsafe originalpath GIO handoff removed, document-export candidate hard gated
after upstream O_NOFOLLOW consumer pathname-reopen finding. No safe Open success
claimed; native Open remains required and is not replaced by text preview.

Development Linuxamd64 Rust1.95/Node24.22.1/Bun1.4.4/Electron45/SQLite3.53.4/
privateXvfbX11 evidence does not establish Debian13 GNOME48/KDE6.3 Wayland/X11,
real native dialogs, assistive technology,200% actualElectron, installed package,
reference-system performance, broader prerequisites or release gates.
