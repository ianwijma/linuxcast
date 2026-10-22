# Native workflow architecture and implementation specification

Status: approved v1 specification; no workflow runtime is implemented by this planning PR. Scope is Debian 13 GNOME/KDE, Wayland/X11, local-first operation, native Linuxcast formats and all applicable local workflow capabilities. Evidence is in [Alfred research](../research/alfred.md); requirements in this document are Linuxcast design decisions unless explicitly attributed.

Read [DESIGN.md](../design/DESIGN.md) before building any editor, inspector, result view, form, error or confirmation UI. Reuse the declarative views and permission broker from [extensions.md](extensions.md), desktop/input transactions from [linux-integration.md](linux-integration.md), security policy from [security.md](security.md), and model routing from [ai.md](ai.md). Track implementation in [ROADMAP.md](../implementation/ROADMAP.md).

## 1. Product boundary and ownership

A workflow is a versioned graph of typed nodes with a human-readable native JSON definition, optional packaged scripts/assets, and user-local configuration. It can be authored visually or as JSON. The visual editor and runtime must use the same node registry and validators.

The seven palette categories are Triggers, Inputs, Actions, Automations, User Interface, Utilities and Outputs. Their categorization reproduces a useful authoring model; their implementation and identifiers are native. Additional native triggers, HTTP/AI nodes and bounded control flow use those same categories.

V1 includes local install/export/update, all graph/editor/runtime capabilities below, and the ten example specifications. There is no .alfredworkflow importer, AppleScript runtime, macOS Shortcuts bridge, online marketplace requirement or mobile app. A local authenticated external trigger is included; remote pairing is a future transport.

Suggested package ownership:

| Package / subsystem | Owns | Must not own |
| --- | --- | --- |
| contracts | Schemas, error codes, versions, typed values and permissions | Electron, filesystem effects |
| workflow-core | Validation, graph compilation, bindings, scheduling, cancellation | Native calls or rendering |
| workflow-nodes | Built-in pure operations and typed broker adapters | Raw OS privileges |
| workflow-script-host | Sandboxed scripts and native result protocol | UI renderer or credential store |
| workflow-editor | React Flow graph, inspector, palette, debugger | Execution authority |
| workflow-packages | Native archive lifecycle and migrations | Automatic install-time execution |
| host brokers | Files, clipboard, desktop, AI, notifications, browser | Interpretation of arbitrary graph code |

Dependency direction: contracts -> core/registry -> mock brokers -> editor and nodes -> real brokers -> integration fixtures. Editor development must not wait for native window/clipboard integration.

## 2. Native package, graph and configuration

The .linuxcast-workflow file is a ZIP container defined by Linuxcast, containing:

~~~text
workflow.json
README.md
assets/...
scripts/...          optional source files
integrity.json       generated file SHA-256 manifest
~~~

The graph file is UTF-8 JSON. Archive extraction, signature/integrity limits and atomic activation use the shared [package contract](extensions.md#package-lifecycle). No install hook, arbitrary executable migration or automatically enabled typed/hotkey/scheduled trigger is permitted. A local package can be unsigned; provenance is shown honestly.

~~~ts
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Binding = { literal: Json } |
  { ref: string } |                 // "input#/0", "vars#/name", etc.
  { template: string };            // "{{vars.name}}"; scalar expansion only

interface WorkflowV1 {
  schemaVersion: 1;
  id: string;                      // reverse-DNS, immutable package identity
  version: string;                 // SemVer
  name: string;
  description: string;
  author: { name: string; url?: string };
  license: string;                 // SPDX identifier/expression
  minHostVersion: string;
  permissions: PermissionRequest[];
  settings: SettingDefinition[];
  defaults: {
    runTimeoutMs: number;
    maxNodeExecutions: number;
    maxConcurrentNodes: number;
  };
  nodes: NodeV1[];
  edges: EdgeV1[];
  subgraphs?: Record<string, SubgraphV1>;
  editor: {
    positions: Record<string, { x: number; y: number }>;
    notes: Array<{ id: string; text: string; nodeId?: string; x: number; y: number }>;
    viewport?: { x: number; y: number; zoom: number };
  };
}

interface NodeV1 {
  id: string;                      // unique stable ID in this graph
  type: string;                    // e.g. "utility.transform"
  typeVersion: 1;
  label?: string;
  config: Record<string, Json>;    // validated by node-specific schema
  disabled?: boolean;              // disabled node blocks its stream
  timeoutMs?: number;
  onError?: "stop" | "route";      // default stop
}
interface EdgeV1 {
  id: string;
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: "in" };
  order: number;                   // unique per source port, ascending
  activation?: { modifiers: Array<"Ctrl" | "Alt" | "Shift" | "Super"> };
  keepLauncherOpen?: boolean;      // default true between UI nodes
}
~~~

PermissionRequest and SettingDefinition are shared with the extension specification. The registry exports complete JSON Schema definitions; illustrative TypeScript does not replace runtime validation. Reject unknown execution fields, duplicate object keys, non-finite numbers, prototype-related keys and unresolved node/port/version references. Preserve editor notes/positions as inert data.

Default limits: 1,000 nodes, 4,000 edges, 16 subgraph nesting levels, 10,000 node activations/run, 4 concurrent nodes/run, 8 active runs globally, 100 queued explicit runs, 1 MiB serialized value/envelope, 10,000 array elements. Run timeout defaults to 600,000 ms including waits; authors may configure up to 86,400,000 ms, subject to host policy. All limits produce explicit errors, not silent truncation.

