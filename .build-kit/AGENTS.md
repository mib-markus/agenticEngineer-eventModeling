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

## Resolving board/MCP credentials when `.build-kit/.eventmodelers/config.json` is absent

The Ralph loop instructions say to skip all platform communication when that specific file is
missing — but the *root* `.eventmodelers/config.json` and `.mcp.json` (one level up) can still
resolve MCP credentials for slices that do need board sync (e.g. `request-feedback`). If a slice id
needs to be found on a specific board and no config pins one, use
`mcp__eventmodelers__list_boards` then `mcp__eventmodelers__list_slices { boardId }` for each
candidate board and match by slice id/title.
