# Shared synthetic AI scenarios

These version1 JSON fixtures are the accepted F0-01 handoff required by
`docs/architecture/ai.md` before feature implementation fans out. All content,
identities, references, timestamps and URLs are synthetic. They contain no
credentials or captured user content and perform no provider/network/effect calls.

| Fixture | Boundary and consumer expectation |
| --- | --- |
| selection-snapshot | Broker captures one global selection and explicit selected-text provenance. Later settings changes do not reroute the run or alter captured context. Resolve references and obtain required transmission consent before sending. |
| multipart-success | User text/image/file parts and a successful ordered stream survive fragmented framing. All parts use the captured model; no attachment is silently removed. |
| truncated-stream | Complete text before an incomplete final frame remains partial. EOF produces failure; no completed result or automatic replay. |
| tool-approval | Partial arguments cannot dispatch. One complete registered call is approved, executed and journaled before its committed result enters model context. |
| tool-denial | The same call is denied; zero execution and zero equivalent fallback effects. A committed denial result records the unchanged decision. |
| authentication-refresh | One simulated refresh outcome becomes ready only with inference authorization/account eligibility. Failed refresh remains actionable; neither branch changes provider/model or invents fallback. |
| capability-rejection | Image input on an incapable selected model sends nothing. Preserve the draft and attachment and expose the actionable failure. |
| interrupted-recovery | Unknown dispatched effect remains interrupted and requires review; no automatic replay. |

Each fixture's `expected` object specifies obligations for future adapter,
coordinator, persistence and UI tests. The contract suite validates serialized
inputs/events/records, selection copying, framing/truncation, tool argument
validation and interruption rejection. It also checks fixture consistency.
Assertions about expected call counts are **scenario requirements**, not evidence
that an unimplemented runtime enforced them. Consumers must drive their actual
implementation with these fixtures and assert recorded calls and state changes.

Load a fresh deep copy per test. Frame `events` in order, splitting the encoded
bytes using repeated `chunkSizes` when supplied. For truncation, encode all
`completeEvents`, then encode `truncatedEvent` and omit `dropTailBytes` before EOF.
Tool fixtures intentionally stop the provider stream at a complete request while
approval is pending; `committedMessage` is eligible only after `committedResult`
is durable. Authentication fixtures expose success and failure branches, not a
claim of real OAuth transport or valid scopes. Follow-up provider protocols,
remote authentication, actual capability/permission checks and Debian evidence
remain the relevant implementation tasks' responsibility.
