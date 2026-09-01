# osu! Referee Web Portal Plan

## Project Context

Build a referee tool for one osu! tournament. The tournament has standard osu! match operations plus a Catan-inspired item/buff system. Referees use the portal during matches to track state, apply items, record outcomes, and push authoritative data back to Google Sheets.

Google Sheets is the source of truth for the event. No separate database is required. Data from Sheets also feeds a public/player-facing frontend.

## Goals

- Give referees a fast match-control interface for live tournament operation.
- Keep tournament state tied to one configured tournament, not a multi-tenant platform.
- Support normal osu! tournament flow: teams/players, matches, maps, scores, bans/picks, winners, notes, and status.
- Support Catan-style items/buffs that can be crafted after conditions are met.
- Make item effects explicit, auditable, and reversible where possible.
- Push referee updates back to Sheets.
- Expose clean sheet-derived data for a public/player frontend.

## Non-Goals

- No full database stack for MVP.
- No generic tournament builder.
- No unattended osu! API adjudication; a referee must review and apply every verified game.
- No complex auth provider unless refs need remote access control.

## Stack (locked)

- Frontend: Vite + React + TypeScript
- UI: shadcn/ui + Tailwind CSS
- Backend/API: Cloudflare Pages Functions with Hono
- Data: Google Sheets API with service account
- Runtime/package manager: Bun
- Hosting: Cloudflare Pages

## Design Direction

### Colors (applied in `src/index.css`)

- Light: `#fff9f0` background, `#f2e0c9` card, `#26150e` foreground, `#8c5a33` muted
- Accent: `#d49b5a` (primary)
- Red: `#a4564e` (ban)
- Green: `#5f7f63` (pick)
- Blue: `#6f8ea5` (protect)

### Typography (applied in `src/index.css`)

- Heading/display: **Domus Titling** (OTF, self-hosted at `/public/assets/fonts/`, weights 400 + 700)
- Body/UI: **Lexend Variable** (`@fontsource-variable/lexend`)
- Decoration: **Segoe Print** (system font stack — `"Segoe Print", "Bradley Hand", Chilanka, cursive`)

Note: Domus Titling is a titling font — it auto-capitalises. Use `font-sans normal-case` on any lowercase word inside a heading element (e.g. `vs` in player headings).

## System Shape

```text
Referee Portal (browser)
  -> Cloudflare Pages Functions (server)
    -> Google Sheets API (service account)
    -> osu! API via VPS proxy (beatmap/MP link parsing, bypasses CF 429s)
    -> osu! IRC bot (single shared client, proxies all ref messages)
  -> Public Read API (sanitized JSON, short-lived cache)
    -> Player/Public Frontend
```

Browser never writes directly to Sheets. Server owns credentials, validation, and all mutations.

## IRC Architecture (decided)

One osu! account + IRC client acts as middleman for all refs.
- Refs send messages via portal. Server sends through bot account.
- In-game format: `BotUsername: <ref_osu_username>: message`
- All `!mp` commands get a random 8-char alphanumeric suffix appended to avoid Bancho spam detection.

## Pool Format (decided)

NM / PS / HR / DT / FM / TB

## Ingredient System (decided)

Ingredients earned by winning maps. Tied to mod pool of the map won.

| Pool | Ingredient |
|------|-----------|
| NM   | Egg       |
| PS   | Sugar     |
| HR   | Butter    |
| DT   | Flour     |
| FM   | Milk      |
| TB   | (none)    |

HD removed. PS replaces HD — Sugar now earned from PS maps.

- Ingredients reset per match (do not roll over).
- Inventory space uncapped.
- Format is 1v1 head-to-head. Individual players craft, not teams.

## Recipe List

Full list in `src/data/recipes.ts`. 24 active recipes. Reference sheet in repo.

## Sheet Model

- `config`: key-value pairs — tournament name, abbreviation, restrict access, test mode, scoring, ban/protect/strike order, rule text, etc.
- `players`: player_id, osu_id, name, discord_id, team_id, status.
- `matches`: match_id, round, mappool, best_of, date, time, player_a, player_b, referee, streamer, status, lobby_url, winner, score_a, score_b.
- `mappool`: map_id, beatmap_id, title, mod_pool, round.
- `match_maps`: match_id, slot, map_id, picked_by, banned_by, score_a, score_b, winner, status.
- `match_state`: match_id, phase, roll_a, roll_b, roll_winner, first_picker, first_banner, turn_player, home_mod_a, home_mod_b, current_slot, score_overridden, test_binding, updated_at.
- `inventory`: match_id, player, egg, sugar, butter, flour, milk.
- `items`: item_id, name, cost, craft_condition, effect_type, effect_payload, enabled.
- `item_events`: event_id, match_id, player_id, item_id, action, target, payload, created_by, created_at, reverted_at, status, activated_at, resolved_at, resolution.
- `audit_log`: event_id, actor, action, entity_type, entity_id, before_json, after_json, created_at.
- `access`: username, osu_id, last_accessed_at, is_admin.

