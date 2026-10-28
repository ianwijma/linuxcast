# L2-04: configured currency conversion application increment

Bounded REQUIRED rates work on merged PR53/dbafd815. Full agreed local1.0/task/
security/native/AT/release scope remains unchanged. This first increment is
fiat currency conversion through a named configured Frankfurter native adapter.
Required crypto adapter/credential setup and paste variants remain subsequent
application increments, not removed or declared complete. No infrastructure,
research or proof work for the UI author.

## User flow and fixed source

Registered root command `linuxcast:currency-conversion`, title Currency conversion,
opens Rate Form with Amount100, FromUSD, ToEUR. Typing/search never queries rates.
Existing Calculator remains pure/local; remote rates use their own explicit flow.
Rate Form displays configuration state and Configure source, Convert, Cancel,
About rates and Clear cached rates actions as relevant. Convert is deliberate;
only the currency pair goes to the provider, never amount, expression/root query,
clipboard, other application data or credentials. No timers/background refresh.

Initial source disabled. Configure source opens an existing shared Form at depth3
with choices Disabled and Frankfurter reference rates. Show native endpoint
https://api.frankfurter.dev, daily reference-data/approximate display semantics,
only-pair disclosure and no network-on-Save promise. Explicit Save uses source
CAS revision; no source/network enabled implicitly. Disabled refuses conversion.
No arbitrary URL, credential, redirect or local/private endpoint capability.
Frankfurter is a selected native adapter/endpoint, not an inferred default grant.

After explicit Convert, Result Detail shows numeric estimate and target code,
source/endpoint, publication date, fetched UTC timestamp and online/offline plus
stale/recent labels. Data is daily reference data, not guaranteed live/executable
price or accounting precision. Stale if source date older96h, fetch older24h or
clock rollback. A failed explicit fetch may use matching validated stored cache,
clearly Offline/cached and independently labelled stale when applicable. No
matching cache means actionable failure; no invented/simulated result.

User chooses separate Copy result; it sends only opaque quoteID plus registry
revision. Main recomputes from retained exact snapshot/amount, copies canonical
numeric text plus target code and returns exact quoteID/text/currency receipt.
Never send renderer-supplied rate/result/endpoint authority. Quotes are ephemeral,
main-owned, expire after5min, invalidated by config change/clear/registry/context.
No stored amount, quote/result/expression/root history. Cache only provider/pair/
rate/publicationdate/fetchtime, at most64pairs under existing single storageowner.
Clear cached rates is explicit; disabling source does not silently delete cache.

## Frozen types/API

packages/contracts/src/rate-conversion.ts is coordinator-owned. RateConversionApi:
- getRateConfiguration({revision}) -> {revision,source,endpoint} or safe failure.
- configureRateSource({revision,expectedRevision,source:'disabled'|'frankfurter'})
  -> fresh configuration; unknown/late Save must not be treated as confirmed.
- convertRate({revision,configurationRevision,amount,base,quote}) -> RateQuote.
- copyRateResult({revision,quoteId}) -> {outcome:'copied',quoteId,text,currency}.
- clearRateCache({revision,configurationRevision}) -> {outcome:'cleared'}.
All replies wrapped in existing {ok,value/error}, strict schemas. ProtocolVersion
is added only by preload; renderer supplies only listed arguments. API methods
are named, no generic invoke. Registry revision must identify current shown/
enabled command; configuration revision is separate. Commands/preferences/main/
preload/routing integration belongs to coordinator.

Amount is signed bounded decimal, no exponent/commas/expressions, max15integer/
18fraction digits; currency codes uppercase3ASCII, distinct pair. Native provider
validates supported pair and response identity. Result number uses existing15sig
floating-point display, no exact accounting claim. RateQuote includes id,
configurationRevision,amount,base,quote,text,provider,endpoint,asOfDate,fetchedAt,
connection:'online'|'offline',stale:boolean,expiresAt. Strict receipt matching
quoteID/text/target code and full schema, no numeric/colour/date cross-kind ack.

## Bounded UI ownership

Read FULL docs/implementation/tasks/L2-04.md and L1-01.md plus normative security,
data, product/builtins, testing-release, DESIGN/tokens and this freeze. Existing
reviewed shell/storage/sharedUI are reused under approved unfinished increments;
full prerequisites/native/release acceptance stay pending.

manifest_review_sol owns new calculator src/rate-presentation.ts, existing
calculator fixtures/tests and new rate presentation/browser tests, README and
relevant evidence. Necessary launcher fixture/test/README/evidence changes only;
no launcher controller/shared contracts/engine/service/storage/main/preload/
manifests/lock/mapping/registry edits. Request shared changes from coordinator.

Export class RateConversionFlow from rate-presentation.ts, matching existing
CalculatorFlow lifecycle interface: constructor({session,api,viewId,revision}),
active getter, owns(viewId), open(fromViewId), handle(intent), closed(viewId),
dispose(). API is Pick<RateConversionApi,...named methods>. Coordinator wires
root command and close routes. No actual backend or production success claim
from component fixture mocks.

Use existing host Form/Detail/primitives/tokens, root→Form→Result/config/help
maxdepth3. Preserve original root query/selection, unsent config/currency fields,
Back/focus, heldEnter/IME/200%/axe. Rate configuration owner reads do no network;
no fake default-success if API/read unavailable. Pending Convert/Save/Copy/clear
have clear disabled actions, bounded wait, cancellation/late-result handling.
Manual Reload configuration recovers conflict/unknown, no automatic replay.
Invalid input/errors are actionable with no raw provider response/diagnostics.

Check context immediately before every API dispatch after publishing pending
state (reentrant Back/Hide/dispose/query changes dispatch nothing); check original
root and exact view/revision on completion. Hidden/disabled/stale registration,
config changes, older completions and expired quotes cannot Copy. Copy timeout
or lost receipt says unknown, never confirmed/automatically repeated. Existing
main clipboard pending slot protects unresolved writes. Explicit unavailable
copy still allows result reading with remediation. Do not invent paste success.

Bounded evidence: disabled→config Save→Convert→timestamped Result→separate Copy;
Save/typing/help no fetch, only-pair request; online/recent, stale/offline cached,
missing/unsupported cache, config conflict/unavailable/unknown+manual recovery,
old context/completion/receipt refusal, heldEnter/IME/helpback/200%/axe and relevant
actual dark/light captures. Coordinator proves storage/network/main/native Copy;
UI fixtures remain labelled component/synthetic only. AC02/UI/task remain pending
until full crypto/copy-paste/native/release evidence, not inferred from this slice.

## Primary provider references (coordinator verified29October2026)

Frankfurter v2 native single-pair route /v2/rate/{base}/{quote}; response strict
{date,base,quote,rate}; no key; amount calculated locally. Unknown codes422.
https://frankfurter.dev/ and https://frankfurter.dev/javascript/ .
Crypto remains required: CoinGecko Demo simple/price has last_updated_at support
and documented x-cg-demo-api-key authentication; no subscription-token harvesting
or insecure key storage. https://docs.coingecko.com/demo/reference/simple-price .
Context7 skill queried; tool unavailable, official primary docs used directly.
