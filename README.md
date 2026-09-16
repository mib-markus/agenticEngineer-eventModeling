# Restaurant Reservations — Agentic Engineer cohort

An event-sourced restaurant reservation backend, built from an
[Eventmodelers](https://eventmodelers.ai) board by an agent rather than by hand. This is my work
for the *Become an Agentic Engineer* cohort.

The board models a restaurant across four chapters; this repo implements the
**ReservationToDoList** context. Slice definitions are exported to
`.build-kit/.slices/reservationtodolist/` and are the single source of truth — every field, event
name and business rule in the code comes from a `slice.json`, none of it invented.

## What's built

| Slice | Type | Status |
|---|---|---|
| **PlaceReservation** | state change | implemented — `POST /api/placereservation/:eMail` |
| ConfirmationsToSend | state view | not yet |
| SendReservationConfirmation | automation | not yet |
| CancelReservation | state change | not yet |
| ActiveReservations | state view | not yet |

`PlaceReservation` emits `ReservationPlaced` and enforces the four rules the board specifies:
a valid `DD.MM.YYYY` date, not in the past, `endTime` after `startTime`, and at least one person.
All five board scenarios are covered by `DeciderSpecification` tests.

Two details worth knowing if you read the handler:

- **`reservationCode` is `generated: true` on the event and absent from the command**, so it cannot
  come from the request body. The route generates it and passes it via command metadata.
- **The clock arrives the same way.** The board's example dates were authored while `15.04.2026` was
  still in the future. Reading `Date.now()` inside `decide` would make the board's own success
  scenarios fail as real time moves past them — so `decide` stays pure, tests pin the clock, and the
  route supplies the real one.

## Try it

```bash
curl -X POST "http://localhost:3000/api/placereservation/max.mustermann%40gmx.de" \
  -H "Content-Type: application/json" \
  -d '{"date":"15.12.2026","startTime":"19:00","endTime":"21:00","numberOfPeople":"4"}'
# -> 201 {"ok":true,"reservationCode":"R-WR4M", ...}
```

Use a future date — the endpoint uses the real clock, so the board's 2026 sample dates may
now be in the past and return `409`.

## How it's wired

Scaffolded by [`@eventmodelers/cli`](https://www.npmjs.com/package/@eventmodelers/cli), using
[Emmett](https://event-driven-io.github.io/emmett/) over Postgres for the event store, Express for
HTTP, and Flyway for migrations. `server.ts` discovers slice routes by globbing `dist/`, so a new
slice needs no manual registration — but you do need `npm run build` before `npm run dev`.

Commits touching `src/slices/` are checked by `.build-kit/lib/checks/` via a pre-commit hook
(`npx @eventmodelers/cli init-hooks`): it rejects invented fields, missing tests, undocumented
endpoints and out-of-scope changes. Run it any time with `npm run run:checks`.

The agent skills that drive the build live in `.claude/skills/` and are **not** committed here —
reinstall them with `npx @eventmodelers/cli init --stack node`.

## Prerequisites

- Node.js 20 or later (the dev/start scripts use `node --env-file`)
- Docker and Docker Compose (for local Postgres). Podman works too — start the machine, then point
  `DOCKER_HOST` at its socket:
  ```bash
  podman machine start
  export DOCKER_HOST="unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')"
  ```
- Flyway CLI on your `PATH` (for `npm run flyway:migrate`)
- [Claude Code](https://claude.com/claude-code) if you want to run the build agent

## Getting started

1. Start Postgres:

   ```bash
   docker compose up -d
   ```

2. Create your `.env`:

   ```bash
   cp .env.example .env
   ```

   Or run `./setup-env.sh` to be prompted for host, port, database, user and password.

3. Activate the baseline migration and apply it:

   ```bash
   mv migrations/V1__schema.sql.example migrations/V1__schema.sql
   npm install
   npm run flyway:migrate
   ```

   `V1__schema.sql` creates the processor dead-letter queue table the runtime expects. Add your own
   `V2__*.sql`, `V3__*.sql` and so on as slices introduce projections.

4. Run the server:

   ```bash
   npm run build   # slice routes and processors are loaded from dist/
   npm run dev
   ```

The API is on http://localhost:3000, with Swagger UI at http://localhost:3000/api-docs and the raw
OpenAPI document at http://localhost:3000/swagger.json.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the server locally with `.env` loaded |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Start in production mode |
| `npm test` | Run `src/**/*.test.ts` via `tsx --test` |
| `npm run flyway:migrate` | Apply pending migrations from `migrations/` |

## Learn more

- [Eventmodelers](https://eventmodelers.ai)
- [Emmett documentation](https://event-driven-io.github.io/emmett/)