---

## What Is Done

### Scaffold + Config
- [x] Vite + React + TypeScript + shadcn/ui + Tailwind + Bun scaffolded.
- [x] shadcn: `button`, `card`, `badge`, `separator`, `tabs`, `dialog`, `alert-dialog`, `input`, `skeleton`, `table`, `scroll-area`.
- [x] Theme tokens (new palette + fonts) applied in `src/index.css`.
- [x] Cloudflare Pages config in `wrangler.jsonc`.
- [x] Hono API entrypoint at `functions/api/[[route]].ts`.

### Auth
- [x] osu! OAuth2 login flow (server-side code exchange).
- [x] Session JWT in HTTP-only cookie, 12h TTL.
- [x] Referee allowlist against `access` sheet; updates `last_accessed_at`.
- [x] `access.is_admin` is exposed in the session and rechecked server-side for admin mutations.
- [x] Auth guard on all non-public `/api/*` routes.
- [x] `Restrict Access = FALSE` config bypass: `/api/auth/bypass` issues demo session (osuId=0), blocks writes.
- [x] Local-only diagnostics: `/api/auth/debug`, `/api/auth/osu/preflight`, `/api/auth/session/debug`.

### Config Sheet
- [x] `GET /api/public/config` (no auth) — returns `restrictAccess`, `testMode`, `tournamentName`, `abbreviation`, `enforceNF`, `banOrder`, `protectOrder`, `strikeOrder`, rules map, scoring config, multipliers.
- [x] `getConfigMap()` reads `config!A:B` key→value, case-insensitive.
- [x] Tournament name/abbreviation used dynamically in dashboard and landing page.
- [x] Match panel fetches rules on load; Rules button opens reference dialog (only when rules non-empty).

### Dashboard
- [x] `GET /api/matches` reads `matches!A1:Z` + `players!A1:Z`.
- [x] "Your matches", active matches, tournament schedule backed by Sheets.
- [x] Referees can sign up for unassigned matches or withdraw their own assignment; existing assignments cannot be taken over.
- [x] Any authenticated referee can open an unfinished match for emergency coverage without changing its assignment.
- [x] shadcn `Table` + `ScrollArea` for schedule section.
- [x] `LiveBadge` component with `animate-ping` pulse. Shared by Dashboard and MatchPanel.
- [x] Schedule columns: Round, Match ID, Match, Date, Time, Referee, Status, Action.
- [x] Schedule defaults to natural Match ID order; Match, Date, and Referee can also sort, with Date automatically sorting each day's times.
- [x] Admin-only shadcn schedule editor updates match date/time with calendar selection and validated `HH:MM` input.
- [x] Date formatted as `(Sat) May 1`.
- [x] Test mode amber banner at page top.

### Match Panel
- [x] 3-column layout: PlayerColumn (208px) | MappoolTable (resizable, default 770px) | tabbed right panel.
- [x] Live data: mappool + inventory + score pulled from API on mount.
- [x] Skeleton loading for mappool rows, scores, inventory.
- [x] MappoolTable: pool-color-coded rows, status badges with P1/P2 labels, muted-red for ban, muted-green for pick, muted-blue for protect. Banned maps strikethrough + opacity. `table-fixed` + `truncate` prevents map name overflow; title tooltip on hover.
- [x] PlayerColumn: authoritative win-box tracker, ingredient bar (collapsible, edit toggle), home mod selector with undo, match meta 2-col grid, lobby buttons, and whole-match reset.
- [x] Lobby buttons grouped with Separators: Setup | Result | Danger zones.
- [x] Forfeit dialog: choose winner, sets score to -1 for loser.
- [x] Join lobby: auto-sends `!mp settings` after join, parses BanchoBot room name, shows mismatch warning if room name doesn't contain both player names. Retry or continue anyway.
- [x] Create lobby: amber IRC client warning in confirm dialog.
- [x] Match Control tab (flow + event log), IRC tab (SSE, `forceMount`), Recipes tab.
- [x] Match Control event log: BanchoBot event parsing — join/leave/roll/abort, color-coded.
- [x] Resizable pool column via drag handle.
- [x] Demo mode guard: `osuId === 0` locks all write actions server + client side.
- [x] Test mode amber banner at very top of page.