Settings have text, secret, number, boolean, enum, file, directory and application kinds, descriptions, required flags and validation. User values live outside packages, keyed by workflow ID. Secrets are credential-store handles. File/directory settings resolve to grants, not magic absolute-path permission. Hotkeys, trigger enabled state, app scopes and schedule enablement are machine-local overrides. Export removes all local values, permissions grants, run history and trigger bindings.

### Minimal complete graph specification

This JSON is a schema example to implement and test, not executable application code in this PR. It accepts a keyword argument, normalizes it and copies the result. Titles and UI rendering still follow DESIGN.md.

~~~json
{
  "schemaVersion": 1,
  "id": "org.linuxcast.examples.trim",
  "version": "1.0.0",
  "name": "Trim Text",
  "description": "Remove surrounding whitespace and copy the result",
  "author": { "name": "Linuxcast" },
  "license": "GPL-3.0-only",
  "minHostVersion": "1.0.0",
  "permissions": [
    { "id": "clipboard.write", "reason": "Copy the text you submit" }
  ],
  "settings": [],
  "defaults": {
    "runTimeoutMs": 600000,
    "maxNodeExecutions": 10000,
    "maxConcurrentNodes": 4
  },
  "nodes": [
    {
      "id": "start",
      "type": "input.keyword",
      "typeVersion": 1,
      "config": { "keyword": "trim", "argument": "required", "trimQuery": false }
    },
    {
      "id": "trim",
      "type": "utility.transform",
      "typeVersion": 1,
      "config": { "operation": "trim", "source": { "ref": "input#/0" } }
    },
    {
      "id": "copy",
      "type": "output.clipboard",
      "typeVersion": 1,
      "config": {
        "text": { "ref": "input#/0" },
        "paste": false,
        "history": "exclude"
      }
    }
  ],
  "edges": [
    { "id": "e1", "from": { "nodeId": "start", "port": "out" }, "to": { "nodeId": "trim", "port": "in" }, "order": 0 },
    { "id": "e2", "from": { "nodeId": "trim", "port": "out" }, "to": { "nodeId": "copy", "port": "in" }, "order": 0 }
  ],
  "editor": { "positions": { "start": { "x": 0, "y": 0 }, "trim": { "x": 280, "y": 0 }, "copy": { "x": 560, "y": 0 } }, "notes": [] }
}
~~~

## 3. Values, bindings and variable rules

~~~ts
interface Envelope {
  args: Json[];
  vars: Readonly<Record<string, Json>>;
  context: {
    runId: string;
    workflowId: string;
    workflowVersion: string;
    triggerNodeId: string;
    invocationTime: string;        // ISO 8601 UTC
    locale: string;
    timezone: string;              // IANA identifier
    targetToken?: string;         // opaque, never a mutable "front app" lookup
    queryRevision?: number;
    callChain: string[];
  };
}
interface FileRef {
  kind: "file";
  grantId: string;
  entryId: string;
  displayName: string;
  displayPath?: string;            // presentation only, not an authorization
}
interface NodeResult {
  outputs: Array<{ port: string; envelope: Envelope }>;
}
interface WorkflowError {
  code: string;
  message: string;                 // safe for the user
  nodeId: string;
  retryable: boolean;
  details?: Json;                 // sanitized; no credentials or raw key buffer
}
~~~

The registry's typed schemas constrain JSON values further. No functions, dates as class instances, DOM objects, file descriptors or prototype-bearing objects cross runtime boundaries. File/URL/contact/application values carry explicit kinds; never infer authorization from a display string.

Binding references use a namespace followed by an RFC 6901 JSON Pointer: input refers to args; vars to branch-local variables; settings to the validated user configuration; context to readonly invocation metadata; item to the current bounded-loop item; error to the routed error. Namespaces are not searched implicitly. Missing paths fail with BINDING_NOT_FOUND; null is a real value. A literal wrapper avoids conflicts with objects containing ref/template keys.

Templates support only dotted scalar paths such as "{{vars.customer}}". Parse left to right: "{{{{" emits a literal "{{", and "}}}}" emits a literal "}}"; all other unmatched delimiters fail validation. The editor provides an escape insertion action. They do not execute expressions. Object/array interpolation fails with BINDING_TYPE; use explicit JSON stringify/join nodes. Keys containing dots require a JSON Pointer binding instead. File paths, URLs and argv have dedicated typed builders instead of automatic shell escaping.

Variables follow these rules:

- Package settings are readonly. A variable with the same name occupies the separate vars namespace.
- An args/variables node evaluates all assignments against its incoming snapshot, then applies them atomically. Deleting a variable requires deleteKeys; null does not delete.
- Leaving args unspecified preserves the entire array and types. Replacing args requires an explicit array of bindings; joining is a separate operation.
- Each fan-out receives its own immutable snapshot. No sibling branch may modify another branch's vars.
- UI row variables merge over run variables; an action's variables merge over that row. This is a native rule, not Alfred's replacement behavior. The editor previews the resulting scope.
- Secrets are handles usable only by approved broker operations. They cannot be interpolated into a label, debug log, clipboard output or exported file. There is no extension/workflow raw-secret-read capability. The shared SecretStore uses OS-keyring-backed safeStorage encrypted blobs, rejects basic_text, and falls back only to nonpersistent session credentials when the secure keyring is unavailable; see data.md.
- Persistent workflow storage is a separate API with versioned keys and transactions; vars never silently persist across runs.

## 4. Graph execution and cancellation

