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
| Install command | `bun install --frozen-lockfile` |
| Build command | `bun run build` |
| Build output directory | `dist` |
| Node.js version | `>=20` |
| Bun version | `1.3.5` |

Do not set the root directory to the repository root for this Pages project. If the build log says `Executing user command: bun run build` followed by `turbo: command not found`, Cloudflare is building from the monorepo root without installing dependencies. If it says `tsc: command not found`, dependencies were not installed before the app build. Fix the Pages settings above and remove `SKIP_DEPENDENCY_INSTALL`.

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
| `OSU_PROXY_BASE` | Optional osu! API proxy base URL |
| `OSU_PROXY_SECRET` | Secret sent to the osu! API proxy as `X-Proxy-Secret` |
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
match_id, round, date, time, player_a, player_b, referee, streamer, status, lobby_url, winner, score_a, score_b

players:
player_id, osu_id, name, discord_id, status
```

`player_a` and `player_b` may be player IDs; the API resolves them through `players`.

`referee` is used for the dashboard "Your matches" list. Multiple refs may be separated with commas, semicolons, or pipes.

Match statuses are normalized to:

```text
scheduled, upcoming, live, completed, forfeit
```

Accepted aliases include `in_progress` -> `live` and `ff` -> `forfeit`.

Match control reads and writes these additional tabs when available:

```text
mappool:
round, map_id, mod_pool, beatmap_id, title

match_maps:
match_id, slot, map_id, picked_by, banned_by, status, score_a, score_b, winner

match_state:
match_id, phase, roll_a, roll_b, roll_winner, first_picker, first_banner,
home_mod_a, home_mod_b, turn_player, current_slot, updated_at

inventory:
match_id, player, egg, sugar, butter, flour, milk

items:
item_id, name, enabled, timing, cost_egg, cost_sugar, cost_butter, cost_flour, cost_milk

item_events:
event_id, match_id, player, item_id, target, created_at

audit_log:
created_at, actor, action, entity_type, entity_id, before_json, after_json
```

Match flow phases are:

```text
lobby, roll, order, home_mod, ban, craft, play, ready_result, completed
```

## API State

Implemented:

| Route | Purpose |
| --- | --- |
| `GET /api/matches` | Real Sheets-backed dashboard data |
| `GET /api/match/:matchId/mappool?mappool=&playerA=&playerB=` | Loads round mappool plus match-specific pick/ban/completed overrides and current score |
| `GET /api/match/:matchId/inventory?playerA=&playerB=` | Loads both players' ingredient inventories |
| `PUT /api/match/:matchId/inventory` | Manually updates one player's inventory; body: `player`, ingredient counts |
| `GET /api/match/:matchId/state` | Loads persisted match flow state, defaulting to `lobby` or `roll` based on lobby URL |
| `POST /api/match/:matchId/state` | Advances roll/order/home-mod flow state |
| `POST /api/match/:matchId/action` | Writes map `pick`, `ban`, `protect`, or `unpick`; strict flow order unless `manualOrder: true` |
| `POST /api/match/:matchId/score` | Writes map score/winner, marks map completed, awards ingredient, advances flow |
| `POST /api/match/:matchId/recipe` | Validates recipe timing/cost, deducts inventory, writes item event |
| `POST /api/match/:matchId/post-result` | Writes final match winner/score and completes flow |
| `POST /api/match/:matchId/forfeit` | Marks match forfeit and writes loser score as `-1` |
| `POST /api/match/:matchId/create-lobby` | Creates osu! lobby through IRC relay, writes lobby URL, returns follow-up commands |
| `POST /api/match/:matchId/join-lobby` | Attaches an existing `mpId`, validates via relay when configured, writes lobby URL |
| `POST /api/match/:matchId/close-lobby` | Sends `!mp close` and posts chat log to staff webhook when configured |
| `POST /api/match/:matchId/remind` | Posts Discord reminder using player `discord_id` values |
| `POST /api/irc/send` | Sends one IRC relay message |
| `GET /api/irc/stream?channel=` | Proxies IRC relay SSE stream |
| `GET /api/public/config` | Exposes public tournament config, rules, test mode, and order settings |
| `GET /api/health` | Health JSON |
| `GET /api/public/state` | Placeholder public JSON |

`POST /api/match/:matchId/state` supports these actions:

| `action` | Body fields | Result |
| --- | --- | --- |
| `record_rolls` | `rollA`, `rollB` | Stores rolls; tie stays in `roll`, otherwise advances to `order` |
| `choose_order` | `choice: "pick_first" \| "ban_first"` | Sets first picker/banner and advances to `home_mod` |
| `set_home_mod` | `player`, `homeMod` | Stores player home mod; after both choose, advances to `ban` |

`POST /api/match/:matchId/action` body:

```json
{
  "action": "pick",
  "player": "Player Name",
  "slot": "NM1",
  "manualOrder": true
}
```

When `manualOrder` is omitted or `false`, the endpoint enforces the current match-flow phase and expected player. When `manualOrder` is `true`, it preserves the old free-action behavior: either player may pick, ban, or protect any available map, and the endpoint does not advance `match_state`.

Use `"action": "unpick"` with a picked `slot` to clear `picked_by`, score fields, winner, and return the map to `available`. `unpick` does not require `player`.

Most mutation endpoints return `{ ok: true, simulated: true }` without writing Sheets when test mode is enabled in the `config` tab.

## Frontend State

Dashboard:

- Reads `GET /api/matches`.
- Displays "Your matches", active matches, and tournament schedule.
- Refreshes match data every 15 seconds while mounted.

Match panel:

- Loads mappool, inventory, config, and match flow state from the API on mount.
- Keeps IRC mounted across tab switches so SSE messages persist.
- Uses Match Control for roll/order/score flow and event log.
- Uses the left player column for score, home mod selection, inventory, lobby actions, and result posting.
- Manual pick/ban order defaults on, allowing free pick/ban/protect action selection; turning it off enforces the persisted match flow.
- Test mode runs the same local flow loop without writing Sheets or sending IRC relay messages.

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
