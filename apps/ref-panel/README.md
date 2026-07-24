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
| `OSU_PROXY_BASE` | Optional HTTPS osu! API proxy base URL; HTTP redirects can change OAuth POST requests to GET |
| `OSU_PROXY_SECRET` | Secret sent to the osu! API proxy as `X-Proxy-Secret` |
| `SESSION_SECRET` | Session JWT signing secret |
| `IRC_BOT_USERNAME` | osu! IRC bot username |
| `IRC_BOT_PASSWORD` | osu! IRC password |
| `IRC_RELAY_URL` | Base URL for the VPS IRC relay |
| `IRC_RELAY_SECRET` | Secret sent to the IRC relay as `X-Relay-Secret` |

`GOOGLE_APPLICATION_CREDENTIALS` must be inline JSON in Pages runtime. The `private_key` value may contain escaped `\n`; the server normalizes it before Web Crypto import.

Restart `bun run dev:pages` after changing `.env.local`; Wrangler reads env at process start.

## Auth Flow

Implemented routes:

| Route | Purpose |
| --- | --- |
| `GET /api/auth/osu/login` | Starts osu! OAuth |
| `GET /auth/callback` | osu! OAuth callback |
| `GET /api/auth/osu/callback` | Alternate osu! OAuth callback |
| `GET /api/auth/session` | Reads current session |
| `POST /api/auth/logout` | Clears session cookie |
| `GET /api/auth/bypass` | Creates a read-only session when access restriction is disabled |
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
item_id, name, cost_egg, cost_sugar, cost_butter, cost_flour, cost_milk,
timing, effect_type, effect_payload, enabled

item_events:
event_id, match_id, player_id, item_id, action, target, payload, created_by,
created_at, reverted_at, status, activated_at, resolved_at, resolution

audit_log:
created_at, actor, action, entity_type, entity_id, before_json, after_json
```

Match flow phases are:

```text
lobby, roll, order, home_mod, ban, craft, play, ready_result, completed
```

## API Reference

All API routes are implemented in `functions/api/[[route]].ts`. Unless marked public or local-only, requests require the
`mws_ref_session` HTTP-only cookie. A bypass session with `osu_id: 0` can read authenticated routes but cannot call
mutations.

### System And Public Routes

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Returns service name, runtime, current timestamp, and `ok: true`. |
| `GET` | `/api/public/config` | Public | Returns tournament config, rules, scoring, test mode, and order settings. |
| `GET` | `/api/public/state` | Public | Returns the current placeholder public tournament-state payload. |
| `GET` | `/api/public/match/:matchId/snapshot` | Public | Returns the sanitized live state used by stream overlays. |

The public snapshot supports cross-origin browser requests and requires no cookie. OBS Browser Source example for match
`67`:

```js
const response = await fetch(
  "https://mws-ref-dashboard.pages.dev/api/public/match/67/snapshot",
  {
    credentials: "omit",
    headers: { Accept: "application/json" },
  },
)

if (!response.ok) {
  throw new Error(`Snapshot request failed: ${response.status}`)
}

const snapshot = await response.json()
```

The response contains `players`, picked and banned `maps`, `score`/`stars`, current `ingredients`, and per-side recipe
`current`, `previous`, and `active` values. It returns `Access-Control-Allow-Origin: *` and a two-second public cache.

### Authentication Routes

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/auth/osu/login` | Public | Starts osu! OAuth and stores the state cookie. |
| `GET` | `/api/auth/osu/callback?code=&state=` | Public | OAuth callback alias; validates access and creates the session. |
| `GET` | `/auth/callback?code=&state=` | Public | Primary OAuth callback path with the same behavior as the API alias. |
| `GET` | `/api/auth/session` | Public | Returns the current session or `401` when unauthenticated. |
| `POST` | `/api/auth/logout` | Public | Clears the session cookie. |
| `GET` | `/api/auth/bypass` | Public | Creates a read-only demo session when `Restrict Access` is false. |
| `GET` | `/api/auth/debug` | Local-only | Reports environment-variable presence without returning secret values. |
| `GET` | `/api/auth/session/debug` | Local-only | Reports cookie presence, JWT verification state, and session identity. |
| `GET` | `/api/auth/osu/preflight` | Local-only | Tests osu! client-credential exchange through the configured proxy. |

### Match Data And Flow Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/matches` | Returns all, assigned, and active Sheets-backed matches. |
| `GET` | `/api/match/:matchId/mappool?mappool=&playerA=&playerB=` | Returns pool maps, match overrides, and wins. |
| `GET` | `/api/match/:matchId/inventory?playerA=&playerB=` | Returns both players' ingredient inventories. |
| `PUT` | `/api/match/:matchId/inventory` | Writes one player's absolute inventory values and an audit entry. |
| `GET` | `/api/match/:matchId/state` | Returns persisted flow state or its lobby-aware default. |
| `POST` | `/api/match/:matchId/state` | Records rolls, order selection, or a player's home mod. |
| `POST` | `/api/match/:matchId/action` | Applies `pick`, `ban`, `protect`, or `unpick` and activates map recipes. |
| `POST` | `/api/match/:matchId/score` | Resolves recipe-adjusted scores, rewards, replay state, and next flow state. |
| `POST` | `/api/match/:matchId/post-result` | Completes the match and posts the result webhook. |
| `POST` | `/api/match/:matchId/forfeit` | Completes the match as a forfeit with loser score `-1`. |

