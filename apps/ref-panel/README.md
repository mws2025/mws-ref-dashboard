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
| `IRC_RELAY_URL` | HTTPS base URL for the VPS IRC relay; HTTP redirects can change relay POST requests to GET |
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
username, osu_id, last_accessed_at, is_admin
```

OAuth grants access only when osu! user details match a row in `access`. Access rows are cached briefly to avoid
exhausting the Google Sheets per-user read quota. Successful login updates `last_accessed_at` on a best-effort basis;
an audit timestamp write failure does not invalidate the new session.
`is_admin` accepts `TRUE` or `FALSE`; the session response exposes it as `user.is_admin`, and the schedule mutation
rechecks the Sheet before every write.

## Sheets Contracts

Current dashboard reads from:

```text
matches:
match_id, round, date, time, player_a, player_b, referee, streamer, status, lobby_url, winner, score_a, score_b

players:
player_id, osu_id, name, discord_id, status
```

`player_a` and `player_b` may be player IDs; the API resolves them through `players`.

`referee` is used for the dashboard "Your matches" list. Multiple refs may be separated with commas, semicolons, or
pipes. Portal sign-up only claims an empty cell and never replaces another referee. A referee may withdraw only their
own assignment. Any authenticated referee can still open an unfinished match for emergency coverage without changing
the assignment.

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
home_mod_a, home_mod_b, turn_player, current_slot, score_overridden, test_binding, updated_at

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

The response contains `players` (including each `homeMod`), picked, banned, and protected `maps`, `score`/`stars`, current `ingredients`, and per-side recipe
values. `current` is the latest active recipe or `null`; `previous` is an array of resolved recipes; and `active` is an
array of all active recipes. It returns `Access-Control-Allow-Origin: *` and a two-second public cache.

### Authentication Routes

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/auth/osu/login` | Public | Starts osu! OAuth and stores the state cookie. |
| `GET` | `/api/auth/osu/callback?code=&state=` | Public | OAuth callback alias; validates access and creates the session. |
| `GET` | `/auth/callback?code=&state=` | Public | Primary OAuth callback path with the same behavior as the API alias. |
| `GET` | `/api/auth/session` | Public | Returns the current session, including `user.is_admin`, or `401` when unauthenticated. |
| `POST` | `/api/auth/logout` | Public | Clears the session cookie. |
| `GET` | `/api/auth/bypass` | Public | Creates a read-only demo session when `Restrict Access` is false. |
| `GET` | `/api/auth/debug` | Local-only | Reports environment-variable presence without returning secret values. |
| `GET` | `/api/auth/session/debug` | Local-only | Reports cookie presence, JWT verification state, and session identity. |
| `GET` | `/api/auth/osu/preflight` | Local-only | Tests osu! client-credential exchange through the configured proxy. |

### Match Data And Flow Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/matches` | Returns all, assigned, and active Sheets-backed matches. |
| `PUT` | `/api/match/:matchId/referee` | Uses `{ "action": "signup" }` or `{ "action": "signout" }` to update the authenticated referee's assignment. |
| `PUT` | `/api/match/:matchId/schedule` | Admin-only update using `{ "date": "YYYY-MM-DD", "time": "HH:MM" }`. |
| `GET` | `/api/match/:matchId/mappool?mappool=&playerA=&playerB=` | Returns pool maps, match overrides, and wins. |
| `GET` | `/api/match/:matchId/inventory?playerA=&playerB=` | Returns both players' ingredient inventories. |
| `PUT` | `/api/match/:matchId/inventory` | Writes one player's absolute inventory values and an audit entry. |
| `GET` | `/api/match/:matchId/state` | Returns persisted flow state or its lobby-aware default. |
| `POST` | `/api/match/:matchId/state` | Records rolls, order selection, or a player's home mod. |
| `POST` | `/api/match/:matchId/match-score` | Stores an absolute manual match-star correction in `matches`. |
| `POST` | `/api/match/:matchId/action` | Applies `pick`, `ban`, `protect`, or corrective `unpick`. |
| `POST` | `/api/match/:matchId/setup-map` | Binds both players' active recipes to the picked map and returns lobby setup commands. |
| `POST` | `/api/match/:matchId/score` | Resolves recipe-adjusted scores, rewards, replay state, and next flow state. |
| `POST` | `/api/match/:matchId/reset` | Resets the full match state while preserving the connected lobby. |
| `POST` | `/api/match/:matchId/post-result` | Completes the match and posts the result webhook. |
| `POST` | `/api/match/:matchId/forfeit` | Completes the match as a forfeit with loser score `-1`. |