Compile the graph before enabling it. Reject cycles in ordinary edges. Loops are explicit bounded subgraphs; recursive cross-workflow calls are rejected by the call-chain check. A subgraph has one entry and explicit return/error exits.

A run snapshots the graph version, configuration and granted capabilities. Updating or editing a workflow never changes an active run. A node activation receives one envelope and may emit to named ports. Multiple outgoing edges clone the envelope and are enqueued in ascending order; scheduler start order is deterministic. Independent asynchronous completion order is not guaranteed. If ordering of effects matters, connect them in sequence.

Multiple inbound edges are independent activations, not an implicit join. Junction is only routing. Join Arguments joins data within one envelope; it never waits for branches. Use utility.parallel or utility.foreach for structured collection.

- utility.parallel executes named child subgraphs with independent snapshots, concurrency default 4, and returns results in declaration order. collectErrors defaults false: wait for all children, then fail with PARALLEL_FAILED if any failed. When true, return per-branch status/args/error. Child vars do not merge automatically.
- utility.foreach executes one child subgraph over an array, maximum 1,000 iterations, concurrency default 1 (maximum 8). Output order matches input order, including collected errors. It exposes item value/index and emits one collected array. Default first error cancels remaining iterations.
- utility.repeat supports a condition and maximumIterations, required and bounded at 1,000. Default maximum is 100 if added through the UI. Condition is evaluated before each iteration. Only its designated loop-state variables carry between iterations.
- Delay awaits a cancelable timer; it never sleeps an executor thread. Maximum delay is 24 hours and still counts against run timeout.

Run states are queued, running, waiting-ui, cancelling, succeeded, failed, cancelled and interrupted. Closing a workflow-owned view or pressing its Cancel stops its interactive run. Merely hiding the launcher for an explicitly detached action does not cancel that action. Background execution requires an enabled background/schedule permission and has no authority to steal focus.

Cancellation propagates an AbortSignal to every node and broker call, terminates pending query jobs, closes UI subscriptions, revokes pending insertion tokens and stops process groups. Script cancellation sends TERM, waits 500 ms, then KILL to the sandbox process group. Late responses are ignored using run ID, node invocation ID and query revision. Cancellation is never converted to success.

