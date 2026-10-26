# Registered application actions — bounded L1-02 increment

Implementation contract, not completion evidence. Uses L1-02 and the existing
L1-01 launcher/shared List/Actions. Full typed file/URI/argv/shell/history,
permissions UI, supported desktop/AT and release requirements remain required.

Native GIO discovery uses list_actions/get_action_name, not an Exec parser.
Expose only declared IDs matching `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`, unique,
max16; titles are nonempty valid UTF-8, no controls, max128 bytes. Native
application `actions?: {available:boolean,actions:{id,title}[]}` is optional for
legacy metadata. Unsupported/oversized/malformed lists use false/empty, never
partial actions. Primary Open stays independent. All labels/IDs are data.

Main projects that same object as `LauncherCommandMetadata.applicationActions`
for application IDs only. It owns the native desktopId/fingerprint mapping;
renderers never receive filenames, Exec, argv or fingerprint authority. Action
metadata must participate in registry revision/fingerprint checks, including an
action Exec change even if the primary entry is unchanged. Native must bound
any source-file hashing and revalidate the current GIO entry and declared action
before invocation. No shell, primary-launch fallback or new dependency.

Named optional preload `executeApplicationAction({commandId,revision,actionId})`
uses launcher:application-action. Main requires own current frame, current
revision, current registered enabled nonhidden application and declared ID,
fresh visibility preflight and sender revalidation after awaits. Serialize with
existing native effects and metadata writes; never queue/replay uncertain work.
Adapter adds launchAction({desktopId,fingerprint,actionId},{signal?}) and the
native fixed operation launch-action with protocolVersion1.

GIO launch_action returns void and cannot establish target success. Native and
launcher action receipts are `{outcome:'requested',actionId}` only; validate exact
requested identity before accepting. Native reply additionally has protocolVersion1.
Do not reuse primary `dispatched` or say an application completed/focused/opened.
Known stale/missing/unavailable preflight is not-dispatched; malformed reply,
deadline/cancellation/process loss after request is unknown, never automatically
replayed. Child stdin/stdout/stderr must be isolated from helper protocol, even
for action launch; application output must never corrupt a receipt or inherit
the incoming protocol. Release only owned helper resources, not launched apps.

UI app Actions keeps Open primary and preserves pin/alias/hide/management.
Append explicit labelled application actions using `launcher:application:<id>`;
require the current selected application, no arbitrary values, no query/selection
dispatch. Use existing shared components and pending/error lifecycle. No action
execution in Manage commands. False availability shows a disabled actionable
reason: open the application to use its other actions. No legacy/empty-action
UI is invented. Known denial is actionable, unknown outcome tells users to
check the application then Reload; no saved-success claim or replay. Back/Hide,
selection/query change, stale late reply and disposal cannot dismiss another
context or publish success. Main does not hide for this action. After a matching
requested receipt and unchanged context, UI invokes named Hide separately; Hide
failure retains the truthful requested state and cannot replay/reclassify the
action as unknown. Only explicit complete Reload clears action uncertainty;
automatic reopen/Calculator-close refresh does not. Main records command-use only after a matching
requested receipt, without storing action IDs, arguments or private content.

Bounded checks: strict native/launcher contracts, native public private-XDG
fixture with real distinct primary/action argv marker and isolated stdio,
changed action Exec/ID/fingerprint and missing/malformed/bounds denial;
transport cancellation/unknown/no replay; main spoofed/stale/hidden/foreign
action/no-effect guards; shared keyboard/axe and affected dark/light captures;
actual bundled launcher search→Actions→specific action→real process marker.
No supported native-session/AT/release or full task completion from these checks.

Primary API evidence (APIs since GLib2.38; verify installed baseline in tests):
[list_actions](https://docs.gtk.org/gio-unix/method.DesktopAppInfo.list_actions.html),
[get_action_name](https://docs.gtk.org/gio-unix/method.DesktopAppInfo.get_action_name.html),
[launch_action](https://docs.gtk.org/gio-unix/method.DesktopAppInfo.launch_action.html).