### Test-Mode osu! Integration Routes

These authenticated routes return `409` unless the connected Sheet has `test mode = TRUE`.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/match/:matchId/test/mp-probe` | Fetches a real osu! MP lobby and returns its name, roster, and current game window. |
| `POST` | `/api/match/:matchId/test/mp-binding` | Maps two lobby users to portal sides and persists a replay/live event cursor. |
| `DELETE` | `/api/match/:matchId/test/mp-binding` | Removes the persisted MP binding. |
| `GET` | `/api/match/:matchId/test/mp-result` | Reads the next event window and validates the next recorded game against the current setup. |
| `POST` | `/api/match/:matchId/test/mp-result/consume` | Advances the cursor after applying or explicitly skipping the candidate game. |

Probe with either a full link or numeric ID:

```json
{ "mp": "https://osu.ppy.sh/mp/123456" }
```

Bind the inspected lobby for recorded replay or future live games:

```json
{
  "mpId": 123456,
  "mode": "replay",
  "playerAOsuId": 111,
  "playerBOsuId": 222
}
```

`replay` starts at the match's documented `first_event_id`; `live` starts after `latest_event_id` at bind time. Map
setup persists the expected slot, beatmap ID, lobby mods, per-side player mods, and scoring type in `match_state.test_binding`. The result route
returns `canApply: true` only when the game is finished, the beatmap and scoring type match, both mapped users have
scores, and all expected lobby/player mods are present. Accuracy games return values in the portal's 0-100 format.
The Integration tab applies those values through the normal `/score` endpoint, then consumes the osu! event. For a
recipe/tie replay it retains the expected setup and advances to the next recorded game.

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
| `POST` | `/api/match/:matchId/create-lobby` | Creates a lobby, adds assigned/current referees, writes its URL, and returns setup commands. |
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
| `record_rolls` | `rollA`, `rollB` | Stores whole-number rolls from 1-100; a tie stays in `roll`, otherwise advances to `order`. |
| `choose_order` | `choice: "pick_first" \| "ban_first"` | Sets first picker/banner and advances to `ban`. |
| `set_home_mod` | `player`, `homeMod` | Stores a post-ban home mod; after both choose, advances to `craft`. |

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
`manualOrder: true`, either player may pick, ban, or protect an eligible map. Manual order is disabled by default in the
portal. Recipes are crafted during `craft` before a map is selected. RO32 uses two base bans total (one per player);
later rounds use four base bans total. Beignets can grant its explicit extra ban up to the four-ban absolute ceiling.
After the base bans, both players choose home mods before crafting and picking. After the pick, call
`POST /api/match/:matchId/setup-map` with `{ "slot": "NM1" }`. Completed slots may be picked again; each replay is
stored as another `match_maps` row. TB is rejected until both players are one point from victory, except when an active
Caramel unlocks it as the wildcard slot. Use `action: "unpick"` to clear the latest picked or completed row and reverse
its map/recipe rewards; `unpick` does not require `player`.

Map setup preserves the pool's required mods and sends `!mp allowed_mods HD` for NM/PS/HR/DT maps. Recipe-granted
optional mods are added to that command. FM/TB remain Freemod.

`POST /api/match/:matchId/score` derives the winner from recipe-adjusted scores:

```json
{
  "slot": "NM1",
  "playerA": "Player A",
  "playerB": "Player B",
  "scoreA": "98.76%",
  "scoreB": "98.54%",
  "usesHdA": true,
  "usesHdB": false,
  "missCountA": 0,
  "missCountB": 1
}
```

Scores accept numbers, comma separators, and an optional trailing `%`. Crepe accuracy values are limited to 0-100.
For score win conditions, a side marked `usesHdA`/`usesHdB` is normalized with `round(rawScore / 1.06)` before recipe
score additions/multipliers and winner calculation. The portal exposes manual HD toggles; the integration test obtains
the flags from each osu! score's mods automatically. `PS3` uses lower miss count, requires both nonnegative whole-number
miss counts, and requests a replay when the miss counts tie. The integration route reads `statistics.count_miss` from
osu!; manual score entry shows dedicated miss-count inputs.
Replay recipes return `replayRequired: true` on the first run, and any tied result also requests another replay. Submit
the replay through the same endpoint. Repeating a request after a lost response returns the already-committed result
instead of applying rewards twice. Match stars are written to `matches` in the same settlement. Otherwise,
the response contains final scores, winner, inventories, flow state, `nextPicker`, `ingredient`, `ingredientAmount`, and
any scoring-mode restore commands. A map winner receives one pool ingredient; a player whose home mod matches that pool
receives one additional ingredient even on a loss. A home-mod win therefore awards two. Successful settlements include
both inventories in the same IRC score announcement. The deciding map announces the winner with `GGWP` and does not
start another pick timer.

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

- `mod` is used by Sugar Cookies; allowed values are HD, HR, EZ, FL, and SO (HT is rejected).
- `modA` and `modB` are used by Custard.
- `targetSlot` is used by map protection and unban effects.
- `ingredient` is used by Omelette and Dough.
- `rewardIngredients` must contain exactly two ingredients for Caramel.

Every recipe is crafted during `craft` before map selection. Recipes are disabled for the real tiebreaker. An active
Caramel locks both players out of further crafting. Crafting Caramel after another pending recipe refunds and reverts
that recipe before Caramel is charged. Caramel persists a randomly selected configured beatmap in its event payload and
overrides the wildcard setup command with that beatmap. Magic Cake copies the opponent's latest `resolved` recipe, not
an active or reverted event. The two Cinnamon Roll entries are labeled `(Protect)` and `(Unban)` in the UI and recipes
are listed alphabetically.

Other mutation bodies:

| Route | JSON body |
| --- | --- |
| `POST /api/irc/send` | `{ "channel": "#mp_123", "message": "!mp timer 120" }` |
| `POST /api/match/:matchId/create-lobby` | No body required; players and assigned refs come from the Sheet and the current operator comes from the session. |
| `PUT /api/match/:matchId/schedule` | `{ "date": "2026-09-12", "time": "18:30" }` (admin only; date is stored as a native Sheets date value and retains the cell format) |
| `POST /api/match/:matchId/setup-map` | `{ "slot": "NM1" }` |
| `POST /api/match/:matchId/match-score` | `{ "scoreA": 3, "scoreB": 2 }` |
| `POST /api/match/:matchId/reset` | No body required. |
| `POST /api/match/:matchId/join-lobby` | `{ "mpId": "123456" }` |
| `POST /api/match/:matchId/close-lobby` | `{ "channel": "#mp_123", "messages": [{ "ts": "...", "from": "...", "message": "..." }] }` |
| `POST /api/match/:matchId/remind` | No body required. |
| `POST /api/match/:matchId/post-result` | `{ "playerA": "...", "playerB": "...", "scoreA": 5, "scoreB": 3, "winner": "..." }` |
| `POST /api/match/:matchId/forfeit` | `{ "winner": "...", "playerA": "...", "playerB": "..." }` |

Test mode suppresses live IRC and lobby transport where marked in the implementation. Its Integration tab reads actual
osu! MP history, while Sheet-backed match, inventory, score, recipe, cursor, and result writes remain authoritative.

## Frontend State

Dashboard:

- Reads `GET /api/matches`.
- Displays "Your matches", active matches, and tournament schedule.
- Shows inline referee assignment controls and permits emergency opening without reassignment.
- Shows an admin-only calendar action for editing match date and 24-hour time through shadcn controls.
- Sorts the schedule by Match ID ascending by default. Match ID, Match, Date, and Referee headers toggle sorting; Date
  automatically uses time of day as its secondary order. Round, Time, Status, and Action are not independently sortable.
- Refreshes match data every 15 seconds while mounted.

Match panel:

- Loads mappool, inventory, config, match flow state, and persisted recipe events from the API on mount.
- Keeps IRC mounted across tab switches so SSE messages persist.
- Uses Match Control for roll/order/score flow and event log.
- Uses the left player column for score, home mod selection, inventory, lobby actions, and result posting.
- Uses the Recipes tab for activation inputs, lifecycle status, and server-side revert/refund.
- Manual pick/ban order defaults off; turning it on allows free map actions.
- Test mode avoids live IRC transport while retaining authoritative Sheet-backed state and verifies score input against a bound osu! MP history.

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
