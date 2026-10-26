# Next application increment: launcher-selected saved workflow entry

Build on merged PR43/6feaf583. Actual flow: root registers the saved workflow's
Keyword commands in the launcher → user searches/navigates/activates one →
existing saved run workspace opens with that entry selected → explicit Run →
existing broker approval/real effect/result. Opening never executes or approves.
Full1.0/task/native/AT/release scope is unchanged.

Bounded UI author W2-03 owns only desktop/src/features/workflows/debugger/**,
branch codex/w2-03-launcher-entry-ui in existing linuxcast-l1-01 worktree from
6feaf583. Required card W2-03; workflows/security/testing-release/DESIGN/tokens
norms. Existing shell/editor/storage/run/broker are actual integrated code;
full W2-02/F3/W1/W2 acceptance remains pending under approved unfinished increments.
Coordinator owns all shared contracts/registration/opaque identities/main IPC/
preload/canvas entry routing/registry/build/manifests. No infrastructure/research/
proof work for UI author.

Frozen UI extension: WorkflowRunPanel accepts optional `initialEntry?:string`.
WorkflowRunController can receive the same optional fourth constructor argument.
Undefined retains current first enabled Keyword default. Provided ID selects
exactly that enabled Keyword in savedDefinition. Missing/disabled/wrong-type ID
is visibly unavailable and cannot start; never silently select the first entry.
Props are presentation only; main still fresh-loads saved revision/identity and
validates entry/input before any work.

A changed intent/entry can reattach through get+subscribe but never start/cancel/
approve/replay. Existing active run/approval remains actual host state and can
still be inspected/cancelled even if the requested entry is unavailable. Run
cannot be switched while active. After terminal, a fresh explicit invocation
uses the requested valid entry. Existing once/persistent/deny/reset/unknown/
identity/sequence/IME/heldEnter behavior remains.

Deliver the smallest source/controller/Chromium checks and inspected affected
dark/light states with a signed owned-path commit. Test valid second entry,
invalid/disabled entry, changing presentation while approval is pending, no
mount/autostart, and explicit selected-entry request identity. Distinguish
controlled component evidence from root actual launcher/clipboard integration.
No new generic API, graph executor, grant store, scheduler, process harness or
research. Do not claim full task acceptance.
