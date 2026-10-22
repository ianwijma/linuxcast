# Built-in feature behaviour

Normative v1 defaults. Read [design](../design/DESIGN.md), [platform capabilities](../architecture/linux-integration.md), [data policy](../architecture/data.md), [AI](../architecture/ai.md), and the [feature matrix](features.json). All application behaviour below is planned, not already implemented.

## Launcher and search

Root search merges applications, enabled commands, indexed files, notes, links, snippets, contacts, windows and settings with stable IDs. Exact explicit aliases precede fuzzy title/keyword matching; favourites and recency/frequency break ties within result categories. Persist ranking locally, expose reset and disable/hide actions, and never let a late async provider replace the selected item by position. Limit initial per-provider results to 20, merge up to 100, and request additional results only in a dedicated view. Query generations cancel stale work.

Empty query shows favourites and recent commands. URL input offers Open URL; command arguments are typed/validated and visually separate from the query. Quick AI is an explicit Tab/fallback action and never transmits each keystroke. Root fallback offers configured web searches and file search. Compact mode hides secondary decoration but preserves command names and keyboard access.

Application launch uses GIO desktop entries and parsed Exec fields, not shell interpolation. Files, URI opening, argv execution and explicitly requested shell commands are different action types. History supports per-item and full clearing. Commands can have aliases and application-scoped/global shortcuts; collisions are visible and require resolution. Deep links use `linuxcast://` with a closed action allowlist and validated arguments, never arbitrary command execution.

## File index and universal actions

Initial indexing is filename/path/metadata only under user-selected roots; offer home folders during onboarding but do not silently index all mounted disks. Honour hidden-file, glob, size and mount exclusions, reconcile watcher overflow and renames, and retain a cancellable progress/error state. Content indexing is opt-in per root with supported MIME extractors and resource limits. Deleted/unreadable paths disappear or show actionable stale-result state rather than successful opens.

Dedicated search supports path navigation, MIME/date filters, sorting and recent files. File actions include open, open-with, reveal, copy path, trash with restore information, rename/move with conflict handling, preview and terminal-here. Multi-selection/file buffer preserves ordered distinct paths and enables only actions supporting the selected cardinality. Universal actions accept typed text/URL/file-list context, including workflow extension points. Permanent deletion requires explicit confirmation; a preview/index retention task never deletes originals.

## Clipboard, snippets and links

Clipboard history stores supported text/HTML/RTF, images and file references; adapters declare actual MIME support. Search/filter, pin/rename, retention, pause, app exclusions, plain-text paste, OCR/QR where supported, and save-as-snippet are exposed. Do not promise universal password detection. Avoid recording Linuxcast's internal snippet/dictation clipboard writes or known concealed formats. PRIMARY selection is separate from CLIPBOARD.

Snippets have names, tags, content, pins and optional typed triggers. Defaults: expansion disabled on import, case-sensitive literal keyword, outside-word matching, delimiter-retain mode, and automatic clipboard restoration off. Offer an explicit generation-guarded Restore Previous Clipboard action; any future automatic mode is best effort and cannot use an unconditional timer. Default delimiters are Space, Tab and Enter; users may add visible punctuation. Reject keywords containing an enabled delimiter. Escape and navigation reset matching. Immediate mode rejects ambiguous keyword prefixes; overlapping enabled scope/keyword bindings are rejected. A workflow trigger cannot silently override a normal snippet. Trigger length is 1–64 Unicode scalar values, without whitespace/control characters; initial raw-key automatic support is tested ASCII only. Known protected fields always pause matching. Unknown focus always pauses. Unavailable sensitivity information pauses unless the user explicitly enables a documented per-app raw-input fallback; that fallback cannot override a known protected-field flag.

The shared placeholder parser supports clipboard, selected text, named argument, date/time/timezone, UUID, calculator output, snippet inclusion and browser context. Use the workflow template grammar `{{namespace.scalarPath}}` and its literal-brace escaping. Named prompt/quicklink arguments occupy `vars`; captured dynamic values occupy `context` (for example `{{vars.query}}` and `{{context.clipboard}}`). Formatting/transformation is an explicit typed template-builder operation performed before scalar interpolation, not code inside braces. Evaluate from a captured context snapshot; no implicit network/model calls, arbitrary code or recursive snippet inclusion. Preserve multiline Unicode output. A cursor marker may occur once and is supported only by an insertion adapter that can place it reliably; otherwise show a manual-copy explanation before insertion.

Quicklinks target URLs, file/folder paths or registered URI schemes, with typed arguments, browser/open-with selection, tags, pin/hide and native export. URL-encode argument values by component, not the entire template. Web searches use the same templates and explicit chosen fallback providers. Browser bookmarks/tabs/history require separate browser companion permissions and profile selection.

## Calculator, dictionary and emoji

Use a deterministic expression parser, never JavaScript eval. Support arithmetic, percentages, functions, units, dates/durations/timezones, colour conversions and copy/paste variants. Currency/crypto results require a configured rate source, show rate timestamp, and label stale cached data offline. Rate endpoints are a first-class adapter; do not invent current values or silently send the user's full root query to a service. An explicit conversion/query is the trigger. Implementation task L2-04 must use a fixture-backed adapter and an opt-in endpoint configuration before any remote-rate request.

