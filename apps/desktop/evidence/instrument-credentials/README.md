# Credentials window — Instrument settings composition (F2-02 UI refresh)

Captured from the production Electron window by `apps/desktop/tests/credentials.integration.test.ts`.
The run used the Chromium sandbox (no `--no-sandbox`), a private Xvfb started with `-nolisten tcp` and an
xauth cookie, and an isolated HOME/XDG profile. `DBUS_SESSION_BUS_ADDRESS`, `DBUS_SYSTEM_BUS_ADDRESS` and
`WAYLAND_DISPLAY` were unset, and `LINUXCAST_PRIVATE_DISPLAY=1` was set. The Electron 45.0.0 override was
read-only. The fixtures are the ones the test already had:

- an ordinary Python stand-in for the session observer, which speaks the frozen protocol only;
- a denied `basic_text` safeStorage adapter;
- instrumented native confirmation responses;
- synthetic `SYNTHETIC_*` entries.

The run made no keyring, provider, host-bus, input, Orca or native-observer calls. The `capture()` helper
asserts that the masked field is empty and that no `SYNTHETIC_` text is in the DOM before every
screenshot. Axe reports 0 violations for every capture and for the 200% state.

The historical captures in `apps/desktop/evidence/credential-settings/` are unchanged. They record the
previous appearance.

Design references:

- [DESIGN.md](../../../../docs/design/DESIGN.md): Instrument direction (shape-coded states, edge detail),
  Tokens, Controls/keycaps/line icons, Settings and permissions (capability rows: name | glyph + word |
  backend; masked credential; explicit choices), States and motion, Accessibility.
- Selected proposal `docs/design/proposals/raycast-refresh/opus/`: Workspace frame header, Settings
  (permission-card radio fieldset, capability rows, Re-check), State plate band.

Credentials is a focused settings detail window. It has no category sidebar, search, deep link or back
navigation, and it does not set up a provider or model.

| File | State |
| --- | --- |
| `credentials-dark.png`, `credentials-light.png` | Initialized empty workspace. Shows the header (system tile, “Credentials”, Close with the bound `Escape` keycap), the page title (focused on open, as before), the Empty plate, and the session/storage rows: Unlocked, Refused · `basic_text`, Session-only Available. Neither radio is selected and Persistent is disabled with its reason. |
| `credentials-keyboard-focus-light.png` | Keyboard only. Tab order from the title is Recheck status → New API key → Session only radio → Cancel entry → policy checkbox. Disabled Remove and Save are skipped. The capture shows the focused radio. |
| `cancelled-light.png` | Native confirmation cancelled. The Cancelled plate says “Operation cancelled” and asks you to review the current status below before acting again; nothing is replayed. It makes no claim that anything was preserved or rolled back, because main does not guarantee rollback. The input is cleared and the confirmed refresh reports `none`. Nothing is claimed as success. Recaptured in the wording correction; the other 8 captures are unchanged from `2ea07e8`. |
| `saved-session-light.png` | Confirmed session-only save. The Done plate says “local save confirmed, provider authentication has not been checked”, and the stored plate repeats that saved status is not authentication. |
| `locked-light.png` | Lock reported. Unsubmitted input is cleared, the field is read-only, the Session row shows Locked, both storage modes are Unavailable with reasons, and the policy checkbox is disabled. |
| `removed-light.png` | Keyboard `Enter` on Remove key…, then the instrumented confirmation. The Done plate appears only after the `removed` reply, and the confirmed snapshot shows Empty. |
| `credentials-forced-colors-reduced-motion.png` | Chromium `forcedColors: active` plus `reducedMotion: reduce` emulation on the real window. Cards, rows and plates get system-colour borders, only the chosen mode is outlined (Highlight), and unavailable modes use GrayText. |
| `credentials-200-percent-focus.png` | Native `setZoomFactor(2)`, which uses the narrow layout (rows stack). There is no horizontal overflow, and the focused input and the Tab-focused Session-only choice are fully inside the viewport. This is a native `capturePage` viewport capture, not a full document. |

## Validation (this increment)

Pop!_OS 22.04 amd64 development host. Pinned Node 24.22.1 and Bun 1.4.4, Electron 45.0.0, Vitest 4.1.12.

- `bun run test:unit -- F2-02`: 86/86 pass. That is 71 credential tests (the original 52, 18 new
  Instrument regressions and 1 cancelled-wording regression) and 15 Local data tests. The cancelled-wording
  regression (a cancelled reply followed by a confirmed `none` refresh) fails against the `2ea07e8`
  wording and passes with the fix.
- `bun run test:contracts -- F2-02`: 3/3 pass. `bun run test:security -- F2-02`: 144/144 pass.
- `bun run typecheck`, `bun run lint`, `python3 scripts/validate_plan.py` and `git diff --check` pass.
- Credential product flow (`LINUXCAST_TEST_FILES=["apps/desktop/tests/credentials.integration.test.ts"]`
  with the Vitest runner config, harness above): 1/1 pass in about 20 s, including the build.

## Limitations

- This is Chromium/Xvfb evidence only. It makes no claim about Debian 13, GNOME/KDE, Wayland, Orca, a
  native high-contrast theme, physical native-dialog interaction, the actual native session observer,
  the OS keyring or the provider.
- Some states are covered only by synthetic-bridge component tests in
  `packages/secrets/src/ui/credentials.test.tsx`, not by product captures: initial loading, read
  error/retry, refresh failure, regressing revision, server busy, needs-review, stale/conflict, unknown or
  malformed replies, permission-denied, invalid-request and unavailable action errors, IME composition,
  and unmount/replaced API.
- F2-02 stays in progress. AC01 and the UI criterion are pending actual native observer, keyring,
  provider, Debian four-session and Orca evidence. The historical AC02 and privacy results are unchanged.
  This increment promotes neither the task nor local 1.0.