### IRC Relay
- [x] VPS Bun relay as systemd service `irc-relay`. Auth: `X-Relay-Secret`.
- [x] `POST /api/irc/send`, `GET /api/irc/stream` on CF worker.
- [x] `IrcChat.tsx`: SSE, send, status dot, quick commands (invite by `#osuId`, settings, move, timer, start, abort).
- [x] Messages persist across tab switches via `forceMount`.
- [x] `simulatedMessages` prop: merges simulated messages with real ones (sorted by timestamp).

### Lobby Actions
- [x] `POST /api/match/:id/create-lobby` — `!mp make`, waits BanchoBot SSE, sends setup commands, writes lobby_url to Sheet, Discord staff webhook.
- [x] Emergency lobby creation grants IRC ref access to both the assigned referee(s) and current authenticated operator.
- [x] `POST /api/match/:id/join-lobby` — validates mp ID, alive check via SSE, writes lobby_url.
- [x] `POST /api/match/:id/close-lobby` — `!mp close`, chat log as .txt to staff webhook.
- [x] `POST /api/match/:id/remind` — Discord ping with `<@discord_id>` + `<t:UNIX:R>` timestamp.
- [x] `POST /api/match/:id/action` — pick/ban/protect writes `match_maps` row + `audit_log`.
- [x] `POST /api/match/:id/forfeit` — sets status=forfeit, winner, score=-1 in matches sheet.

### Match Flow Engine
- [x] Actual phase order modeled in `match_state`: lobby → roll → order choice → home mods → bans → craft recipes → pick → play → score/ingredients → repeat → ready result → completed.
- [x] `GET /api/match/:id/state` returns persisted flow state with sane default.
- [x] `POST /api/match/:id/state` stores rolls, order choice, and home mod choices.
- [x] `POST /api/match/:id/action` enforces ban/pick phase + expected player before writing map actions.
- [x] Flow controls merged into Match Control tab for current phase, roll save, order choice, and score entry; home mod choice lives in the player column.
- [x] Manual pick/ban order toggle defaults off; enabling it allows free pick/ban/protect actions by either player.
- [x] Ban state uses the latest row per slot and enforces an absolute four-ban maximum, including Beignets and manual actions.
- [x] Recipes are crafted before selection; picking closes crafting and `POST /api/match/:id/setup-map` binds active recipes and advances to play.
- [x] `POST /api/match/:id/score` atomically writes map scores, canonical match stars, inventories, recipe resolutions, and flow state; retries are idempotent.
- [x] BanchoBot finish messages auto-fill score entry; refs can persist absolute star corrections with `POST /api/match/:id/match-score`.
- [x] Completed map slots can be repicked as additional history rows; TB is restricted to mutual match point unless Caramel unlocks the wildcard.
- [x] Home-mod pools award one bonus ingredient to their owner on either a win or loss.
- [x] `POST /api/match/:id/reset` clears match state while preserving the lobby; completed maps can be unpicked with reward reversal.
- [x] `POST /api/match/:id/post-result` writes final `matches` result and completes flow state.
- [x] `PUT /api/match/:id/inventory` persists manual inventory edits.
- [x] Recipe endpoints validate timing, cost, targets, and effect-specific inputs; persist active/resolved/reverted lifecycle state in `item_events`; and audit use/revert actions.
- [x] All 24 recipe definitions match the reference costs/effects; duplicate Cinnamon Roll labels are distinguished by action.
- [x] Recipe effects modify map commands, lobby mods, score resolution, replay flow, inventory rewards, bans, and protection.
- [x] Caramel exclusively locks crafting and refunds displaced pending recipes; Magic Cake copies the opponent's latest resolved recipe.
- [x] Test mode can run the same flow without sending live IRC commands; Sheet-backed state remains authoritative.

### Test Mode
- [x] Config key `test mode = TRUE/FALSE` → `isTestMode(configMap)` helper.
- [x] `testMode` exposed in `/api/public/config` response.
- [x] Server gates with `// #TEST-MODE-START/END` markers around IRC send and lobby transport operations.
- [x] Test-mode lobby creation/joining still writes the simulated lobby URL to Sheets; match state and recipes use normal writes.
- [x] Client reads `testMode` from config, threads through App → Dashboard + MatchPanel.
- [x] Amber banner at very top of all relevant pages.
- [x] **Integration tab** binds an existing osu! MP link and maps lobby users to portal red/blue sides.
- [x] Recorded lobbies can replay from their first event; live lobbies start after the latest event at bind time.
- [x] The persisted event cursor prevents refreshes or another ref browser from applying one osu! game twice.
- [x] Each candidate game validates completion, beatmap ID, both mapped users, lobby mods, per-side recipe mods, and scoring type.
- [x] Verified score or accuracy values pass through the normal recipe-aware settlement endpoint; failed checks cannot be applied.
- [x] Warmups and unrelated recorded games can be explicitly skipped without changing match score.

