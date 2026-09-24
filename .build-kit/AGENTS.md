# Build-kit Agent Learnings

Reusable patterns discovered while building slices. Read this before starting work; append
compressed, general learnings here (not slice-specific details — those go in progress.txt).

## Identifying a polling automation vs. a reactor

A processor with `fields: []`, no `triggerEvent`, and exactly one INBOUND dependency of
`elementType: "READMODEL"` is a *polling* automation (see `RemindersDue` → `SendReservationReminder`
for the reference implementation: a `node-cron` tick drains due rows out of the read model's table
and fires the command per row). It does not react to an event via `PostgreSQLEventStoreConsumer`.

## Blocked upstream dependencies propagate

If an AUTOMATION slice's processor depends solely on a READMODEL slice that is itself `Blocked` or
has no implementation, the automation cannot be built either — its command fields have nowhere to
come from. Check the upstream dependency's status in `index.json` before starting; if it's blocked
for a data-model reason, escalate the downstream slice too rather than guessing the missing shape,
and reference the earlier block instead of re-deriving the same ambiguity.

## A downstream event type may not exist yet in `{Context}Events.ts`

A STATE_VIEW that consumes an event emitted by a still-Planned/unbuilt AUTOMATION or
COMMAND slice needs that event's TypeScript type added as a pure consumer before it can
be built. Copy the field shape verbatim from the emitting slice's own `slice.json`
(`events[]` block) rather than inventing it — when that slice is later built, it reuses
the same type instead of redeclaring it. Do not treat "the event's emitter isn't built
yet" as a blocker in itself; only the emitter's own build needs the command/processor
side of that event.

## The commit-scope guard rejects mixed slice-code + board-metadata commits

`slice-scope` in `.build-kit/lib/checks/` fails any commit that stages both
`src/slices/**` files and `.build-kit/.slices/**` files together. Always commit slice
code first (`feat: [SliceName]`), then a separate `chore:` commit for the
`index.json`/`slice.json` status change to `Done`.

## Two commands sharing one stream reuse the same overlap-checking shape

When a new command's `decide`/`evolve` targets the same stream key an existing command already
uses (e.g. `Day7-table-{tableNumber}`, shared by `BlockTable` and `HoldTableForReservation`), copy
that existing command's time-overlap helpers (`toMinutes`, `overlaps`) and state-accumulation
pattern (a list of ranges plus a `Record` of active/released-or-cancelled holds) rather than
reinventing them — the two commands reject for the same underlying reason (the stream's other
events), just through different error codes and command names.

## A polling automation's "no capacity data" workaround is a processor constant, not a slice.json field

When a processor must pick from a range that has no backing configuration in the codebase (e.g.
walking table numbers 1–20 because there is no published table/seat-capacity concept — see
`AutoSeatingCandidates`'s own resolution), the range bound is an internal implementation constant
in `processor.ts`, not something to add to slice.json or the command's fields. Match the bound to
whatever numbers are already used across the context's existing test fixtures/board examples so it
stays consistent.

## Check `{Context}Events.ts` before adding an event type, not just when it's missing

A STATE_VIEW slice's dependency events may already be fully declared by the time you build it — an
earlier slice may have added them as pure-consumer types (see the entry above), or they may be
another context's event re-exported (e.g. Day6's `ReservationConfirmed` re-exported from
`Day7Events.ts`). Always grep the events file first; only add a type when it's truly missing.

## A command's stream key may need to be inferred from which events its specs mix together

