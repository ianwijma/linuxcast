# Application catalogue transport — bounded L1-02 slice

`createApplications({helperPath})` is a main-only adapter for the packaged native
GIO helper. The trusted host supplies its absolute executable path. `list()`
collects the complete ordered catalogue and `launch({desktopId, fingerprint})`
returns only `dispatched`. Launch acknowledgement does not prove a focused
window or completed application startup. There is no renderer path, Exec parser,
shell, arbitrary argv, file URI or provider call in this adapter.

Every operation starts one helper with the fixed `applications` argument, sends
one validated JSON line followed by EOF, and requires one strict reply and exit
zero. Input is at most 64 KiB, output at most 1 MiB, each helper has a 2.5-second
deadline, and at most two helpers run concurrently. Catalogue pages contain at
most 100 entries; UTF-8 byte ordering, duplicate identities, continuation and
the 4,096-entry limit are checked before any catalogue is returned. No partial
catalogue is published. An explicit environment allowlist passes desktop/session,
HOME/XDG, path and locale variables; provider credentials, loader flags and GIO
module injection variables are excluded. Raw output/errors are never surfaced.

`ApplicationsUnavailable` exposes fixed `reason` and `effectOutcome` fields.
Known native invalid-request, stale-application and unavailable rejections are
`not-dispatched`. A launch-failed reply, malformed reply, deadline or post-request
process failure is `unknown`. No launch is automatically replayed. Cancellation,
`stop()` and `terminate()` kill and wait for owned helper processes; they never
kill an intentionally launched application or an unrelated process group.

`openUrl(url, {signal})` adds a distinct explicit HTTP/HTTPS operation on the
same bounded helper transport. The shared schema validates and canonicalizes
addresses locally before a helper starts; credentials, unsupported schemes,
raw whitespace/control/surrogate/backslash characters, malformed escapes and
oversized addresses reject. No DNS lookup, renderer network request or shell is
used to validate an address. The helper receives one JSON `open-url` request.
A strict `dispatched` receipt says only that the native handoff was accepted.
Known invalid-request/unavailable replies are not-dispatched; launch-failed,
malformed/unexpected replies, timeout and post-request process failures are
unknown. Cancellation/shutdown cannot establish that a browser effect was undone.
No URL is automatically retried or saved as history by this adapter.

`tests/transport.test.ts` has 69 private synthetic executable checks for pagination,
limits, malformed framing, native failure classification, environment filtering,
cancellation, timeout, shutdown and launched-child independence. These ran with
Node 24.22.1/Bun 1.4.4. They establish transport behaviour, not GIO discovery or
actual desktop launch. The native lane and coordinator own real GIO fixtures and
production Electron launch evidence. Fixtures use generated public names only.

This slice contributes to L1-02-AC01/AC02 and PRIVACY. HTTP/HTTPS handoff is
implemented; broader typed URI/file/argv/shell flows, clearable run history and the supported desktop matrix
remain outstanding; this package does not mark all L1-02 complete.


`launchAction({desktopId, fingerprint, actionId}, {signal})` sends the distinct
`launch-action` operation. It accepts only `{outcome: 'requested', actionId}`
matching that request. GIO's action API returns void: a request receipt never
proves that an application started, completed, or focused. Invalid/stale/unavailable
preflight errors are not-dispatched; malformed/mismatched receipts, launch-failed,
timeout, cancellation after admission, and process loss remain unknown. Nothing
is replayed automatically.

The native catalogue publishes at most 16 unique declared action IDs with bounded
localized display names, or an unavailable empty list. Primary Open remains
independent. Only entries with supported nonempty action lists require a trusted
GIO desktop-entry source hash: at most 1 MiB per regular file and 8 MiB total per
helper invocation, assigned in desktop-ID order consistently across pages. A
source read failure or exhausted budget disables affected actions. Primary Open
can validate the no-source fingerprint; action launch cannot use that fallback.
The source hash includes action Exec and metadata changes without parsing Exec.
Fresh GIO construction revalidates every launch. Action child streams point at
/dev/null, and saved helper protocol descriptors are CLOEXEC.

Eleven native private-XDG tests exercise actual GIO discovery, primary/action
argument handling, stale entries, bounds and deterministic source budgets, plus
HTTP handoff regressions. Generated child fixtures observe empty stdin and no
inherited protocol pipes. These checks do not establish supported desktop/DBus
activation, terminal integration, localization coverage, native accessibility, or
release acceptance. Production Electron action UI integration is coordinator-owned.
