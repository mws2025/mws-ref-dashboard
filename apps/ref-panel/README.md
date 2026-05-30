# MWS Referee Portal Dev Docs

Developer notes for the referee portal codebase. The app is a Vite + React frontend backed by Cloudflare Pages Functions. Google Sheets is the data source; the browser never talks to Sheets directly.

## Stack

- Frontend: Vite, React, TypeScript
- UI: shadcn/ui, Tailwind CSS
- Backend: Cloudflare Pages Functions, Hono
- Runtime/package manager: Bun
- Data: Google Sheets REST API with service-account JWT auth
- Hosting target: Cloudflare Pages

## Local Development

Install dependencies:

```bash
bun install
```

Create local env:

```bash
cp .env.example .env.local
```

Run local Pages dev:

```bash
bun run dev:pages
```

Use `http://localhost:8788` in the browser. Keep OAuth, API requests, and cookies on this origin.

Do not run `bun run build` for normal local work. Build is for deploy verification or when explicitly requested.

## Scripts

| Command | Purpose |
| --- | --- |
| `bun run dev:pages` | Runs Wrangler Pages dev and live Vite assets for local app work |
| `bun run dev:vite` | Runs only the Vite dev server |
| `bun run typecheck` | TypeScript project check |
| `bun run build` | Production build, use before deploy |
| `bun run lint` | ESLint |
| `bun run format` | Prettier write |

## Cloudflare Pages Deploy

This repository is a monorepo. Configure the Pages project to build only `apps/ref-panel`.

### Build configuration

| Setting | Value |
| --- | --- |
| Framework preset | Vite (or None) |
| Root directory | `apps/ref-panel` |
| Install command | leave blank for automatic install, or `bun install` |
| Build command | `bun run build` |
| Build output directory | `dist` |
| Node.js version | `>=20` |
| Bun version | `1.3.5` |

Do not set the root directory to the repository root for this Pages project. If the build log says `Executing user command: bun run build` followed by `turbo: command not found`, Cloudflare is building from the monorepo root without installing dependencies. Fix the Pages settings above and remove `SKIP_DEPENDENCY_INSTALL` unless you provide an explicit install command.

### Functions configuration

- Keep the Functions directory as `functions` (it resolves to `apps/ref-panel/functions` because of the root directory setting).
- In **Settings -> Functions -> Compatibility flags**, enable `nodejs_compat`.
- Keep compatibility date aligned with `wrangler.jsonc`.

### Environment configuration

- Add all runtime secrets in Pages **Production** and **Preview** environments.
- Required keys are listed in the Environment section below (`GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_SHEETS_TOURNAMENT_ID`, osu OAuth values, session/IRC values).
- `GOOGLE_APPLICATION_CREDENTIALS` must be the full JSON string, not a file path.

### Monorepo build watch paths (recommended)

To avoid unnecessary deploys, include only paths that affect this app:

- `apps/ref-panel/**`
- `packages/**`
- `package.json`
- `bun.lock`
- `turbo.json`

## Environment

Required in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_APPLICATION_CREDENTIALS` | Full service account JSON string |
| `GOOGLE_SHEETS_TOURNAMENT_ID` | Spreadsheet ID |
| `OSU_CLIENT_ID` | osu! OAuth client ID |
| `OSU_CLIENT_SECRET` | osu! OAuth client secret |
| `OSU_REDIRECT_URI` | Exact osu! callback URL, local default is `http://localhost:8788/auth/callback` |
| `SESSION_SECRET` | Session JWT signing secret |
| `IRC_BOT_USERNAME` | osu! IRC bot username |
| `IRC_BOT_PASSWORD` | osu! IRC password |

`GOOGLE_APPLICATION_CREDENTIALS` must be inline JSON in Pages runtime. The `private_key` value may contain escaped `\n`; the server normalizes it before Web Crypto import.

Restart `bun run dev:pages` after changing `.env.local`; Wrangler reads env at process start.

## Auth Flow

Implemented routes:

| Route | Purpose |
| --- | --- |
| `GET /api/auth/osu/login` | Starts osu! OAuth |
| `GET /auth/callback` | osu! OAuth callback |
| `GET /api/auth/session` | Reads current session |
| `POST /api/auth/logout` | Clears session cookie |
| `GET /api/auth/debug` | Local-only env diagnostic |
| `GET /api/auth/osu/preflight` | Local-only osu! credential diagnostic |
| `GET /api/auth/session/debug` | Local-only session cookie diagnostic |

Access control uses the Sheets `access` tab:

```text
username, osu_id, last_accessed_at
```

OAuth grants access only when osu! user details match a row in `access`. Successful login updates `last_accessed_at`.

## Sheets Contracts

Current dashboard reads from:

```text
matches:
match_id, round, date, time, player_a, player_b, referee, streamer, status, lobby_url, winner

players:
player_id, osu_id, name, status
```

`player_a` and `player_b` may be player IDs; the API resolves them through `players`.

`referee` is used for the dashboard "Your matches" list. Multiple refs may be separated with commas, semicolons, or pipes.

Match statuses are normalized to:

```text
scheduled, upcoming, live, completed, forfeit
```

Accepted aliases include `in_progress` -> `live` and `ff` -> `forfeit`.

## API State

Implemented:

| Route | Status |
| --- | --- |
| `GET /api/matches` | Real Sheets-backed dashboard data |
| `GET /api/health` | Placeholder health JSON |
| `GET /api/public/state` | Placeholder public JSON |

Pending:

- `GET /api/match/:id`
- `GET /api/mappool/:round`
- Match mutations: pick/ban, score entry, winner, lock/unlock
- Recipe use validation and `item_events` writes
- Public sanitized state feed
- IRC relay send/receive

## Frontend State

Dashboard:

- Reads `GET /api/matches`.
- Displays "Your matches", active matches, and tournament schedule.
- Refreshes match data every 15 seconds while mounted.

Match panel:

- Still uses mock data from `src/data/mock.ts`.
- Needs real match-detail and mappool endpoints before replacing mocks.

## Repo Layout

```text
functions/
  api/[[route]].ts              # Hono app, auth, Sheets helpers, API routes
  auth/callback.ts              # Pages route for /auth/callback
src/
  App.tsx                       # view state shell
  types.ts                      # shared frontend types
  components/
    DashboardPage.tsx           # Sheets-backed dashboard
    LandingPage.tsx
    match/                      # mock-backed match panel
  data/
    constants.ts
    recipes.ts
    mock.ts
  lib/
    irc.ts
    mappool.ts
sheets/                         # CSV schema snapshots
```

## Development Rules

- Keep all Sheets writes server-side.
- Use stable IDs from Sheets, not row numbers, for identity.
- Use direct Google Sheets REST calls; do not add the Node Google SDK.
- Every future mutation should append an `audit_log` row.
- Add optimistic concurrency before multi-ref write workflows.
- Local auth and API testing should happen through `http://localhost:8788`.

## License

Licensed under CC BY-NC-SA 4.0. See [LICENSE.md](./LICENSE.md).
