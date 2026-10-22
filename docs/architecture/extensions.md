# Native extension SDK, sandbox and package specification

Status: approved v1 architecture specification. This planning PR defines interfaces and acceptance criteria; it does not implement a client or SDK.

Linuxcast extensions are pure-JavaScript packages executed by the pinned bundled Node 24 runtime inside a mandatory bubblewrap sandbox. They publish declarative ViewModels which the host renders. They cannot load React components, a React reconciler, Electron APIs, DOM code or native Node addons into the client. Linuxcast itself can use React/TypeScript/Tailwind; that is independent of its public extension boundary.

The design system is authoritative: [DESIGN.md](../design/DESIGN.md). Read [workflows.md](workflows.md) for graph/runtime semantics, [linux-integration.md](linux-integration.md) for desktop capabilities, [security.md](security.md) for the overall threat model and [ai.md](ai.md) for provider credentials/model routing. Track work in [ROADMAP.md](../implementation/ROADMAP.md).

## 1. Capability target and native-only scope

Raycast's official extension API covers command lifecycle, preferences, cache/storage, OAuth, clipboard, feedback, keyboard/system/window/browser operations, AI/tools, navigation and List/Grid/Detail/Form/action UI. Its manifest declares commands, view/no-view/menu-bar modes, arguments, preferences, intervals, tools and AI contributions. Those are useful capability targets; Linuxcast's schemas below are new contracts. [Raycast API reference](https://developers.raycast.com/api-reference) (sdk-raycast-api), [Raycast manifest](https://developers.raycast.com/information/manifest) (sdk-raycast-manifest).

V1 supports local native-package install, developer tooling, package permissions/configuration, foreground/headless/background/tray contributions, native workflows, tool declarations and browser-companion mediation. It does not import Raycast packages, impersonate @raycast/api, install npm packages on an end user's machine or require a hosted marketplace. An online catalogue can be added later without changing package execution authority.

## 2. Process and trust boundary

~~~text
Sandboxed renderer (host React UI)
            |
     narrow host IPC
            v
Main/host broker ---- credential store / native services / AI / browser companion
            |
     authenticated per-launch channel
            v
bubblewrap namespace + dedicated Node extension process
            |
     readonly package + private data/cache + explicit file grants
~~~

Renderer is an unprivileged view of host-owned state. Extension processes never connect directly to renderer IPC or the privileged input service. Broker identity is bound to the child process/channel at launch; packageId in a request is not trusted authentication.

Default isolation is one process per active extension, with command sessions multiplexed inside that package host. Commands of the same package share a trust boundary and can share JavaScript state; session cancellation and view IDs remain separate. Different extension identities never share a process. A package crash fails its sessions but cannot kill other packages or the launcher. Worker-thread isolation or Node vm alone is insufficient.

The package can access its own installed files and private data/cache inside the namespace. External files, network requests and desktop operations use typed broker calls. The registry records which operations read data or cause effects; package-supplied labels cannot lower an operation's trust level.

## 3. Native extension manifest and package layout

Use a .linuxcast-extension ZIP container with extension.json, dist JavaScript, assets, README/license and integrity.json. Installed archives are immutable. Native workflows use the same package lifecycle with their own workflow.json.

~~~json
{
  "manifestVersion": 1,
  "id": "org.linuxcast.examples.saved-links",
  "version": "1.0.0",
  "name": "Saved Links",
  "description": "Search your own locally stored links",
  "author": { "name": "Linuxcast" },
  "license": "GPL-3.0-only",
  "minHostVersion": "1.0.0",
  "sdkVersion": "^1.0.0",
  "runtime": "bundled-node",
  "platforms": ["linux"],
  "icon": { "light": "assets/icon-light.png", "dark": "assets/icon-dark.png" },
  "commands": [
    {
      "id": "search",
      "title": "Search Saved Links",
      "mode": "view",
      "entry": "dist/search.js",
      "keywords": ["bookmarks"],
      "arguments": [],
      "preferences": []
    }
  ],
  "preferences": [
    {
      "id": "sort",
      "kind": "enum",
      "title": "Sort order",
      "options": [
        { "label": "Title", "value": "title" },
        { "label": "Recently added", "value": "recent" }
      ],
      "default": "title",
      "required": true
    }
  ],
  "permissions": [
    { "id": "storage.local", "reason": "Store your saved links privately" },
    {
      "id": "url.open",
      "reason": "Open the link you choose",
      "scope": { "schemes": ["https"] }
    }
  ]
}
~~~

IDs use lowercase reverse-DNS package identity; command/tool IDs are lowercase ASCII letters/digits/hyphens. SemVer and schema versions are distinct. Paths must be relative normalized POSIX paths inside the package and cannot escape through symlinks. Commands reference bundled ESM entry files. A package's license is recorded per package; it is not assumed to be Linuxcast's license.

Manifest optional fields:

| Field | Native behavior |
| --- | --- |
| commands[].mode | view, action or tray. action is headless but may request host feedback/confirmation; tray contributes data to the shared tray UI. |
| commands[].arguments | Typed text, secret, enum, number, file or directory inputs; host validates before launch. Secrets become handles. |
| commands[].preferences | Command-level settings; explicit override of package setting IDs permitted only when type-compatible. |
| commands[].background | Optional intervalSeconds >= 60 and timeoutMs <= 30000. Disabled at install; user enables separately. Uses the shared data scheduler: per-automation concurrency one, coalesced pending occurrences and latest-missed-once default with an explicit skip option. |
| commands[].disabledByDefault | Defaults false for foreground commands, true for background/scheduled/automatic bindings. |
| tools | IDs, entry points, input/output JSON Schema, description and declared effect class; see AI/tool section. |
| workflowNodes | Typed node contributions with config/input/output schemas, declared effects and handler IDs. No custom renderer components or native code. |
| skills | Bundled Markdown instructions with stable IDs, descriptions and optional resources; treated as extension content, not host policy. |
| mcp | Explicit supported remote or sandboxed stdio connection declarations; no auto-connection on install. |
| dependencies | Required applications/runtimes/capabilities displayed as setup requirements; never install-time shell commands. |
| homepage/repository/issues | HTTPS metadata URLs. Opening them is a user action; no tracking requests on render. |

All manifests use strict JSON Schema validation. Unknown execution fields or unsupported major versions block activation with an actionable message. An icon or README cannot introduce scripts, remote resources or hidden capabilities.

Shared settings and permission interface:

~~~ts
type SettingKind = "text" | "secret" | "number" | "boolean" | "enum" |
  "file" | "directory" | "application";
interface SettingDefinition {
  id: string;
  kind: SettingKind;
  title: string;
  description?: string;
  required: boolean;
  default?: Json;
  options?: Array<{ label: string; value: string }>;
  validation?: { min?: number; max?: number; pattern?: string };
}
interface PermissionRequest {
  id: string;
  reason: string;
  scope?: Json;                   // parsed by that permission's strict schema
}
~~~

Preferences are local host data, not rewritten into the package. Defaults may not include a real secret or an unprompted file grant. File/application pickers return validated references rather than arbitrary strings. All credentials use the shared SecretStore in data.md: OS-keyring-backed Electron safeStorage encrypts stored blobs; basic_text is rejected. If a secure keyring is unavailable, credentials are session-only, never persisted as plaintext. Extensions receive opaque handles and cannot directly read secret values.

## 4. Declarative ViewModel protocol

ViewModel is data, not a serialized component tree. Host components determine typography, spacing, colors, focus, shortcuts, accessibility and interaction from DESIGN.md. Packages choose semantic content, layout kind, metadata and actions. No custom CSS, arbitrary HTML, iframe, WebView, renderer JavaScript or React hooks cross the SDK boundary.

~~~ts
type ViewModel =
  | ListView | GridView | DetailView | FormView
  | TextView | ImageView | PdfView;
interface ViewBase {
  protocolVersion: 1;
  viewId: string;
  revision: number;
  title: string;
  loading?: boolean;
  status?: { kind: "info" | "warning" | "error"; message: string };
  actions?: ActionModel[];
}
interface ListView extends ViewBase {
  kind: "list";
  search: { placeholder: string; query: string; mode: "host" | "extension" };
  sections: Array<{ id: string; title?: string; items: ItemModel[] }>;
  selectedId?: string;
  nextCursor?: string;
  empty?: { title: string; description?: string };
}
interface ItemModel {
  id: string;
  title: string;
  subtitle?: string;
  icon?: IconRef;
  accessories?: Array<{ text?: string; icon?: IconRef; tooltip?: string }>;
  tags?: Array<{ text: string; tone: "neutral" | "accent" | "success" | "warning" }>;
  keywords?: string[];
  disabledReason?: string;
  preview?: PreviewRef;
  actions?: ActionModel[];
}
interface ActionModel {
  id: string;
  title: string;
  kind: "invoke" | "copy" | "open" | "navigate";
  icon?: IconRef;
  shortcut?: { key: string; modifiers: Array<"Ctrl" | "Alt" | "Shift" | "Super"> };
  effect: "read" | "write" | "destructive";
  disabledReason?: string;
}
interface IconRef {
  kind: "builtin" | "asset" | "file";
  name?: string;
  assetId?: string;
  fileRef?: FileRef;
}
interface PreviewRef {
  kind: "text" | "image" | "pdf";
  text?: string;
  assetId?: string;
  fileRef?: FileRef;
}
~~~

Grid uses the same item/actions contract plus image asset references and density. Detail accepts sanitized Markdown, a metadata list and attachments. Form accepts typed fields, validation errors and submit/cancel action IDs. Text view supports readonly/editable text; submit returns the edited value. Image/PDF views accept asset/file references, never a remote executable document URL.

No action silently runs because a view appeared. Host verifies an actionId belongs to the current view/revision and selected item before dispatch. Data attached privately to an action lives in extension session state or a validated opaque payload, not in a DOM event handler.

Navigation supports push/replace/pop and depth <= 16. Pushing preserves parent query, selection and scroll state. Closing a view cancels its view-owned async work. Forms preserve draft values while navigating within the session, clear secret input on close, and never submit on a value change.

### Transport and lifecycle

Use parent-owned stdin/stdout pipes for framed JSON-RPC-style messages. Each frame is a 4-byte big-endian length followed by UTF-8 JSON, maximum 1 MiB. Versioned request/response/event envelopes include requestId, sessionId, protocolVersion and method; the broker associates the package principal and allowed session IDs with the child independently. stdout is reserved for protocol frames; diagnostics use bounded stderr. SDK console helpers write to stderr. Malformed stdout is a protocol failure, not data to execute. No public localhost HTTP server is needed.

~~~ts
type ExtensionEvent =
  | { type: "queryChanged"; viewId: string; query: string; queryRevision: number }
  | { type: "selectionChanged"; viewId: string; itemId: string }
  | { type: "action"; viewId: string; revision: number; itemId?: string; actionId: string }
  | { type: "formSubmitted"; viewId: string; values: Record<string, Json> }
  | { type: "cancel"; reason: string };

interface CommandContext {
  readonly arguments: Record<string, Json>;
  readonly preferences: Record<string, Json>;
  readonly signal: AbortSignal;
  publish(view: ViewModel): Promise<void>;
  onEvent(handler: (event: ExtensionEvent) => Promise<void>): void;
  host: HostApi;
}
type CommandEntry = (context: CommandContext) => Promise<void>;
~~~

These are interface examples only. SDK implementations provide type generation, host-call wrappers, cancellation and resource checks; they do not make a renderer available.

Host starts the command, sends validated arguments/preferences and a capability snapshot, then accepts initial views and broker calls. A view command should publish a loading/empty state within 250 ms; a 5 s initial-response deadline shows failure if no state arrives. Updates are whole snapshots or typed item upserts/removals with strictly increasing revisions. Delta application requires the preceding revision; a gap requests a full snapshot. Stale revisions are discarded.

Bound renderer work: 500 items/page, 10,000 items/session, 64 KiB per text field, 1 MiB/frame and 30 view updates/second; coalesce queued updates rather than freezing the launcher. Streaming Markdown chunks are accumulated host-side within these limits. Assets are fetched through brokers and referenced by opaque IDs.

Default extension sandbox memory 256 MiB, 64 tasks including threads, CPU quota equivalent to one core and 64 pending host requests. Action commands have a 30 s deadline unless a host-approved long task contract is used; background commands always finish within 30 s. The host stops an idle extension after 5 min once it has no active foreground session or authorized background job. Session activity does not grant background execution. Cancellation uses TERM then KILL after 1 s and verifies descendants are gone. Workflow script jobs deliberately use the stricter 10 s/32-task/500 ms profile in workflows.md. All limits are independently enforced by the supervisor, not only by SDK code.

## 5. SDK host services and permission mapping

A service being in the SDK is not a permission to call it. Every operation checks the current grant and platform capability. Capability failure returns UNSUPPORTED with a reason/fallback; permission denial returns PERMISSION_DENIED. Neither falls through to arbitrary shell execution.

| Service | Methods / important constraints | Permission |
| --- | --- | --- |
| environment | Host/sdk/runtime version, platform, locale/timezone, appearance, declared capability states, package data/cache virtual roots | Basic metadata available; no arbitrary environment dump |
| preferences | Read validated nonsecret package/command settings; open host settings | Package-local |
| storage/cache | JSON get/set/delete/list and transactional update; cache TTL; default 10 MiB storage, 50 MiB cache | storage.local |
| credentials | Create/use/revoke package-scoped credential handles; no cross-package enumeration | credentials.use; opaque handles only, no direct secret read |
| network | Brokered HTTPS request/stream, allowed origins/methods, explicit headers/body, cancellation/limits | network.fetch with exact origins and method scope |
| oauth | Host browser authorization with state/PKCE and registered callback; tokens retained by broker | oauth.authorize with issuer/client/scopes |
| clipboard | Read current clipboard, history only separately granted, write, private transient paste | clipboard.read/write/history and input.paste |
| selection | Capture selected text/files/URL through available adapters; return provenance/target token | selection.read |
| files | Picker/grants, stat/read/list/write/rename/trash/preview; broker rechecks resolved target | files.read/files.write scoped grants |
| applications | Search/list/open/reveal, running/focused app metadata and graceful quit | applications.read/launch/control |
| urls | Open allowed schemes/URLs via host selection | url.open |
| commands | Invoke declared host commands with typed inputs; nested calls audited/cancelled | commands.invoke scoped IDs |
| keyboard/input | Insert text or explicit key combination against target token | input.paste/input.shortcut; no raw event subscription |
| windows | Query/manage windows only through advertised desktop adapter | windows.read/control |
| browser | Tabs/title/URL/search/activate/navigate/selection through approved companion | browser.tabs/content/actions with origin scope |
| feedback | Toast, HUD, host confirmation and notification, common progress/cancel UI | Local transient feedback basic; notifications.show separately granted |
| media/capture | Player operations, screen/image capture, OCR and speech through native services | Per-service explicit permissions |
| AI | Stream completion/structured output/tool calls using configured default route | ai.generate plus explicit attachment/service access |
| workflow | Call allowed workflow trigger and return typed output | workflows.invoke scoped IDs |
| tray | Publish bounded host-rendered tray item/menu and refresh state | tray.publish; background.run separately enabled |

Network broker enforces redirects, DNS/IP policy, response limits and cancellation on every hop. localhost/private-address access is a separate permission for local models/services; it is not obtained by claiming an arbitrary hostname. Credentials are attached only for the approved origin, stripped on origin-changing redirect and never logged. Extension network permissions do not automatically expose the user's AI provider key.

File grants are opaque broker objects; displayPath is not proof of access. Path resolution must defend against symlink and rename races. No package can request "/" or the entire home directory as a default. A deliberate broad grant is visible, revocable and outside the standard least-privilege preset.

Browser page JavaScript and visible host terminal command execution are advanced capabilities requiring review of the concrete operation at use time. Direct credential reads are not an extension capability. They are not granted by normal package install or read-only tab metadata access. This distinction is necessary because those operations can intentionally act beyond ordinary extension confinement.

## 6. Mandatory bubblewrap policy

Bubblewrap constructs namespaces and mounts; it is not a complete sandbox policy by itself. Its upstream documentation explicitly assigns policy responsibility to the caller and warns about exposed host sockets. [Bubblewrap upstream](https://github.com/containers/bubblewrap) (sdk-bubblewrap).

The implementation must build and test a policy, not copy a demonstration command:

- Separate user, mount, PID, IPC, UTS and network namespaces. Drop Linux capabilities; set no-new-privileges, new session and parent-death handling.
- Readonly minimal bundled runtime plus package; writable private data/cache/temp only; explicit readonly/readwrite grant mounts only when a script operation requires direct file access.
- Minimal device nodes. No /dev/input, /dev/uinput, host process namespace, display server socket, Wayland socket, session/system D-Bus, SSH agent, browser profile, Docker/container socket or credential-store socket.
- Clean environment with fixed virtual HOME, PATH, locale and package-specific directories. Do not forward host secret variables, NODE_OPTIONS, preload variables or Electron internals.
- No direct host network. Broker RPC through the dedicated parent-owned pipes is the only network/desktop path. A network origin grant does not make a host network namespace available.
- Resource enforcement through supervisor/cgroup mechanisms where supported plus process/output/time limits. Fail closed if the security-critical sandbox setup fails; surface specific diagnostics.
- Seccomp policy must be compatible with the bundled runtime while denying unnecessary high-risk operations. Validate it on supported Debian kernels; no claim that disabling a JavaScript import is an OS security boundary.
- Bundled JavaScript dependencies only. Reject .node addons and executable native payloads in extension packages. No npm postinstall, downloads or runtime dependency installation.
- For workflow scripts, host-selected shell/Python executables and required libraries may be mounted explicitly. The interpreter remains sandboxed; a missing dependency gives setup instructions, not a hidden unsandboxed retry.

The SDK loader can reject node:child_process and native-addon imports for clear errors, but assume hostile JavaScript can use any interface available in its process. Namespace/mount/network/broker restrictions and resource limits are the actual boundary. Filesystem access within an extension's own data directory is allowed by design.

A built-in host feature may use reviewed native code. That code ships with the signed client and does not become a third-party native-module escape hatch. The input daemon never loads extension code, parses extension ViewModels or runs arbitrary workflow scripts.

## 7. AI tools, skills and MCP contributions

Tools declare input/output JSON Schema and effect class. The host validates arguments and output, attributes the tool to its package, applies the underlying broker permissions and records a safe audit event. A package cannot call a write operation under a read-only tool label; the broker's operation classification wins.

A tool call can return content, structured output and file/asset handles. Tool text is untrusted data, not an instruction to alter app policy or reveal credentials. Background packages and model-selected tools cannot bypass user confirmation for destructive or externally communicating effects.

V1 model calls route through the one configured provider/model. The interface reserves a routeId for future per-function/per-package routing; absence always means the configured default. Extensions receive capability/model metadata, not provider credentials. Do not fall back to a different paid provider without explicit configuration.

Skills are package resources shown to the user and used only in the relevant AI context. They do not change sandbox grants. MCP remote connections use configured network/OAuth scopes; local stdio servers use the same mandatory sandbox and declared runtime dependency rules. Package installation alone never starts an MCP server or subscribes to a paid service.

## Package lifecycle

### Install and export

1. Copy the selected native archive into a private staging directory on the same filesystem as the package store.
2. Reject path traversal, absolute paths, symlinks/hardlinks, special files, duplicate normalized names, encrypted archives and executable install hooks.
3. Limits: 50 MiB compressed, 200 MiB expanded, 10,000 files, 100:1 expansion ratio, 16 MiB single asset unless a stricter renderer limit applies. Decode images only in bounded workers; maximum 32 megapixels.
4. Validate manifest/schema, version compatibility, complete integrity manifest and declared files. SHA-256 detects changes, not author trust; optional signatures provide distinct provenance. Do not call unsigned packages verified.
5. Show name/source/version/license, commands/tools, dependencies and permission differences. Validate user settings and collect required explicit grants.
6. Atomically rename the immutable version directory and commit its active-version pointer in the package registry. Only then register enabled foreground commands.
7. Keep automatic triggers/background schedules off until configured. No package code runs during inspection/install.

Export includes manifest, immutable source/bundle/assets, docs and regenerated integrity manifest. Exclude secrets, local settings/grants, caches, user files, histories, device bindings and logs. Development folders go through the same pack/validate path.

### Updates, rollback and uninstall

An update stages independently while the current version remains active. Permission expansion must be approved before activation. Existing settings survive only when the new schema accepts them; declarative rename/default migrations are host-executed. Do not run arbitrary package migration scripts.

Running sessions remain pinned to their old immutable version until they finish/cancel. Retain the last known-good version. Activation failure restores the previous pointer and command registrations atomically. Crash during extraction/validation never exposes a partially installed package.

Local edits require a fork or explicit overwrite/merge decision. A package update cannot silently replace a user's working draft. Background schedules never gain new grants through an update. Grants bind to the installed identity/version/integrity record; content changes require a renewed grant under the canonical security policy, even when the displayed permission list is unchanged.

Uninstall unregisters commands/triggers, cancels sessions, revokes capabilities and removes package versions after processes exit. Offer an explicit separate delete-data option; default retains user data for reinstall. Credential handles are revoked/removed according to the user's choice and central security policy. No uninstall scripts run.

Developer mode still uses bubblewrap. File watch creates a new validated snapshot and restarts only the development session; it does not mount a writable entire repository/home into the sandbox. Debugger can inspect that session, not unrelated packages or the main process.

## 9. SDK tooling and versioning

Provide a native CLI for init, validate, build, dev, test, pack and inspect. init generates manifest, TypeScript entry, README, tests and original icon placeholders. build bundles pure-JS dependencies and emits ESM; do not ship node_modules installations. pack produces deterministic sorted archive entries and file hashes.

Generate SDK types and JSON Schema from one contract source. Protocol version 1 accepts additive optional fields only within explicitly extensible data namespaces; breaking changes require a major version and migration guidance. Node runtime version is pinned in the app release lock; packages cannot select a second downloaded Node executable.

Testing kit supplies fake host brokers, deterministic clock/UUID, query races, cancellation and permission-denied fixtures. ViewModel snapshots test semantic states; screenshot tests exercise the host renderer under DESIGN.md in light/dark/high contrast/reduced motion.

## 10. Implementation acceptance

- A pure-JS sample can display/search a list, push a detail, submit a form, show a grid, stream Markdown, publish tray state and request an approved file/URL/AI operation using only the SDK.
- A malicious sample cannot read a sibling extension, host home, provider secrets, D-Bus/display/input devices or network directly; grants are enforced through hostile direct protocol requests as well as honest SDK calls.
- Missing bubblewrap or disabled required namespace support blocks extension/script execution with a diagnostic, while built-in non-code features remain usable.
- An extension that floods frames, allocates too much memory, forks repeatedly, ignores cancellation or crashes cannot make the launcher unresponsive.
- Permission revocation invalidates in-flight broker grants and prevents subsequent calls. Stale session/action IDs, malformed JSON, invalid icons and huge image dimensions are rejected.
- Package path traversal/duplicate files/zip bombs, interrupted install, invalid update, permission expansion, setting migration, rollback and uninstall are tested.
- Focus/clipboard/input actions use the common transaction broker; delayed extension results never silently paste into the current front app.
- The same ViewModel renders consistently for built-ins, workflows and extensions, including empty/error/loading/disabled/permission states.
- Per-platform capability diagnostics are visible. A package requiring unavailable native capability is unavailable with an explanation, not reported as installed and functional.
- SDK documentation and fixture packages contain no copied Raycast SDK code, logos, artwork or compatibility promises.

Implementation work can split after the manifest/ViewModel/RPC/permission schemas are frozen: renderer components, sandbox supervisor, host service adapters, SDK/CLI and package manager run in parallel against fixtures. The release gate is successful adversarial isolation plus real Debian integration, not merely a list rendering inside Electron.