Interactive runs never automatically replay after client crash/restart. Mark them interrupted and show resumable input/output where safe; starting again is an explicit new invocation. Scheduled workflows use the single scheduler and prepared/dispatched/completed checkpoints in [data.md](data.md#durable-scheduler-semantics). Recovery may resume only declared safe checkpoints with fresh grants. A dispatched effect with unknown outcome requires review, never blind retry. Already completed file/network effects cannot generally be rolled back. The UI must not claim transactionality for an entire graph.

Each node defaults to one attempt. An author may request up to three attempts only for nodes the registry marks retry-safe; use 200 ms exponential backoff, bounded at 2 s, and a shared deadline. Writes, sends, clipboard insertion, application actions and scripts are nonretryable by default. Local storage mutations can use host-generated idempotency keys; this does not create an exactly-once guarantee for external systems.

On failure, default behavior stops the run and cancels outstanding descendants. With onError="route", emit only the error port with the original args/vars plus readonly error. An unwired error port is a visible failure. No silent continuation with an empty string.

## 5. Interactive query and result protocol

The script-filter concept must be first-class. It is not a shell command executed for every render.

Configuration defaults: argument optional; query trimming false; debounce 150 ms; first nonempty character immediate; execution mode cancel-previous; timeout 10 s; output frame limit 1 MiB; page size 100 (maximum 500). Alternative modes are queue-latest (one running plus one latest pending request) and run-once (host filters a stable result set). Intermediate queued queries are discarded.

The host owns queryRevision, selection identity, accessibility and actions. The newest query always wins even if an older process ignores cancellation. Query functions may return search data and cache writes, but must not mutate host files, send messages or invoke desktop effects until a user activates a row/action.

~~~ts
interface NativeResultsV1 {
  protocolVersion: 1;
  queryRevision: number;
  items: ResultItem[];
  nextCursor?: string;             // opaque pagination token
  refreshAfterMs?: number;         // min 250, max 300000; absent = no refresh
  cache?: { ttlMs: number; staleWhileRevalidate: boolean };
}
interface ResultItem {
  id: string;                     // stable within provider; required
  title: string;
  subtitle?: string;
  icon?: IconRef;
  args: Json[];
  variables?: Record<string, Json>;
  enabled?: boolean;              // default true
  disabledReason?: string;
  matchText?: string;
  autocomplete?: string;
  preview?: PreviewRef;
  copyText?: string;
  largeText?: string;
  actions?: Array<{
    id: string;
    title: string;
    port: string;
    modifiers?: Array<"Ctrl" | "Alt" | "Shift" | "Super">;
    args?: Json[];
    variables?: Record<string, Json>;
  }>;
}
~~~

Host-filtered matching modes are exact-prefix, word-prefix-any-order, word-prefix-in-order and fuzzy. Default is word-prefix-any-order, case-insensitive with locale-aware normalization. Preserve original title/text for display. Frecency is opt-in per result provider; preserve author ordering otherwise. Distinct IDs are required; duplicate IDs reject the update instead of selecting the wrong row.

Caching keys include workflow ID/version, node ID/config hash, query, locale and relevant settings fingerprint; credentials are represented only by a nonsecret version marker. Default caching is off. TTL is 1 s to 24 h; stale results are visibly marked and can never bypass revalidation before an effect. Rerun timers stop when the view disappears. Timers and network requests are not background polling permission.

Action shortcuts use exact normalized modifier sets; ambiguous duplicate action bindings are invalid. Primary Return selects the row's default out action. A disabled row never runs; Tab may populate autocomplete. Escape goes back/cancels through the common navigation contract. Result content is data; it cannot supply DOM/CSS/JavaScript.

## 6. Node registry and complete category coverage

Every node registration includes type/version, category, title, description, config JSON Schema, input/output schemas, required permissions, capability probes, timeout, retry classification, editor fields, examples and executor. Schema-derived inspectors and runtime validators must agree.

### Triggers

| Native type | Config / output / behavior |
| --- | --- |
| trigger.hotkey | Machine-local binding, optional app allow/exclude scopes; capture mode none/text/files/URL. Produces a typed selection only through the selection broker. New bindings disabled until configured. |
| trigger.snippet | Trigger-registry ID, scope and expansion modes. Receives trigger ID plus target token; no raw keystream. Ordinary snippet/workflow conflicts are explicit. |
| trigger.external | Stable trigger name, accepted input schema and permitted caller IDs. Same-user authenticated IPC/CLI; no default listening TCP server. External URL/deep-link requests require user mediation and cannot supply secrets. |
| trigger.fileAction | MIME filter, minimum/maximum item count, read/write purpose. Input array consists of granted FileRefs. |
| trigger.universalAction | Accepted kinds text/url/file/contact; all items must match or UI explains unsupported items. Never coerce arbitrary strings into file grants. |
| trigger.contactAction | Contact field kind and allowed action; receives selected field value and contact reference. |
| trigger.fallback | Keyword/query shown as a fallback row; runs only when activated, not merely displayed. |
| trigger.schedule | Local interval or calendar schedule through the shared [data scheduler](data.md#durable-scheduler-semantics). Default disabled, minimum interval 60 s, per-automation concurrency one with pending occurrence coalescing. Default runs the latest missed occurrence once on resume; explicit skip policy available. Skip nonexistent DST time; choose first repeated occurrence. Persist occurrence identity; never replay a backlog or an unknown dispatched effect. |
| trigger.remote | Reserved transport registration referencing trigger.external; nonselectable until a supported paired transport exists. Local command-button invocation uses trigger.external in v1. |

### Inputs

| Native type | Config / output / behavior |
| --- | --- |
| input.keyword | Keyword, required/optional/none argument, optional title/icon. Required waits for nonempty query; none stops matching once arguments appear. Outputs submitted query as args[0]. |
| input.fileFilter | Granted roots, filename/content query, MIME/extension/tag constraints, sort and result cap. Uses index/file broker and selected FileRefs. |
| input.runningApps | Query/filter of user graphical apps; selected ApplicationRef. Capability-gated per desktop; never enumerate system daemons as apps. |
| input.dictionary | Language/provider and spelling/definition mode; selected text/definition through dictionary service. |
| input.list | Static or bound array of ResultItems, matching mode, selection count default one. Host filtering only, no script execution. |
| input.scriptFilter | Declared runtime/script, argv bindings, query behavior and NativeResultsV1 output. Sandboxed through the shared runner; malformed JSON displays a useful error and preserves prior valid rows as stale. |

### Actions

| Native type | Config / output / behavior |
| --- | --- |
| action.open | FileRefs/URLs plus optional ApplicationRef; validate each target and dispatch through host. Return per-item opened/failed status. |
| action.launch | One or more ApplicationRefs; array of separate argv values only. Default no terminal/shell interpretation. |
| action.reveal | FileRefs -> file-manager reveal request; fallback opens parent folder and explains missing item-selection capability. |
| action.browse | Granted directory -> Linuxcast file navigator; output chosen files. |
| action.terminal | Directory and explicit command/executable arguments. Visible host terminal needs terminal.launch permission; package cannot silently substitute arbitrary shell text. |
| action.actionsPanel | Typed payload -> common action panel; invoking a selected action is a deliberate user event. |
| action.fileBuffer | get/add/remove/clear; preserve insertion order; deduplicate by canonical file identity, not basename. |
| action.webSearch | Search-template ID and query -> encoded URL; open only upon execution. |
| action.openUrl | Validated URL and browser selection; allow https/http/mailto/tel by declared scheme, reject javascript/data/file URIs unless a specific safe broker handles them. |
| action.script | Bundled Node or approved sandbox runtime, source path, argv, input/output mode and timeout. Never interpolate data into script source. |
| action.http | Brokered request with allowed origins/methods, structured headers/body, response limit and deadline. No ambient cookies; redirects reauthorize. Default GET, 10 s, 1 MiB body; reject private-network targets unless separately granted. |
| action.ai | Prompt binding, explicit attachments and output schema; uses the one configured provider/model by default. No API keys in graphs. Cancellation/streaming through AI broker. |
| action.workflow | Target workflow/trigger, typed argument bindings and declared vars; reduced grants, validated call chain, max depth 16. Await result or explicitly detach where permission permits. |

The functional replacement for NSAppleScript is a typed native automation or an explicitly sandboxed script. Do not create an NSAppleScript-shaped node that always fails on Linux.

### Automations

automation.task invokes a versioned task ID with typed parameters. automation.system and automation.media are convenient specialized inspectors for the same host registries. automation.workflow replaces Run Shortcut using action.workflow semantics. Tasks never embed an unchecked shell command.

The v1 task catalogue must expose the following native operations, each with its own schema and tests. This is a Linuxcast operation specification, not a copied Alfred task list:

| Family | Operations and exact policy |
| --- | --- |
| Arrays | count, first/last/slice/drop, append/prepend per string, filter/inverse-filter, reverse, stable sort, shuffle and sample. Empty first/last returns null; out-of-range slices return an empty array. Seeded randomness is available only in fixtures; production random values use an appropriate random source. |
| Text | trim, case conversion, normalize Unicode, split/join lines, remove empty lines, number lines, select columns, prefix/suffix lines, regex match/replace, extract URLs, metrics, checksum, Base64 and URL encode/decode. Regex uses a linear-time engine; invalid UTF-8/encoding is an error, never guessed. |
| Date/time | now, parse with explicit format/locale, format, add duration/calendar units, timezone conversion. Persist UTC instants plus IANA zone. Ambiguous/nonexistent local times require an explicit disambiguation choice. |
| JSON | parse/stringify/pretty-print, keys, JSON Pointer lookup, array-to-args/args-to-array. No dynamic code evaluation or arbitrary prototype construction. |
| Files | list/read/create, stat/MIME/hash, path parts, copy/move/rename/duplicate, new directory, symlink with explicit destination, mode executable-bit change, age/type filtering, tags/comments and trash. No-follow handling and grant checks apply at the operation, including symlink resolution. Missing inode birth time is null. |
| Folder synchronization | Produce a difference plan, preview additions/overwrites/deletions and require confirmation bound to that plan hash. Never map a normal copy node to destructive mirroring. |
| Images | dimensions/format, crop anchored center/corner, resize width/height/percentage/longest side/exact, rotate, flip, convert and optimize. Use the host media worker; outputs default to new files and preserve originals. |
| PDFs | combine images/PDFs, extract pages/text and render pages to images. Use sandboxed parser workers; outputs new files, explicit page ranges and limits. |
| Desktop appearance | Read/set/toggle supported color scheme; read/set/randomize wallpaper from a granted folder. Capabilities and DE-specific behavior are visible. |
| Applications | List/get focused/query running/open/graceful quit/relaunch; quit-all has an exclusion list and preview. Force quit is a separate confirmed action. |
| Menus/windows | Enumerate/invoke supported app menus; get screen/window bounds, move/resize/preset placement and transfer monitor. Apply the same GNOME/KDE adapter capability checks as built-in commands. |
| Clipboard/input | Read/write/clear with permissions, private transient snapshot/restore, image copy, insert text and key combinations using target tokens. A snapshot is memory-only and expires; scripts cannot obtain global key events. |
| Browser | Tabs/current tab, URL/title, search/match, activate, navigate, open/close tabs/windows, selected text. Companion origin grants required. Advanced page script execution is a separate high-trust capability and never enabled by installing an ordinary workflow. |
| Screen capture | Full display, selected window/region and interactive capture through capture broker; user/portal selection is respected. OCR is a separate local task over an explicit image. |
| Media | Player selection, play/pause/stop/next/previous/seek/volume; library search, random album and ratings only through library-capable providers. |
| Office documents | Inspect/export a user-selected supported local office file through a configured Linux conversion provider. Current/open document automation exists only for adapters that advertise it; no implicit Apple iWork API. |
| Git | Discover root/status, stage selected/all and commit with reviewable message; destructive restore/clean produce a path diff and confirmation. Operate only in a granted repository; never infer permission from a path emitted by a script. Disable Git hooks and external diff/textconv helpers by default using fixed per-invocation configuration; executing repository hooks requires a separately reviewed script capability, never an implicit consequence of a commit node. |
| Service bridges | Native note/calendar/focus/screenshot/dictation commands exposed through the same command registry, with explicit inputs and effects. New local features must register workflow-callable commands rather than forcing script authors into OS internals. |

### User Interface

| Native type | Behavior |
| --- | --- |
| ui.list / ui.grid | Declarative result rows/cards, filters, pagination, selection and action panel. Item identity is stable across refresh. Grid columns derive from the design system and user density. |
| ui.detail | Safe Markdown, metadata, actions, attachments and streamed replacement updates. Remote images require network authorization; raw HTML disabled. |
| ui.text | Readonly or editable text/Markdown; source value, placeholder, validation and explicit Submit/Cancel. Editing never mutates upstream vars until Submit. |
| ui.form | Typed text/secret/number/checkbox/select/date/file/application fields. Errors associated with fields; submit returns one validated object. Secret fields return handles. |
| ui.image / ui.pdf | Granted asset/file reference, title and actions. Dedicated host preview workers; no document scripting. |
| ui.dialog | Message and named buttons. Default cancel; returns exactly one named port, or cancelled. Destructive buttons are styled through DESIGN.md and never preselected. |

### Utilities

| Native type | Behavior |
| --- | --- |
| utility.argsVariables | Preserve/replace args; set/delete vars atomically using the binding rules above. |
| utility.split | Literal or linear-regex delimiter; keepEmpty default true; returns one array or explicitly spreads into args. |
| utility.join | Join string args or array with configured delimiter; errors on nonscalar values unless explicit stringify is selected. |
| utility.junction | One incoming activation is passed unchanged to outgoing edges; no barrier or buffering. |
| utility.condition | Ordered predicates; first true named output, otherwise else. Comparisons are typed; no coercion of "false" to true. |
| utility.fileCondition | exists/file/directory/readable check via file broker; true/false, with permission errors on error rather than false. |
| utility.filter | Predicate true passes, false ends this branch successfully. Native convenience equivalent of legacy filter behavior. |
| utility.delay | Cancelable milliseconds, nonnegative, deadline-bound. |
| utility.transform | trim/upper/lower/title/Unicode normalization with explicit locale and source binding; emits one transformed argument. |
| utility.replace | literal/regex/empty replacement, replaceAll default true; captures validated by regex engine. |
| utility.expression | Safe arithmetic/boolean AST with fixed operators and functions. No eval, imports, property traversal or arbitrary calls. |
| utility.random | Integer inclusive bounds, sample, shuffle or UUID; invalid/empty domain errors. |
| utility.show / utility.hide | Navigate/show or hide launcher through host; hiding does not grant permission to paste or keep a query alive. |
| utility.json | Schema-validated structured output/config patch. May alter only fields marked dynamic by the target node; cannot add permissions, executable paths or graph edges at runtime. |
| utility.debug | Emits metadata and optionally user-enabled redacted values to the debugger; never changes the envelope. |
| utility.parallel / utility.foreach / utility.repeat | Structured, bounded subgraphs as defined above; no arbitrary graph cycles. |
| utility.return | End a subgraph/called workflow and return declared args/vars. Top-level return finishes its branch. |

### Outputs

| Native type | Behavior |
| --- | --- |
| output.notification | Title/body/icon and optional registered actions; host notification service, workflow attribution and no concealed secret values. |
| output.largeType | Bounded text in common oversized overlay; Escape closes it and resolves the node. |
| output.clipboard | Text/HTML/image/file representations, optional paste, history include/exclude default exclude for generated transient values. Paste requires a valid target token and input capability. |
| output.writeFile | Granted destination; create-new default, append or replace explicit. UTF-8 text/binary handle; atomic replace where filesystem supports it; never silently overwrite. |
| output.sound | Packaged/granted audio reference and volume; cancellation stops playback. |
| output.speak | Text/language/voice/rate via configured speech provider; local default where installed, external provider requires explicit data transfer permission. |
| output.keyCombo | Explicit bounded chord, target token and timeout with input.shortcut permission. Only a consented RemoteDesktop/libei or supported X11 adapter may execute it, managing modifier ownership/release. Otherwise return Unavailable. Privileged inputd remains limited to Hyper, snippet and fixed paste operations; no generic event-stream or /dev access. |
| output.call | Same semantics as action.workflow; returning data allowed. Caller/callee permissions cannot be unioned to bypass either policy. |

## 7. Snippet workflow, selection and paste transactions

The privileged service is opt-in installation functionality; it does not run workflow scripts. Follow [linux-integration.md](linux-integration.md) for its exact process/IPC boundary.

A trigger token captures session/seat/focus/layout/input-method generations. The user can type the keyword only when the matching engine supports the current input route. Immediate, delimiter-retaining and delimiter-discarding modes use one shared registry with regular snippets; duplicate and prefix conflicts are rejected before enabling. Default case-sensitive, within-word false; Unicode trigger eligibility is a capability, not a character-count assumption.

Before a workflow requests replacement, the unprivileged broker validates the token and selected trigger. Resolve fast deterministic placeholders before deletion. A match includes a single-use nonce; commit must begin within 250 ms and is cancelled by intervening physical input or a context-generation change. If execution waits on a form, file picker, script or AI result past that transaction, retain the output and require a fresh explicit insertion action. Never reuse a consumed/expired trigger nonce or paste into a newly focused terminal/password field because a slow script eventually completed.

### Exact trigger and delimiter contract

The registry stores keyword, caseSensitive (default true), withinWord (default false), mode (immediate, delimiter-keep or delimiter-drop), delimiters, application scope and enabled state. Default delimiters are Space, Tab and Enter. Authors may add visible punctuation, but a keyword containing an enabled delimiter is rejected. Keywords contain 1..64 Unicode scalar values, no whitespace/control characters; this storage grammar does not imply every automatic input backend can recognize every keyword. Immediate-prefix conflicts and identical enabled keywords in overlapping scopes are errors. Separate nonoverlapping app scopes may reuse a keyword.

Matching is against committed text when an adapter provides it. The raw backend's baseline is ASCII under a verified active layout and no preedit/Compose uncertainty. It tracks only its bounded observed suffix, not the whole text field. Its word-boundary test uses the start of that observed sequence or a preceding nonletter/nonnumber/nonmark/nonconnector character; it cannot prove an unseen field prefix after a reset. The UI distinguishes observed-key matching from a full committed-text adapter. Never use this feature as a sensitive-field security boundary.

For direct raw input, the keyword characters have already been forwarded before an eligible match:

| Mode | What may be held | Commit operation |
| --- | --- | --- |
| immediate | Nothing | Delete exactly the known ASCII keyword length; do not delete the preceding boundary. Insert the prepared replacement, or accept the workflow activation once. |
| delimiter-keep | Only the matching delimiter keydown/up pair, for at most 250 ms | Delete the keyword, insert the prepared replacement, then emit the retained delimiter once. For Tab/Enter, preserve its key action rather than changing it into unrelated clipboard text. |
| delimiter-drop | Same single delimiter bound | Delete the keyword and insert the prepared replacement; suppress that delimiter. |

Do not forward Enter or Tab and attempt to undo its effect. A delimiter that does not complete an eligible match is forwarded normally and resets the matching boundary. There is no general queue of user typing. The input worker's forwarding loop never awaits Electron, a workflow, model or clipboard consumer.

Before deletion, a timeout or next physical event cancels the pending transaction. If the same eligible target remains valid, replay the held delimiter before forwarding the next event; otherwise drop it and surface interruption rather than send it to another field/session. The worker maintains down/up ownership so any eventual physical release is consumed or forwarded consistently; it must not emit an orphan release or duplicate a retained delimiter. Key repeat during a pending delimiter follows the next-physical-event cancellation rule.

Once deletion/insertion has started, any context loss stops further injection; never attempt blind rollback. The broker records incomplete insertion and offers explicit Copy/retry. The compositor can still change focus between checks and delivery: this is best-effort injection, not an atomic transaction guaranteed by privilege.

For a typed workflow whose output is not prepared inside the deadline, the only permitted automatic commit is keyword erasure plus one accepted activation. In delimiter-keep mode the held delimiter is replayed into the still-validated original target before opening workflow UI; it is never carried into the new form. Later output requires a fresh user insertion action. Cursor placeholders similarly require a validated cursor-movement capability; unsupported rich/IME/Unicode movement falls back to a visible copy/edit result rather than guessed backspace/arrow counts.

Clipboard capture occurs before replacing its ownership. Snapshot all supported representations within bounds; restore only while the transaction still owns the relevant generation. Wayland data reads do not prove that the intended field consumed a paste. Deletion, insertion and cursor placement can be best-effort for some applications; unsupported transactions fail visibly with Copy available. Do not implement error recovery as arbitrary backspaces.

Required tests include direct layouts/AltGr/dead keys/Compose, IME preedit/commit/cancel, Unicode grapheme payloads, focus switches at every insertion stage, user copies during expansion, slow paste readers, clipboard-manager reoffers, multi-keyboard Hyper, lock/suspend/session changes and killed processes with modifiers held. No typed buffer, snippet secret or global raw key event appears in persisted run logs.

## 8. React Flow editor and debugger

Use @xyflow/react as a controlled canvas. Its official documentation describes node/edge state and event handlers; it does not define workflow execution semantics. [React Flow documentation](https://reactflow.dev/learn). Linuxcast graph JSON is authoritative; canvas state is an adapter over that model.

Required editor behavior:

- Sidebar workflows with search, folders/tags, enable/disable, version, dirty state and capability/permission status.
- Searchable seven-category palette, aliases and examples; dragging or keyboard insertion creates a node with validated defaults.
- Design-token node cards, typed handles, named ports, clear connection labels and noncolor-only status. Do not inherit React Flow's example colors as product design.
- Keyboard-accessible node list and inspector alternative to drag-only interaction; connect ports through a chooser; focus and screen-reader announcements.
- Inspector generated from registry schemas; data binding picker, variable scope preview, permission description, source/script preview and node help.
- Connection validation rejects wrong port type, cycles and ambiguous modifier alternatives before save; full validation also runs on import and runtime load.
- Selection/multiselect, copy/paste with remapped IDs, duplicate, delete, search, notes, zoom/pan, fit, snapping and optional arrange. Undo/redo includes graph/settings edits but not executed effects.
- Debounced local draft persistence (500 ms), explicit Save and Revert, crash recovery for drafts and deterministic JSON ordering for useful diffs. An invalid draft may be saved as a draft but cannot replace the enabled version.
- Version diff before package updates; local edits require fork/merge/revert choice, never silent overwrite.
- Run/test panel with mock input, capability fixtures and dry-run mode. Dry-run records proposed effects; it cannot execute scripts with undeclared privileges.
- Debugger timeline shows node transitions, durations, branches, cancellations and safe errors. Its default recent view shows 50 runs; storage follows [data.md](data.md): metadata for 30 days or 10,000 runs, whichever limit is reached first. Value capture is off by default and enabled only for the current run; captured content expires after 24 hours, capped at 64 KiB/step and 50 MiB total, with secrets always redacted.
- Breakpoints pause before a node and must expire with the run deadline. Step means one node activation; parallel branches remain visibly separate. Stop cancels all. Exports exclude run data.

Use the main app's List/Grid/Detail/Form/ActionPanel components for workflow results. The editor's preview uses the same component code and schemas as runtime. Test loading/empty/error/disabled states against DESIGN.md, not just successful graph screenshots.

## 9. Sandboxed scripts and permissions

All script-filter/action code uses the [extension sandbox](extensions.md). Bubblewrap is mandatory. If unavailable or blocked by kernel policy, show a diagnostic and keep non-code workflows usable; never fall back to an unsandboxed process.

Bundled pure JavaScript runs with the app's pinned bundled Node. Optional shell/Python/other host interpreters are declared dependencies, selected through an executable grant and mounted with required runtime libraries into the sandbox. The package manager never installs their dependencies or runs package lifecycle hooks. A script can use only its package, private data/cache and granted files. Host network and desktop calls go through brokers.

Pass argv as an array or structured JSON on stdin. Do not place user query text in source, a shell command string, environment variable names or a generated shebang. The script-specific profile is deliberately stricter than the general extension profile: timeout 10 s; stdout 1 MiB; stderr 256 KiB with redaction; sandbox memory 256 MiB and 32 tasks (including threads), with the 500 ms cancellation grace above. A reviewed host setting may raise limits only within the security policy. Scripts returning result JSON use stdout exclusively for that protocol; diagnostics use stderr.

Permission requests are static upper bounds. The broker checks installed package identity, active run, operation, grant scope and cancellation for every call. A graph JSON patch cannot grant itself more access. Persistent secrets live in the credential store. Raw privileged input, unrestricted session D-Bus and unrestricted host process spawn are never workflow capabilities.

## 10. Ten executable-example specifications

These are specifications for packages and test fixtures to create during implementation. This PR intentionally contains no runnable workflow code. Each fixture needs a native package, input fixture, mock broker recording and expected run trace; OS-dependent examples additionally need Debian integration evidence.

| ID / example | Graph and configuration | Deterministic acceptance and failure cases |
| --- | --- | --- |
| WF-EX-01 Web search | input.keyword("docs", required) -> action.webSearch(template setting) -> action.openUrl. Template is https://example.org/search?q={query} in the fixture, resolved by the URL builder. | Input "C++ & café" produces one correctly encoded query value and one browser-open request. Displaying the row causes no network request. Missing template/denied URL permission produces a visible error and no open. |
| WF-EX-02 File batch action | trigger.fileAction(MIME text/*, 1..100) -> ui.list(multiselect) -> utility.foreach(concurrency 1) -> action.open with selected editor. | Two different directories containing the same basename remain distinct FileRefs and open in selected order. Revoking one file grant stops that item without silently opening a substitute path; cancelled selection opens nothing. |
| WF-EX-03 Dynamic snippet | trigger.snippet -> utility.condition(time range) -> utility.argsVariables(greeting) -> output.clipboard(paste true, exclude history). Clock fixture is 09:00 in Australia/Sydney. | Result is the morning greeting with known date. Keyword removed once, payload inserted once. Change focus before insertion: output is offered for Copy, no paste occurs. A delimiter-retaining trigger preserves exactly one delimiter. |
| WF-EX-04 Script search | input.scriptFilter(bundled Node, cancel-previous, 100 ms debounce) -> ui.list -> output.clipboard. Test script returns rows derived from query and fixture delays. | Queries "a", then "ab"; old "a" completes last but never replaces "ab". Cancel kills sandbox descendants. Malformed JSON/oversized output yields protocol error. Selecting a row passes its array args without flattening. |
| WF-EX-05 Local task capture | input.keyword("todo", required) -> utility.argsVariables(task) -> input.list(["Work","Personal"]) -> output.writeFile(append) -> output.notification. Destinations are explicit directory settings/grants. | Input "Buy milk" and Personal append one UTF-8 line to the selected file. Canceling list makes no write. Denied grant or symlink escape is an error. Notification happens only after durable write success. |
| WF-EX-06 Image gallery | input.fileFilter(granted pictures) -> ui.grid -> action through modifier routes: primary ui.image; Ctrl output.clipboard; Alt action.reveal. | Selection identity survives thumbnail loading. Each exact modifier executes one path; unknown modifiers do not pick a random path. Corrupt image shows a bounded preview error; original is unchanged. |
| WF-EX-07 PDF inspection | trigger.fileAction(application/pdf) -> automation.task(pdf.extractText) -> ui.text(readonly) -> output.writeFile(create-new). | Fixture PDF yields expected text and page count. Existing destination causes collision error, no overwrite. Encrypted/corrupt PDF returns an actionable parser error; embedded active content is not executed. |
| WF-EX-08 Confirmed cleanup | input.keyword("cleanup") -> automation.task(file.list, granted Downloads) -> utility.filter(extension ".tmp", age) -> ui.dialog -> automation.task(file.trash) -> output.notification. | Preview identifies exact eligible paths; Cancel changes nothing. Confirm binds to the reviewed set; a replaced or newly added file is revalidated and not silently swept in. Trash failures are individually reported. |
| WF-EX-09 Cross-workflow parallel report | trigger.external -> utility.parallel(child A: system capability query; child B: local repository status) -> utility.argsVariables -> output.call(report renderer) -> ui.detail. | Children finish in reverse order but result order remains A/B. Vars are isolated. Unknown caller denied. Recursive call chain fails. collectErrors=true renders one success and one typed error without pretending full success. |
| WF-EX-10 Provider-backed summarizer | trigger.universalAction(text) -> ui.form(length) -> action.ai(default provider/model) -> ui.detail(stream) -> output.clipboard(explicit user action). | Mock provider streams known chunks; Cancel aborts and no late text appears. No provider configured opens setup, not an undisclosed fallback provider. Host uses secret handle; graph/log export has no credential. Focus changed while waiting never causes automatic paste. |

Additional registry unit tests cover every operation family even when not in these ten fixtures. In particular, bounded repeat/foreach, Unicode text, date DST ambiguity, regex limits, folder mirror preview, browser companion permissions, clipboard ownership and media-library capability differences are required.

## 11. Delivery gates and parallel execution

1. **Contracts gate:** schemas, limits, error codes, bindings, permissions and fixture envelopes approved together. Publish validators before splitting implementation.
2. **Runtime gate:** graph compiler, deterministic scheduling, cancellation and fake clock/UUID/brokers pass pure runtime tests. Test negative cases before real effects.
3. **Parallel work:** editor works against registry/mocks; pure utilities against core; script runner against sandbox protocol; desktop/task adapters against host capability interfaces; package lifecycle against archive fixtures.
4. **Integration gate:** all ten fixture packages execute through the same runtime, renderer and permission broker as user-created workflows. Editor-saved and hand-authored JSON yield equivalent traces.
5. **Desktop gate:** real Debian GNOME/KDE Wayland/X11 checks, including session/focus/input recovery. Unsupported capability cases must be documented, not counted as success.
6. **Release gate:** package rollback, grant revocation, interrupted runs, malformed imports, schema migration, accessibility, design screenshots and resource limits pass. A successful happy-path script is insufficient.

The implementation agent must not invent per-node semantics while wiring UI. If a required node needs a new decision, update the registry schema and this specification first, then its fixture. Keep task IDs in the roadmap; this document is the stable behavioral contract.
