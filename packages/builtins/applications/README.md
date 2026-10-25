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

`tests/transport.test.ts` has 49 private synthetic executable checks for pagination,
limits, malformed framing, native failure classification, environment filtering,
cancellation, timeout, shutdown and launched-child independence. These ran with
Node 24.22.1/Bun 1.4.4. They establish transport behaviour, not GIO discovery or
actual desktop launch. The native lane and coordinator own real GIO fixtures and
production Electron launch evidence. Fixtures use generated public names only.

This slice contributes to L1-02-AC01/AC02 and PRIVACY. HTTP/HTTPS handoff is
implemented; broader typed URI/file/argv/shell flows, desktop actions, clearable run history and the supported desktop matrix
remain outstanding; this package does not mark all L1-02 complete.