Dictionary/spelling uses installed Hunspell language dictionaries and locally configured StarDict-compatible definition/thesaurus datasets. Detect missing language data and offer installation guidance; do not scrape macOS dictionaries or redistribute unlicensed datasets. A URL-based dictionary search is an explicit alternative action. Emoji uses a pinned Unicode dataset with category, search aliases, tone selection, custom keywords, favourites/frecency, copy/paste and grid density. Optional AI semantic lookup follows the global provider configuration and requires explicit invocation.

## Notes, contacts and calendar

Notes have title/body search, quick note, Markdown-compatible rich editing, task lists, slash commands, pin/archive/trash/restore and local export. Autosave transactionally; recover drafts after crashes. A Markdown export preserves content and declares unsupported editor-specific styling.

Contacts support local vCard import/export and optional CardDAV. Search name/address/email, copy fields and explicit email/open-URL actions. Calendar supports local calendars, read-only ICS subscriptions/import, and optional CalDAV accounts. Expose per-source write/RSVP/availability capabilities: read-only feeds never show successful mutation actions. Implement agenda, search, next meeting, create/edit/delete where supported, reminders, attendees, meeting-link opening and application preference. No hidden auto-join; opt-in auto-join still exposes pause/cancel and never toggles a camera silently. Timezones and recurring-event exceptions require fixtures. Meeting recording/transcription uses the explicit local capture/transcription pipeline, with visible recording and consent controls.

## Desktop and focus

Window commands cover halves/thirds/quarters/sixths, maximize, centre, restore, custom bounds, monitor/workspace movement and saved layouts. Use actual work areas and fractional-scale geometry; restore records are bound to live window identity. An absent window in a layout is reported/skipped, not substituted by another app. App-menu search works only for applications exposing a usable accessibility/global-menu API.

System commands route to logind, MPRIS, PipeWire, NetworkManager/BlueZ and desktop adapters as appropriate. Power/session actions, destructive trash operations and app termination use explicit confirmation/effect policies. Unsupported HDR, camera or display controls are labelled rather than faked. Media controls target the chosen current player. App auto-quit defaults to disabled; per-app timeout defaults to three minutes when enabled, pauses for foreground/media/recording activity, excludes desktop/session/Linuxcast/file-manager processes, and requests graceful close only.

Game launching scans Steam and explicit desktop entries, supports manual classification and optional independent Heroic/Lutris adapters. Game mode pauses configured launcher shortcuts and restores them on focus/exit; a recovery path remains reachable. This is a game launcher, not a requirement to ship toy games.

Focus sessions have goal, timed/unlimited duration, pause/resume/finish, app/site allow/block rules and visible status. Browser site rules require the browser companion; app rules use desktop integration and normal-user restrictions. Describe this as a productivity aid, not tamper-proof security. Never change system DNS/firewall/root host files to simulate universal site blocking.

## Media and speech

Screenshots/media library watches explicitly selected folders; displays image/video thumbnails, date/name/OCR search, pin/filter/grid density, preview/open/reveal and explicit deletion. Retention evicts index/cache only by default. Capture uses portal-supported region/window/screen selection; cancellation creates no result. OCR runs on-device, supports downloaded languages and cancellation, and does not send content to AI automatically. QR decoding is local.

Dictation uses local whisper.cpp with an explicit verified model download, mic choice, push-to-talk/toggle, language, waveform/timer, cancel/finish and recording indicator. Vocabulary and style prompts are configurable. Optional cleanup/contextual style uses the selected global AI model only after opt-in; without it, return local transcription. History/statistics are local and deletable. Insertion uses the same focus-safe transaction as snippets. Never paste or submit after recording cancellation; automatic submit is separately opt-in.

## Native package discovery and external integrations

The built-in catalogue starts with reviewed native examples and a static versioned index. Browse/search/detail/install/update/disable/remove and dependency/permission explanations are required; hosted account/publishing/billing services are not. Third-party accounts remain optional.

Use an optional installed 1Password CLI integration for item/bookmark discovery/open actions with its own authentication; do not copy vault secrets into the application index or analytics. Its Linux CLI/app integration is documented by [1Password](https://www.1password.dev/cli/get-started). The Alfred research records its historical versus current workflow behaviour. Other ecosystem services are extensions rather than implicit built-in feature commitments.

## Themes, settings and local diagnostics

Settings supports full search, command visibility/ranking reset, alias/hotkey management, capability diagnostics, permissions, integrations, data retention/export and provider/model configuration. Theme editor previews semantic token changes in light/dark samples, validates readability, and imports/exports the native theme format. No Raycast theme importer.

Diagnostics report versions, backend capabilities and redacted errors. Local usage counts can be disabled/reset; no telemetry service is introduced in v1. Export defaults exclude credentials, clipboard/media content, and run histories; explicit data backups follow the data specification.

Portable full backups are encrypted using the native standard-age format; internal migration snapshots remain clearly labelled private plaintext. Scheduled backup defaults and safe restore are specified in [data](../architecture/data.md#encrypted-portable-backups-and-scheduled-exports).