### Recipe Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/match/:matchId/recipes` | Returns persisted recipe events and lifecycle status. |
| `POST` | `/api/match/:matchId/recipe` | Validates, purchases, and activates or immediately resolves a recipe. |
| `DELETE` | `/api/match/:matchId/recipe/:eventId` | Reverts and refunds an active recipe that has not activated on a map. |

Recipe events use `active`, `resolved`, or `reverted` status. Legacy events without a status are treated as resolved so
old rows cannot activate again. Loading the recipe route also adds missing lifecycle columns to `item_events`.

### Lobby And IRC Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/irc/send` | Sends one `{ channel, message }` payload through the IRC relay. |
| `GET` | `/api/irc/stream?channel=` | Proxies the relay's server-sent event stream. |
| `POST` | `/api/match/:matchId/create-lobby` | Creates a lobby, writes its URL, and returns setup commands. |
| `POST` | `/api/match/:matchId/join-lobby` | Attaches and probes an existing multiplayer lobby. |
| `POST` | `/api/match/:matchId/close-lobby` | Closes the lobby and uploads its chat log when configured. |
| `POST` | `/api/match/:matchId/remind` | Posts the configured Discord match reminder. |

### Mutation Bodies

`PUT /api/match/:matchId/inventory` accepts absolute, nonnegative ingredient counts:

```json
{
  "player": "Player Name",
  "egg": 2,
  "sugar": 1,
  "butter": 0,
  "flour": 3,
  "milk": 1
}
```

`POST /api/match/:matchId/state` supports these actions:

| `action` | Body fields | Result |
| --- | --- | --- |
| `record_rolls` | `rollA`, `rollB` | Stores rolls; tie stays in `roll`, otherwise advances to `order`. |
| `choose_order` | `choice: "pick_first" \| "ban_first"` | Sets first picker/banner and advances to `home_mod`. |
| `set_home_mod` | `player`, `homeMod` | Stores a home mod; after both choose, advances to `ban`. |

`POST /api/match/:matchId/action` body:

```json
{
  "action": "pick",
  "player": "Player Name",
  "slot": "NM1",
  "manualOrder": true
}
```

When `manualOrder` is omitted or `false`, the endpoint enforces the current match-flow phase and expected player. With
`manualOrder: true`, either player may pick, ban, or protect an eligible map. Use `action: "unpick"` to clear the pick,
scores, and winner; `unpick` does not require `player`.

`POST /api/match/:matchId/score` derives the winner from recipe-adjusted scores:

```json
{
  "slot": "NM1",
  "playerA": "Player A",
  "playerB": "Player B",
  "scoreA": 987432,
  "scoreB": 854201
}
```

Replay recipes return `replayRequired: true` on the first run. Submit the replay through the same endpoint. Otherwise,
the response contains final scores, winner, inventories, flow state, and any scoring-mode restore commands.

`POST /api/match/:matchId/recipe` always requires `player` and `recipeId`. Activation-specific fields are optional unless
the selected effect requires them:

```json
{
  "player": "Player A",
  "recipeId": 6,
  "mod": "HD",
  "modA": "HD",
  "modB": "HR",
  "targetSlot": "NM2",
  "ingredient": "egg",
  "rewardIngredients": ["egg", "milk"]
}
```

- `mod` is used by Sugar Cookies.
- `modA` and `modB` are used by Custard.
- `targetSlot` is used by map protection and unban effects.
- `ingredient` is used by Omelette and Dough.
- `rewardIngredients` must contain exactly two ingredients for Caramel.

Other mutation bodies:

| Route | JSON body |
| --- | --- |
| `POST /api/irc/send` | `{ "channel": "#mp_123", "message": "!mp timer 120" }` |
| `POST /api/match/:matchId/create-lobby` | `{ "playerA": "...", "playerB": "...", "refUsername": "..." }` |
| `POST /api/match/:matchId/join-lobby` | `{ "mpId": "123456" }` |
| `POST /api/match/:matchId/close-lobby` | `{ "channel": "#mp_123", "messages": [{ "ts": "...", "from": "...", "message": "..." }] }` |
| `POST /api/match/:matchId/remind` | No body required. |
| `POST /api/match/:matchId/post-result` | `{ "playerA": "...", "playerB": "...", "scoreA": 5, "scoreB": 3, "winner": "..." }` |
| `POST /api/match/:matchId/forfeit` | `{ "winner": "...", "playerA": "...", "playerB": "..." }` |

Test mode simulates IRC and lobby operations where marked in the implementation. Sheet-backed match, inventory, score,
recipe, and result writes remain authoritative.

## Frontend State

Dashboard:

- Reads `GET /api/matches`.
- Displays "Your matches", active matches, and tournament schedule.
- Refreshes match data every 15 seconds while mounted.

Match panel:

- Loads mappool, inventory, config, match flow state, and persisted recipe events from the API on mount.
- Keeps IRC mounted across tab switches so SSE messages persist.
- Uses Match Control for roll/order/score flow and event log.
- Uses the left player column for score, home mod selection, inventory, lobby actions, and result posting.
- Uses the Recipes tab for activation inputs, lifecycle status, and server-side revert/refund.
- Manual pick/ban order defaults on; turning it off enforces the persisted match flow.
- Test mode avoids live IRC transport while retaining authoritative Sheet-backed match and recipe state.

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
