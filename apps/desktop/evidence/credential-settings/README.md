# F2-02 credential settings application increment — 1 November 2026

Based on approved PR83 cd7bf0e. Main now owns a lazy CredentialRuntime and a
fixed OpenRouter credential settings service. Local data → Manage credentials
opens a separate sandboxed first-party window. New masked input is consumed once
through dedicated saveKey IPC; no stored key or opaque reference is returned.
Provider/model selection, authentication and network requests remain separate.

The user explicitly selects secure persistent or session-only storage. The main
checks current session and keyring status before/after native default-Cancel
confirmation. Replacement/removal affects only provider/openrouter-default.
Opaque pointer/policy metadata uses existing settings CAS, strict canonical JSON
and exact receipts; no migration. Credential preferences are excluded from the
settings export allowlist. Uncertain pointer/deletion results require review and
are never replayed automatically. An explicit Remove can clean remaining owned
records without touching another provider. The trusted use seam fences and aborts
old leases after confirmed replacement/removal; actual provider dispatch remains
A1-01 work and must independently call its freshness predicate before dispatch.

The default retains session-only values until Quit while denying use on lock,
inactivity or unavailable/stale observation. Explicit clear-on-lock also clears
on session loss. Storage-owner loss and suspend deny immediately. Resume/recheck
requires a newly observed generation after verified old-child shutdown. An unused
runtime does not launch on resume. Main drains the model/store/observer before the
sole repository owner closes. No Linux powerMonitor lock/unlock claim is made.

## Evidence and limits

Pinned Node24.22.1/Bun1.4.4/Rust1.95, Electron45.0.0, Chromium156.0.8078.48,
SQLite3.53.4; Pop!_OS22.04 amd64 development host, private authenticated Xvfb
1920×1080. This is not a supported Debian GNOME/KDE desktop session.

- `bun run test:security -- F2-02`:144mapped checks pass, including real private
  storage-owner opaque CAS/export/restart checks and synthetic session/keyring
  boundaries. `bun run test:unit -- F2-02`:52synthetic UI checks pass.
- `bun run test:contracts -- F2-02`:3checks pass. Typecheck/lint/frozen install,
  plan and whitespace checks pass. F1-02/F3-01 security regressions55/72pass.
- Mapped actual Electron F2-02 tests: diagnostics1/1passes5.31s; credential1/1
  passes4.87s before expanded keyboard/removal checks. Expanded credential test
  passes1/1 in5.55s, including native-window Escape/reopen and confirmed removal.
  Combined F1-02/F2-02/F3-01 integration union:6/6pass in48.69s. Final
  credential-only rerun including explicit invoking-window focus restoration:
  1/1pass5.60s. The current41-source manifest is verified separately.
- The credential test executes production main/preload/renderer/SecretStore and
  the actual isolated SQLite owner. A test-only wrapper replaces only the fixed
  credential-session child with an ordinary Python protocol stand-in and injects
  a denied basic_text safeStorage adapter. Native confirmations are instrumented.
  No production test bypass, command-line insecure-keyring flag or environment
  switch is added. No host system/session bus, keyring, real provider, input,
  reader or lab is accessed. These fixtures do not prove native observer/keyring
  behavior or atomic physical-lock detection.
- Actual flow verifies lazy startup; exact preload/no Node; empty/light/dark;
  explicit mode/basic-text denial; consumed cancelled/saved input; memory-only
  keys absent from SQLite/blob files; lock clears editable input and denies use;
  opt-in policy clears memory on inactivity; recheck reaps the old stand-in;
  keyboard removal/Escape/reopen; Quit exit0 and exact recorded child PIDs gone.
  Axe reports zero violations in captured states. No complete AT claim.

Screenshots: empty-dark/light, saved-session-light, locked-light; scaled-light is
an actual Electron viewport capture with the focused input visible at200% zoom
and no horizontal overflow (not a full-document capture). local-data-dark/light
show the new entry. All use synthetic fixtures with editable values cleared.
Original historical diagnostics screenshots are preserved. Initial fixture-only
corrections: controlled policy waits for confirmed metadata; keyboard removal
waits for the renderer button to enable; Escape may close before its automation
acknowledgement. A clipped Playwright zoom image was replaced by native capture.

Applicable design: DESIGN.md components/settings and permissions, states and
motion, accessibility, tokens and review gate. Shared host primitives/tokens only.
Independent Standards and Security/Spec review is still required before merge.
F2-02-AC01 and UI remain pending; historical AC02/privacy evidence is unchanged.
Actual native helper/keyring/provider flow, supported four-session Debian matrix,
high contrast/reduced motion/native AT and complete local1.0 gates remain open.

## Initial review corrections

Independent Standards review of1e769ed found P2 policy weakening from denied
sessions. Independent Security/Spec found P1 old concurrent status reads applying
an old clear policy, and P2 save success after lock cleared the new value. Parent
fixes fence snapshots by mutation generation/confirmed preference revision, keep
policy floors through in-flight changes, validate policy admission and completion,
perform only one protective stronger-policy CAS restoration after an acknowledged
weakening races denial, and recheck save eligibility/reference existence after IO.
Uncertain restoration/retained references stay needs-review, never auto-replayed.

Five new offline regressions pass, including a single-FIFO401-record paged
inventory interleaving, locked/inactive/unavailable policy denial, memory erased
during preference IO, lock/unlock cycles during policy acknowledgement, and failed
protective compensation. The three original finding regressions fail on an
isolated copy of reviewed1e769ed and pass on the fixed source. The complete144
security checks pass without skips; final typecheck/lint pass. Mapped actual F2
Electron rerun passes2/2 (credential5.25s, diagnostics5.65s), using the same
explicit synthetic observer/denied-keyring boundary. Original captures preserved
because UI source is unchanged. Final independent concurrency recheck is pending;
no new clean review, native, keyring, provider or acceptance claim is made.
