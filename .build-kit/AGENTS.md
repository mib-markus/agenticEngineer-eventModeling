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

## A command whose data lacks the stream's key field needs a lookup projection

If a command's own fields don't include the id the target stream is keyed by (e.g. `Add Order
Line` carries only `orderNumber`, but Open Order's stream is `Day12-table-{tableNumber}`), build
a lookup projection exactly like `ReservationLookupProjection`/`OrderLookupProjection`: populate it
from whichever event first links the two ids, read it in `routes.ts` before constructing the
command, and 409 with a distinct message if the lookup itself misses (stream not found) versus if
`decide()`'s own precondition fails (stream found, but the guard rejects) — collapsing the two
hides a stream-id mismatch behind what looks like a normal business rejection.