---

## What Is Pending

### Auto Score Detection

BanchoBot finish messages now auto-fill both score fields. The ref can edit the detected values and submit once both
players are present. Direct osu! APIv2 result polling remains optional future work.

Format from real matches: `PlayerA finished playing (Score: 987,432, PASSED).`

Flow:
1. `parseFinishedScoreAnnouncement` detects each BanchoBot score and assigns it to the correct player.
2. Match Control auto-fills both fields without auto-submitting, preserving the ref correction step.
3. `POST /api/match/:id/score` settles `match_maps`, canonical match stars, recipes, and inventories.
4. Client updates the mappool, stars, recipe state, and ingredients, then announces all of them in IRC.

Endpoints:
- `GET /api/match/:id/test/mp-result` — fetches the next osu! event window and validates the next game.
- `POST /api/match/:id/score` — applies a verified result through the authoritative recipe-aware settlement path.
- `POST /api/match/:id/test/mp-result/consume` — advances the persisted osu! event cursor after apply or explicit skip.

Manual fallback is the same score-entry form; refs can overwrite either detected value before submission.

### 🟡 IRC Timer Bar

- [x] Detect `!mp timer X` in outgoing sends and start a client-side countdown.
- [x] Animate the chat input border as a draining progress bar.
- [x] Show the remaining time near the input.
- [ ] Cancel/reset on `!mp abort` or new `!mp timer`.
- [ ] Also detect BanchoBot `"Countdown ends in X seconds"` to sync if started externally.

### 🟢 osu! API Integration

- [x] Test-mode MP probe, binding, paginated event cursor, game validation, and verified result application.
- [ ] Beatmap metadata lookup for mappool (cover art, star rating, BPM, length) — cosmetic, not blocking.
- [ ] Player avatar/rank lookup — cosmetic.

### 🟢 Public Feed

- [ ] Sanitized `/api/public/state` with ≤5s cache.
- [ ] Player-facing read-only schedule/results view.

### 🟢 Hardening

- [x] Short-lived Sheets read cache to avoid API quota.
- [ ] Remove/gate local-only auth diagnostics (`/api/auth/debug`, etc.) before production deploy.
- [ ] Concurrent write guard: `updated_at` version check before mutations, reject stale.
- [ ] Mock match dry run with real referees before tournament day.

---

## Priority Order for Next Work

| # | Item | Reason |
|---|------|--------|
| 1 | **Concurrent write guard** | Prevent stale writes when multiple referees operate the same match. |
| 2 | **IRC timer completion** | Add abort handling and synchronize timers started outside the portal. |
| 3 | **Recorded MP dry run** | Exercise recipes, replay games, skips, and result settlement with real referees. |
| 4 | **Production hardening** | Remove or further gate diagnostics before the tournament. |
| 5 | **Public feed** | Replace the public-state placeholder with sanitized schedule and result data. |

---

## API Endpoints

The request and response contracts are documented in `apps/ref-panel/README.md`.