If a command's specifications mix `given`/`then` events from more than one emitter (e.g.
`TableHeldForReservation` + `TableHoldReleased` + `ReservationConfirmed`), and slice.json's own
command/processor dependencies don't spell out the stream, check whether those events already
share one stream elsewhere in the codebase (grep other commands' `streamNameFor`) before assuming
the command should key off the read model's own id field. If `decide()` needs to see all of those
events to run its guards, it must replay the stream they actually share — not a stream keyed by an
id that only appears on some of them. A still-`Planned` downstream sibling slice's own
specifications can be the tie-breaker: if its guard only makes sense when a given event lands on a
specific stream, that's evidence for which stream the upstream command must use too.

## A polling automation's business rule needs a field to evaluate it, not just a description

The AutoSeatingCandidates-style ambiguity (a derived concept named only in prose, with no backing
field/event anywhere) also applies to a polling AUTOMATION's condition for firing its command, not
just a STATE_VIEW's derived field. If a processor's `description` names a rule (e.g. "release the
hold when it fails a second-step check: blacklist / payment / window expiry") but its INBOUND
READMODEL has no field encoding that rule's outcome, the processor cannot decide unconditionally —
grep the whole codebase for the named concept (blacklist, payment, expiry/window, etc.) the same
way you would for a derived-field mapping before concluding it's genuinely unbuilt, then escalate
via `request-feedback` rather than inventing a stand-in data source.

## A blocked slice can be unblocked by narrowing the processor, not the command

When a board author resolves a "business rule has no data source" block by rescoping the
processor's own description/mapping (see ReleaseTableHold after AutoSeatingCandidates-style
escalation), the command keeps accepting the full original field range — only the processor's
own derivation narrows to the one condition it can actually evaluate. Implement that narrowed
condition in `processor.ts`, but still write and pass every specification in slice.json,
including ones the processor itself will never trigger (a caller/staff-supplied value still
has to be accepted and produce the same event).

## Wall-clock threshold checks reuse one UTC-frame arithmetic helper

`NoShowsDueProjection.ts`'s `wallClock(date, time)` (parse `DD.MM.YYYY`/`HH:MM`, `Date.UTC(...)`)
is the canonical "has this deadline passed" arithmetic in this codebase — reuse it (copy the
function, don't invent new date parsing) any time a polling processor needs to compare a read
model's date/time fields against `now`. If the read model has no precomputed sortable column for
the specific threshold (unlike NoShowsDue's own `grace_ends_at_sortable`), filter in the
processor's drain loop instead of adding a SQL predicate.

## Not every unbuilt cross-context event emitter is a blocker

An INBOUND event dependency whose emitting command/context isn't built yet is only a blocker if
the event's *shape itself* is underspecified (see the AutoSeatingCandidates-style "derived field
with no backing concept" cases above). If slice.json's own `given`/`then` examples already fully
pin down the event's fields, declare it as a pure-consumer type in `{Context}Events.ts` (per the
existing "downstream event type may not exist yet" entry) and build normally — do not escalate
just because the emitter lives in a different, still-unbuilt context/chapter.

## `search_board_events` can miss a node that exists

It matches by title and can return an empty result for an event that is visibly present on the
board. Don't conclude "not built" from an empty search alone — walk from a known id instead: the
slice's own `dependencies[]` in slice.json carries the INBOUND event's board node id directly, so
`get_node`/`get_connected_nodes` on that id resolves it even when full-text search fails. Also
watch for multiple similarly-named contexts/chapters (e.g. two different "...Backoffice..."
chapters on the same board) — match by node/context id, not by name similarity.

## Resolving board/MCP credentials when `.build-kit/.eventmodelers/config.json` is absent

The Ralph loop instructions say to skip all platform communication when that specific file is
missing — but the *root* `.eventmodelers/config.json` and `.mcp.json` (one level up) can still
resolve MCP credentials for slices that do need board sync (e.g. `request-feedback`). If a slice id
needs to be found on a specific board and no config pins one, use
`mcp__eventmodelers__list_boards` then `mcp__eventmodelers__list_slices { boardId }` for each
candidate board and match by slice id/title.

## A `idAttribute: true` field isn't always the natural primary key

Check whether the field flagged `idAttribute: true` is actually unique per row before using it as
the table's PK. `TablesToServe`/`HeldReservations` both flag a shared field (`date`/nothing) while
the genuinely unique key is a different field already in the read model (`reservationCode`) —
many rows share one date/table, but each reservation code is unique. Pick the PK by reasoning about
the domain, not by trusting the flag alone.

## A read model reacts only to the events in its own slice.json `dependencies[]`

If a domain event with the same subject exists elsewhere in `{Context}Events.ts` (e.g.
`ReservationCancelled` next to `ReservationConfirmed`) but isn't listed as an INBOUND dependency on
the slice being built, do not add handling for it "to be safe" — a read model with only one INBOUND
event dependency and no matching removal event is insert-only by design. Only wire up
`canHandle`/`evolve` cases for events slice.json's own `dependencies[]` actually names.

## Not every Day context's staging data lives on a branch — check main first

Earlier Day7 slices required starting `feature/<slice>` branches from the `day7`/`day12` staging
branches because `main` didn't yet contain that context's `.build-kit/.slices/**` files. This isn't
universal: some contexts (e.g. Day12's own slice metadata) are already merged into `main`. Run
`git merge-base --is-ancestor <staging-branch> main` before assuming a feature branch needs a
non-main base — starting from the wrong base either misses files (if staging is ahead) or is
simply unnecessary (if main already has everything).

## A `generated: true` field may need to be computed in `decide()`, not stamped by the route

Two different things both get marked `generated: true` on a command/event field, and they need
opposite implementations. A random, stream-independent value (OpenOrder's `orderNumber`,
PlaceReservation's `reservationCode`) is generated once in `routes.ts` before the command is
built, so `decide()` stays pure and testable. A value that is *sequential per parent id* (Add
Order Line's `lineNumber` — one running counter per `orderNumber`) cannot be pre-generated by the
route without a race against concurrent appends; it has to be derived inside `decide()` from
replayed state (a `Record<parentId, count>` incremented per matching past event), and the route
recovers the value afterward by reading it back off `result.newEvents`. Check whether the field's
value depends on this stream's own history before choosing where to generate it.

## Sibling commands on the same stream can share one lookup projection

If two STATE_CHANGE slices in the same context both key their stream by the same *other* id than
the one their own command carries (e.g. `AddOrderLine` and `ChangeOrderLine` both carry only
`orderNumber` but both need the `Day12-table-{tableNumber}` stream), don't build a second lookup
projection — import and reuse the first slice's existing one
(`OrderLookupProjection`/`findTableNumberByOrderNumber`) from the sibling's own folder. Only build
a new lookup table when the id mapping it resolves is actually different.

## Don't invent an error code a sibling slice has but this slice's specifications don't

Two slices that look like near-duplicates (e.g. `AddOrderLine` guards against an unknown order,
`ChangeOrderLine` does not list that as its own specification) can legitimately have different
guard sets — check slice.json's own `specifications[]`, not what an analogous sibling slice
implements. If a case a sibling covers explicitly isn't its own SPEC_ERROR here, look for whether
an already-required guard produces the same externally-observable rejection anyway (here: an order
that was never opened has no matching line, so the "line not found" guard already rejects it) —
fold it in there instead of adding a new error code with no backing specification.

## A mixed Single/List-cardinality read model is a header + lines, built as two tables

When a slice.json read model has both `Single`-cardinality fields (order/parent-level, e.g.
orderNumber, tableNumber) and `List`-cardinality fields (a repeating group, e.g. per-line
itemNumber/quantity), there is no JSONB/`json_agg` precedent in this codebase — every existing
projection writes flat SQL rows via knex with no query-layer aggregation helper. Build it as two
plain tables (header + lines, composite PK `(parentId, lineId)` on the lines table), join them in
application code inside `routes.ts`, and return each List-cardinality field as a JSON array under
its own slice.json field name (e.g. `quantity: number[]`) — not as an invented nested `lines: [...]`
object. A header row can legitimately have zero lines (e.g. after every line is removed); a single
denormalized table can't represent that without a nullable placeholder row, so don't reach for one
just because the fields all "belong" to one screen/query.

## An event field mapped from an earlier event, not the triggering command, must come from replayed state

When a slice.json event field's `mapping` points at a *different, earlier* event in the same
stream (e.g. `OrderSubmittedToKitchen.tableNumber` mapped from `OrderOpened.tableNumber`,
while the triggering command only carries `orderNumber`/`submittedAt`), don't add that field
to the command — carry it in the decider's own state instead (evolve() stores it off the
earlier event) and read it back in `decide()` when constructing the new event. Also: when two
separate specifications (e.g. "pad never had a line" and "pad's only lines were later
removed") both produce the same externally-observable rejection, one guard covering both is
correct — don't split into two error codes just because slice.json lists them as separate
specs.

## A command whose data lacks the stream's key field needs a lookup projection

If a command's own fields don't include the id the target stream is keyed by (e.g. `Add Order
Line` carries only `orderNumber`, but Open Order's stream is `Day12-table-{tableNumber}`), build
a lookup projection exactly like `ReservationLookupProjection`/`OrderLookupProjection`: populate it
from whichever event first links the two ids, read it in `routes.ts` before constructing the
command, and 409 with a distinct message if the lookup itself misses (stream not found) versus if
`decide()`'s own precondition fails (stream found, but the guard rejects) — collapsing the two
hides a stream-id mismatch behind what looks like a normal business rejection.

## A read model that must "freeze" a snapshot on a later event needs a working table plus a frozen table

When a header+lines read model (see "A mixed Single/List-cardinality read model is a header +
lines" above) must additionally (a) stay invisible until some later triggering event, and (b) show
values frozen at that trigger's moment, immune to edits afterward, a single lines table filtered by
a boolean flag isn't enough — that only covers "gains a flag once visible" (OrderPad's
`submitted`), not "doesn't exist yet, then never changes again" (KitchenQueue). Use a working table
(mutated by the same add/change/remove events as any other lines table) plus a separate pair of
frozen tables populated exactly once, at the triggering event, via `INSERT INTO ... SELECT`
(in knex: pass a `.select()` query builder as the argument to `.insert()`). This makes both
invariants structural rather than relying on route-level filtering or an upstream command's own
guards to prevent further mutation.

## A STATE_VIEW's missing dependency (vs. a similar sibling's) is a signal, not an oversight

If a read model's `dependencies[]` omits an event that a structurally similar sibling slice does
list (e.g. KitchenQueue has no `OrderOpened` INBOUND, while OrderPad — the other header+lines view
over the same order — does), don't add it "to be consistent." It means this read model genuinely
doesn't need that event's fields (KitchenQueue never surfaces `serverName`/`openedAt`). Reinforces
the existing "only react to declared dependencies" rule at the sibling-comparison level, not just
when checking a single slice against `{Context}Events.ts`.

## A slice's staging `context` follows the stream it must replay, not the chapter it was drawn in

A slice.json's `context` drives both `src/slices/{context}/` and the `{context}-...` stream prefix in
`streamNameFor`, so it has to match whichever context already *wrote* the events the slice replays —
not the chapter or MODEL_CONTEXT name the board exports. Day13's slices are drawn in chapter `Day13`
under MODEL_CONTEXT "Order Management", but their deciders replay `Day12-table-{tableNumber}` streams
written by Day12's commands, so they are staged under `.build-kit/.slices/day12/` with `context`
forced to `"Day12"` while `chapter` stays `"Day13"`. Build them into `src/slices/Day12/{SliceName}/`,
extend the existing `src/slices/Day12/Day12Events.ts` union, and reuse
``export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;`` verbatim.
Do not "fix" the `context`/`chapter` mismatch, and do not create an `OrderManagement` folder or
stream prefix: `findSliceJson`'s `normalize()` would still resolve the checks, so nothing would block
— the slice would just silently read an empty stream and pass every unit test while being broken
end to end.

## knex's object-form join alias breaks silently under `.withSchema()`

`.join({alias: tableName}, ...)` combined with a separate `.withSchema('public')` call renders the
alias object into the query string instead of a name (`"public"."[object Object]"`) — `tsc` and the
build give no warning, it only surfaces as a Postgres `relation "public.[object Object]" does not
exist` error at test time. Use the string form for any joined query in a projection's `evolve()`:
`db('public.tablename as alias')`, qualifying the schema inline rather than via `.withSchema()`.

## A STATE_VIEW can need a lookup table fed by an unrelated event stream

Same shape as the existing "a command's data lacks the stream's key field needs a lookup
projection" entry, but on the read-model side: a projection's own primary events (e.g. an order's
line events) can be missing a field (e.g. `category`) that only exists on a completely different
domain's event (e.g. the restaurant catalogue's `OrderableItemAdded`). Build a small lookup table
fed by that other event, upserted in the same projection's `evolve()`, and join it in the query
that builds the frozen row — no need to route the enrichment through a separate slice.

## A `derived:` mapping with a concrete lookup table is not the AutoSeatingCandidates-style ambiguity

The escalation rule for "a named business concept with no backing field/event anywhere" (see the
polling-automation and derived-field entries above) does not apply when the mapping string itself
spells out a closed lookup (e.g. `derived:OrderLinesToRoute.category (Menu->kitchen, Drink->bar,
Dessert->dessert)`). That string *is* the data — implement it as a plain `Record<string, string>`
constant in the processor/decider, no `request-feedback` needed. Only escalate when the concept is
named but never given a concrete rule to compute it from.

## A pure-AUTOMATION command's `generated: true` field is stamped by the processor, not `decide()`

`OpenOrder`/`SubmitOrderToKitchen` stamp their stream-independent `generated: true` fields
(`openedAt`, `submittedAt`) in `routes.ts` before building the command, keeping `decide()` pure.
A command that only exists to be fired by a processor (no `routes.ts` at all, e.g.
`RouteOrderLineToStation`'s `routedAt`) has no route to do this — the processor plays that same
role instead, stamping the value into `command.metadata` at the point it constructs the command,
and `decide()` reads it back from metadata exactly as `SendReservationReminder` already does for
`sentAt`.

## Not every command on a shared stream needs a lookup projection

The "command whose data lacks the stream's key field needs a lookup projection" rule (see
`AddOrderLine`/`ChangeOrderLine`, which only carry `orderNumber`) doesn't apply when the
command's own fields already include the stream-key field directly (e.g.
`StartItemPreparation` carries `tableNumber` per slice.json, same stream as
`RouteOrderLineToStation`/`AddOrderLine`) — just read it straight from the request in
`routes.ts`, no lookup table needed.

## A SCREEN-only INBOUND dependency doesn't change a STATE_CHANGE's implementation

A command whose only INBOUND dependency is a SCREEN (not a READMODEL or `triggerEvent`) is
still a plain command-driven slice — the screen is the UI that calls the command's HTTP
route, it isn't a data source `decide()`/`evolve()` need to replay. Build it exactly like
any other STATE_CHANGE slice; don't treat the SCREEN dependency as something requiring
special handling.

## A STATE_VIEW's INBOUND dependency with no field mapping can still be a delete trigger

Not every INBOUND event on a read model's `dependencies[]` contributes a field — one can exist
solely to remove a row (see StationQueue's `ItemPreparationStarted`: no field in the read model
maps from it, and this slice's own `specifications[]` never exercises it directly). Don't treat
the absence of a field mapping as "this dependency does nothing." Check sibling slices that also
consume or emit that event for a specification implying the removal behavior (StationQueue's
sibling `StartItemPreparation`/`ReadyItemsForServer` both independently confirm "once
preparation starts, the line stops waiting/appearing elsewhere") and add `evolve()`'s delete
case plus a test for it, even though it's not literally one of this slice's own listed specs.

## A read model's lines can outlive a sibling's delete-on-next-event pattern

Don't assume every "line moves through stages" read model deletes the line once it advances
(StationQueue deletes on `ItemPreparationStarted`, ReadyItemsForServer deletes on
`ItemServed`) — check whether *this* slice's own field list needs the line to remain visible
in more than one state. TableBill also reacts to `ItemServed`, but must keep showing the line
(now with `lineServed: true`) rather than remove it, because a bill has to list served items
too. Update the row in place instead of deleting it whenever a later field in slice.json's
own read model needs to reflect that later event's outcome.

## A `derived:` sum/aggregate over List-cardinality fields is computed in the route, not SQL

`aggregate:sum(unitPrice * quantity)`-style mappings have no SQL-side precedent in this
codebase (no generated columns, no window functions in any projection's `evolve()`) — compute
the total in the route handler after joining header + lines, right where OrderPad/KitchenQueue
already assemble their own List-cardinality arrays from the lines table.

## A projection test's Postgres container is shared across every `it()` in one `describe`

`PostgreSQLProjectionSpec` starts one container in `before()` for the whole `describe` block, not
per test — rows inserted by an earlier test's `given([...])` are still there for a later test
unless the business id used is unique. Give every test its own unique id even when two tests
exercise different event sequences; reusing a shared default (e.g. `orderNumber = 'O-1042'` across
two `it()`s) causes one test to see the other's leftover row.

## A `TIMESTAMP` (no timezone) column reads back shifted by the process's local timezone

Knex/node-postgres parses a schema `TIMESTAMP` column (as opposed to `TIMESTAMPTZ`) using the test
process's local timezone, not UTC — so `assert.strictEqual(new Date(row.someField).toISOString(),
'2026-04-15T20:15:00.000Z')` can fail even though the projection wrote the value correctly. No
existing Day12 projection test asserts an exact ISO string against one of these columns for this
reason; assert existence (`assert.ok(row.someTimestampField)`) instead.

## Board sync can work even when `.build-kit/.eventmodelers/config.json` is absent

Beyond the "resolving credentials" entry above: if `mcp__eventmodelers__*` tools are already
visible in the session (registered via the *root* `.mcp.json` + `.claude/settings.local.json`'s
`EVENTMODELERS_TOKEN`, one level up from `.build-kit/`), board sync works with zero config-file
reads — `list_boards` then `list_slices { boardId }` per candidate finds the slice by title, and
`update_slice_status { boardId, sliceId, newStatus }` claims/closes it directly. Don't skip the
`update-slice-status` step just because the build-kit-specific config file is missing; check
whether the MCP tools already resolve before falling back to "local-only, no board sync."

## A `user:session.*` field mapping doesn't require building session/auth infrastructure

A command field mapped `user:session.<field>` (distinct from `user:input`) describes where a
real UI would source the value (a logged-in user's own session), not a build requirement. If
the codebase has no session/auth infra anywhere (grep for `express-session`/`req.session`/
`passport` first), treat the field exactly like a plain staff-supplied value read from the
request body — e.g. ServeItem's `serverName` is read from `req.body.serverName`, same as
OpenOrder's own unprefixed `serverName` field.

## An automation reads a read model and writes a *different* stream — assert the write stream

A polling automation has two independent stream decisions, and only one of them is visible in the
processor. The processor *reads* a read model that may be keyed on anything (a paymentId, a line
number); the command it dispatches *writes* to whatever stream `streamNameFor()` builds. Those two
keys are usually different, and unit tests on `decide`/`evolve` cannot see the write key at all —
a wrong prefix produces a perfectly green test suite and a system where no existing consumer ever
sees the event.

The read-model row is what carries the write key across: `AuthorizationsToRecord` /
`DeclinesToRecord` both exist because the read model's `PaymentRequested` half supplies
`tableNumber`, which the payment-keyed trigger event does not. Do not derive the write key from
the trigger event; project it in.

Pin the write key with a real assertion in the slice's own test file rather than leaving it to
review — import the sibling commands' own `streamNameFor` and compare:

```ts
it('writes to the same table stream PayOrder and OpenOrder use', () => {
    assert.strictEqual(streamNameFor('12'), payOrderStreamNameFor('12'));
    assert.strictEqual(streamNameFor('12'), openOrderStreamNameFor('12'));
    assert.strictEqual(streamNameFor('12'), 'Day12-table-12');
});
```

## "Not a todo until the second event lands" is a staging table, not a nullable flag

A todo-list read model whose fields are mapped from two events (`PaymentRequested.totalAmount` +
`AuthorizationDeclined.declineReason`) almost always has a spec like "a request with no provider
answer yet is not a todo". Implementing that as one table with nullable columns plus a filtered
query makes the invariant a convention the route has to remember. Instead give the first event its
own `{table}_requests` staging table and build the visible row only on the second event, with an
`INSERT ... SELECT` that joins the staged row:

```ts
const joined = db(`${requestsTableName} as r`)
    .withSchema('public')
    .where('r.payment_id', event.data.paymentId)
    .select('r.order_number', 'r.table_number',
            db.raw('? as decline_reason', [event.data.declineReason]),
            db.raw('?::timestamp as declined_at', [event.data.declinedAt]));
return [sql(db(tableName).withSchema('public').insert(joined)
    .onConflict('payment_id').merge([...]).toQuery())];
```

No row exists before the answer arrives, so the "not a todo" spec passes structurally and the
route needs no `WHERE ... IS NOT NULL`. The matching migration adds *two* `CREATE TABLE`s.

## `aggregate:count(X per Y)` on a read model keyed by Z needs a conditional increment

`attemptCount` mapped `aggregate:count(PaymentDeclined per orderNumber)` on a read model whose
`idAttribute` is `tableNumber` counts on a *different* key than the row is keyed on. A plain
`attempt_count + 1` on conflict silently carries the previous bill's count into the next one.
Compare the grouping key in the merge and reset:

```ts
.onConflict('table_number').merge({
    order_number: db.raw('excluded.order_number'),
    attempt_count: db.raw(
        `case when ${tableName}.order_number = excluded.order_number`
        + ` then ${tableName}.attempt_count + 1 else 1 end`),
})
```

Knex accepts an object-form `merge({col: db.raw('excluded.col')})`, which is what makes referring
to both `excluded.*` and the target table in one expression possible — the array form cannot.

## slice.json's `events[]` can be narrower than a shared event type — make the extras optional

An event declared in `{Context}Events.ts` for an earlier chapter can carry more fields than the
slice that finally *emits* it declares in `events[]`. `PaymentDeclined` had 8 fields in
`Day12Events.ts` but `RecordPaymentDecline`'s `events[]` lists 6 (`cardBrand`/`maskedCardNumber`
stop at `AuthorizationDeclined`). Confirm against the board (`get_node <eventId>`) rather than
assuming the type is right, then make the extras `optional` in the shared type — do not write
fields the emitting slice does not declare, and do not delete fields other slices' tests construct.

## Guards on a retry flow key on the attempt, not the order

When a slice's specs include both "a second decline on a retried payment is recorded too" and
"recording the same decline twice is rejected", the two are only consistent if the replay guard is
keyed on `paymentId`: a retry issues a *fresh* paymentId against the same `orderNumber`, so a
per-order "already declined" check wrongly rejects the retry. Conversely a terminal per-order fact
(PaymentAbandoned) *is* keyed on `orderNumber` — it ends the card path for the whole bill, not one
attempt. Expect both keys in the same decider state.

## A command may omit fields its own event requires — read them off replayed state

`RetryPayment`'s `commands[0].fields` has no `subtotal`/`serviceCharge`/`taxAmount`, yet it emits
`PaymentRequested`, which requires all three. That is not a slice.json defect and not an invitation
to accept them from the request body: the retry re-sends the *same* bill, so carry them in the
decider's state off the declined `PaymentRequested` (`previousPaymentId` is the command field that
names which one). Same rule as an event field mapped from an earlier event — if the command does
not declare it, it comes from replay.

## Running Testcontainers tests under Podman

`npm test` and bare `node --test` do not pick up the Podman socket. Use tsx with the env file:

```
npx tsx --env-file=/tmp/tc.env --test 'src/slices/{Context}/{Slice}/*.test.ts'
```

`/tmp/tc.env` holds `DOCKER_HOST=...` plus `TESTCONTAINERS_RYUK_DISABLED=true`. Pure decider
specs (`DeciderSpecification`) need no container and run with plain `npx tsx --test`.
