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

## Resolving board/MCP credentials when `.build-kit/.eventmodelers/config.json` is absent

The Ralph loop instructions say to skip all platform communication when that specific file is
missing — but the *root* `.eventmodelers/config.json` and `.mcp.json` (one level up) can still
resolve MCP credentials for slices that do need board sync (e.g. `request-feedback`). If a slice id
needs to be found on a specific board and no config pins one, use
`mcp__eventmodelers__list_boards` then `mcp__eventmodelers__list_slices { boardId }` for each
candidate board and match by slice id/title.