| Method | Path | Status |
|--------|------|--------|
| GET | `/api/health` | Done, public |
| GET | `/api/public/config` | Done, public |
| GET | `/api/public/state` | Done, placeholder payload |
| GET | `/api/public/match/:id/snapshot` | Done, public OBS overlay state |
| GET | `/api/auth/osu/login` | Done |
| GET | `/api/auth/osu/callback` | Done |
| GET | `/auth/callback` | Done |
| GET | `/api/auth/session` | Done |
| POST | `/api/auth/logout` | Done |
| GET | `/api/auth/bypass` | Done |
| GET | `/api/auth/debug` | Done, local-only |
| GET | `/api/auth/session/debug` | Done, local-only |
| GET | `/api/auth/osu/preflight` | Done, local-only |
| GET | `/api/matches` | Done |
| PUT | `/api/match/:id/referee` | Done |
| PUT | `/api/match/:id/schedule` | Done, admin-only |
| GET | `/api/match/:id/mappool` | Done |
| GET | `/api/match/:id/inventory` | Done |
| PUT | `/api/match/:id/inventory` | Done |
| GET | `/api/match/:id/state` | Done |
| POST | `/api/match/:id/state` | Done |
| POST | `/api/match/:id/match-score` | Done |
| POST | `/api/match/:id/action` | Done |
| POST | `/api/match/:id/setup-map` | Done |
| POST | `/api/match/:id/score` | Done, recipe-aware |
| POST | `/api/match/:id/reset` | Done |
| POST | `/api/match/:id/post-result` | Done |
| POST | `/api/match/:id/forfeit` | Done |
| GET | `/api/match/:id/recipes` | Done |
| POST | `/api/match/:id/recipe` | Done |
| DELETE | `/api/match/:id/recipe/:eventId` | Done |
| POST | `/api/irc/send` | Done, test-mode simulated |
| GET | `/api/irc/stream` | Done |
| POST | `/api/match/:id/create-lobby` | Done |
| POST | `/api/match/:id/join-lobby` | Done |
| POST | `/api/match/:id/close-lobby` | Done |
| POST | `/api/match/:id/remind` | Done |
| POST | `/api/match/:id/test/mp-probe` | Done, test mode |
| POST | `/api/match/:id/test/mp-binding` | Done, test mode |
| DELETE | `/api/match/:id/test/mp-binding` | Done, test mode |
| GET | `/api/match/:id/test/mp-result` | Done, test mode |
| POST | `/api/match/:id/test/mp-result/consume` | Done, test mode |

Planned but not registered: `POST /api/match/:id/lock`.

---

## Agent Handoff

### Repo State

- Monorepo: app lives in `apps/ref-panel/`.
- `bun run typecheck` passes clean.
- Local dev: `bun run dev:pages` on `:8788`.
- Cloudflare Pages deploy: root `apps/ref-panel`, build `bun install --frozen-lockfile && bun run build`, output `dist`.

### Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Auth state, config fetch, testMode threading, routes |
| `src/types.ts` | All shared TypeScript types — Pool, IngKey, HomeMod, Inventory, etc. |
| `src/data/constants.ts` | Pool config (NM/PS/HR/DT/FM/TB), ingredient map, HOME_MODS |
| `src/data/recipes.ts` | 24 recipes with costs and timing |
| `src/data/mock.ts` | Mock data — IRC_BOT constant, mock mappool/matches/inventories |
| `src/lib/mappool.ts` | `canAfford()`, `rowStyle()`, `poolConfig()`, `statusVariant()` |
| `src/components/DashboardPage.tsx` | Dashboard with matches, schedule table |
| `src/components/LiveBadge.tsx` | Shared live indicator with animate-ping |
| `src/components/match/MatchPanel.tsx` | Main match orchestrator — flow, persistent recipes, commands, scores, and lobby state |
| `src/components/match/FlowPanel.tsx` | Ordered match flow controls: rolls, order choice, manual-order toggle, score entry |
| `src/components/match/PlayerColumn.tsx` | Scores, home mod (select/undo), ingredients (collapsible), lobby/reset buttons, mismatch dialog |
| `src/components/match/MappoolTable.tsx` | Map rows, pool colors, P1/P2 status, table-fixed truncation |
| `src/components/match/MapActionModal.tsx` | Pick/ban/protect confirmation |
| `src/components/match/IrcChat.tsx` | SSE chat, quick commands, simulatedMessages merge, timer bar |
| `src/components/match/RecipePanel.tsx` | Recipe catalog, activation inputs, lifecycle status, and server-side revert |
| `src/components/match/TestSimPanel.tsx` | Integration tab — real osu! MP history verification (test mode only) |
| `functions/api/[[route]].ts` | Hono entrypoint — all API routes, test mode gates |

### Test Mode Gate

Keep the integration implementation deployed and set `test mode = FALSE` in the connected config Sheet. The server
rejects all `/test/*` integration routes unless that flag is true, and the client hides the Integration tab.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Full service account JSON string |
| `GOOGLE_SHEETS_TOURNAMENT_ID` | Sheet ID from URL |
| `OSU_CLIENT_ID` | osu! OAuth2 |
| `OSU_CLIENT_SECRET` | osu! OAuth2 |
| `OSU_REDIRECT_URI` | osu! OAuth2 callback URL |
| `SESSION_SECRET` | Session signing — `openssl rand -hex 32` |
| `OSU_PROXY_BASE` | VPS proxy URL for osu! API calls (avoids CF 429s) |
| `IRC_RELAY_URL` | VPS relay base URL |
| `IRC_RELAY_SECRET` | `X-Relay-Secret` header for relay auth |
