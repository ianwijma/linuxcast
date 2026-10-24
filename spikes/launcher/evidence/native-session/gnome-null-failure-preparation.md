# S0-01 GNOME null-actor and fixed failure diagnostics — preparation only

This source-only increment follows actual `gnome-x11-diagnostics/`: initial native identity/geometry succeeded, but no matching parsed reply arrived after Close. That evidence does not identify a cause. Mutter48.7 [documents the actor's Meta.Window as nullable](https://github.com/GNOME/mutter/blob/48.7/src/compositor/meta-window-actor.c#L590-L604), and disposal clears the associated window. The observer now filters null/undefined Meta.Windows before PID selection. This is a defensive repair, not proof of the prior runtime failure's cause.

After the entire fixed own-PID context is validated, native hook failures may return only the request and fixed `enumerate`, `launcher`, `decoy`, `activation` or `publish` stage with `native-read-failed`. No exception text, partial metadata, raw IDs or private values are exported. Invalid context emits no observation/failure. A failed request is consumed even if failure publication itself fails, preventing uncertain decoy activation replay. The driver treats matching fixed failures as terminal, retains the last fully parsed safe observation, and cannot turn them into a successful native result. Failed publication can still leave a missing reply; no native response is fabricated.

Strict TypeScript/Python schemas reject stale requests, unknown/nested private fields, malformed stage/outcome values, inconsistent failure states, forged success and KWin failure misattribution. Exact PID/app identity/backend/geometry/focus/lifecycle assertions are unchanged; KWin exact-XID selection is deferred. The unchanged supervisor remains SHA256 `0d26ee0a9e4f581bb53be2dd59576cd82976e66f3403e1fae3a1113d225c45bb`.

Offline validation on Pop!_OS22.04/Node24.22.1, with local private Unix socket permission but no GUI/native compositor:

- `node node_modules/vitest/vitest.mjs run spikes/launcher/tests/native-session/preparation.test.ts`:80/80 pass,3.56s. Synthetic hook execution covers nullable close transitions, foreign-PID metadata traps, all five fixed failure stages, invalid contexts and no replay when both publications fail. Public artifact fixtures cover valid incomplete failure plus private/stale/forged variants.
- Strict root TypeScript validation, affected ESLint, Python AST and `git diff --check`:pass.

Frozen seven-file source diff SHA256 `398c2679071404c723382a353889e97056f7e3b6049fe0aa1a120449c6bf62b8`, against signed parent `a3db48da3e371f0544c98fe67916ca823d94f2e5`. Checker SHA256 `d55f6c6a35fbaf00bd38dc15f6fa37cda68f7adfb0851d4a4477d958fbea0cde`; hook SHA256 `012d15627acb2f9b613d0786973ea5f67b398a03238fd9eabefd9492f35a27df`.

No native run or acceptance is established by these preparation checks. The successful KWin decoy-only run used the separately preserved signed7c archive and excluded this increment. Both X11 native gates and all physical/full-session, portal and broader UI/manual release gates remain pending. Native use requires independent source review and an exclusive coordinator reservation.
