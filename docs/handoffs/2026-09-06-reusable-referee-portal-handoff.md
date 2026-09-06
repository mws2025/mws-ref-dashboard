<!--
title: Reusable Tournament Referee Portal Handoff
description: Architecture, migration, testing, and operations handoff for the next osu! referee portal.
category: "Architecture & Design"
-->

# Reusable Tournament Referee Portal Handoff

| Field                 | Value                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                  | 2026-09-06                                                                                                                                  |
| Objective             | Provide an implementation handoff for building a similar osu! tournament referee portal with different branding, match rules, and gimmicks. |
| Reference baseline    | `main` at `a1ac50f`                                                                                                                         |
| Reference application | `apps/ref-panel`                                                                                                                            |
| Production reference  | `https://mws-ref-dashboard.pages.dev`                                                                                                       |
| Primary data store    | Google Sheets                                                                                                                               |
| Runtime               | Cloudflare Pages Functions and a separate Bun IRC relay                                                                                     |

## 1. Executive Summary

The existing portal is a three-part system:

1. A React referee interface for schedule management, lobby control, picks, bans, recipes, score entry, and result
   posting.
2. A Hono API running in Cloudflare Pages Functions. It owns authentication, rule validation, Google Sheets reads and
   writes, osu! API calls, scoring, and recipe settlement.
3. A persistent Bun service connected to osu! IRC. It creates multiplayer lobbies, sends BanchoBot commands, and
   exposes channel-isolated server-sent event streams to the Pages application.

Google Sheets is the operational database. The browser never reads or writes Sheets directly. The `matches`,
`match_state`, `match_maps`, `inventory`, and `item_events` tabs together form the authoritative match state.

For a similar project, reuse the infrastructure and lifecycle patterns, but do not copy the current tournament rules
as implicit defaults. First define the new match state machine, scoring rules, inventory model, and gimmick lifecycle.
Then replace the rule functions and Sheet configuration while preserving the server-side validation boundaries.

## 2. What To Reuse

### Reuse With Minor Changes

- osu! OAuth login and HTTP-only session cookies.
- Google service-account authentication and Sheets batch helpers.
- Public versus authenticated API middleware.
- Read-only bypass sessions that cannot mutate data.
- Admin authorization from the `access` Sheet.
- IRC relay authentication, exact-channel filtering, SSE transport, reconnect handling, and lobby creation queue.
- Match history rows in `match_maps` instead of overwriting one row per slot.
- Recipe lifecycle events with `active`, `resolved`, and `reverted` states.
- Idempotent score submission for already-completed map rows.
- Test-mode binding to a real osu! multiplayer history.
- Public, cookie-free match snapshots for browser overlays.
- shadcn/ui primitives and the responsive application shell.

### Replace Deliberately

- Tournament name, abbreviation, fonts, logos, colors, and page composition.
- Pool names, required mods, optional mods, and pool-to-resource mapping.
- Roll, ban, pick, protect, home-slot, and tiebreaker rules.
- Score normalization and alternate win conditions.
- Recipe catalog, costs, activation timing, exclusivity, and settlement effects.
- Discord webhook wording and result formatting.
- Sheet identifiers, OAuth applications, relay credentials, and session secrets.

### Improve Instead Of Copying

- Split the large `functions/api/[[route]].ts` file into domain modules before adding another large gimmick set.
- Move the frontend recipe catalog and backend recipe definitions to one canonical source.
- Add a real concurrency coordinator or version check for simultaneous writes to the same match.
- Move lobby command delivery into a durable server-side outbox if commands must be guaranteed after state commits.
- Add API-level tests around Sheet mutations; the current automated suite mainly covers pure rule functions.

## 3. System Architecture

```text
Referee browser / OBS browser source
        |
        | HTTPS, session cookie for private routes
        v
Cloudflare Pages
  - Vite/React static assets
  - Hono Pages Function
        |
        +--> Google Sheets API using one service account
        |
        +--> osu! OAuth/API, optionally through an authenticated proxy
        |
        +--> HTTPS IRC relay API using X-Relay-Secret
                    |
                    v
              Persistent Bun process
                    |
                    v
                 osu! IRC
```

The Pages Function is the trust boundary. Client-side controls may hide invalid actions, but every mutation must be
validated again on the server. The relay is transport only; it does not own tournament rules or match state.

## 4. Ownership And Sources Of Truth

| Concern                                   | Owner                               | Authoritative storage                             |
| ----------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| User identity                             | osu! OAuth and signed session       | HTTP-only `mws_ref_session` cookie                |
| Referee/admin access                      | API                                 | `access` Sheet                                    |
| Match schedule and final stars            | API                                 | `matches` Sheet                                   |
| Current workflow phase                    | API                                 | `match_state` Sheet                               |
| Pick, ban, replay, and map result history | API                                 | Append/update rows in `match_maps`                |
| Player resources                          | API                                 | `inventory` Sheet                                 |
| Gimmick definitions                       | Sheet plus current frontend catalog | `items` Sheet and `src/data/recipes.ts`           |
| Gimmick lifecycle                         | API                                 | `item_events` Sheet                               |
| Audit trail                               | API                                 | `audit_log` Sheet                                 |
| Lobby chat transport                      | Bun relay                           | In-memory IRC connection and SSE clients          |
| Browser display state                     | React                               | Derived cache; refreshes from API after mutations |
| Stream overlay state                      | Public API                          | Sanitized projection of Sheet-backed state        |

Do not make browser state authoritative. A refresh, another referee, or an API retry must reconstruct the same match
from the Sheet records.

## 5. Sheet Contracts

The next project should create the tabs before implementing UI. Keep headers stable, lowercase, and
underscore-separated.
The current parser normalizes header spelling, but relying on aliases makes migrations harder to reason about.

### Core Tabs

```text
config:
key, value

access:
username, osu_id, last_accessed_at, is_admin

players:
player_id, osu_id, name, discord_id, status

matches:
match_id, round, mappool, best_of, date, time, player_a, player_b,
referee, streamer, status, lobby_url, winner, score_a, score_b

mappool:
round, map_id, mod_pool, beatmap_id, title
```

### Runtime Tabs

```text
match_maps:
match_id, slot, map_id, picked_by, banned_by, status, score_a, score_b, winner

match_state:
match_id, phase, roll_a, roll_b, roll_winner, first_picker, first_banner,
turn_player, home_mod_a, home_mod_b, current_slot, score_overridden,
test_binding, updated_at

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

### Optional Gimmick-Specific Tabs

The current Caramel implementation uses:

```text
caramel_maps:
pick_id, title, stage, mod, win_con, mappool_year, map_id
```

For the next project, use a new domain-specific tab name and schema. Avoid adding loosely structured columns to
`matches` when the data represents a reusable catalog or an event history.

### Important Sheet Behaviors

- `match_maps` is history. A completed slot may appear more than once when rules permit a repick.
- Code usually derives the current slot state from the latest matching row.
- `item_events.payload` captures activation inputs and immutable context.
- `item_events.resolution` captures the winner, rewards, steals, replay data, and other reversible outcomes.
- Schedule dates must be written as native Sheets date serial values, not text, or existing cell formatting breaks.
- All application traffic uses the same service account, so Google counts per-user quota against that account.

## 6. Match State Machine

The current phases are:

```text
lobby -> roll -> order -> ban -> home_mod -> craft -> play
                                                ^       |
                                                |       v
                                                +-- score settlement

play -> ready_result -> completed
```

Current meanings:

| Phase          | Valid work                                             |
| -------------- | ------------------------------------------------------ |
| `lobby`        | Create or attach an osu! lobby.                        |
| `roll`         | Capture both rolls and reject ties as unresolved.      |
| `order`        | Roll winner chooses pick-first or ban-first.           |
| `ban`          | Enforce the configured order and round-specific count. |
| `home_mod`     | Each player selects their home pool after bans.        |
| `craft`        | Craft recipes, then select the next map.               |
| `play`         | Apply setup, wait for play, and submit the result.     |
| `ready_result` | Winning threshold reached; final result may be posted. |
| `completed`    | Result is final and normal match mutations stop.       |

For the next project, write a transition table before writing components. Include:

- Allowed action for each phase.
- Actor allowed to perform it.
- Required data.
- Next phase and next actor.
- Corrective action and rollback behavior.
- Behavior at match point and on a draw/replay.

Do not derive the phase only from the visual UI. Persist it and validate it in every mutation endpoint.

## 7. Request Lifecycle

Every authenticated mutation follows this general pattern:

1. Read and verify the session.
2. Parse JSON and reject malformed or missing fields.
3. Load the authoritative match and relevant Sheet ranges.
4. Validate player membership, access level, phase, target, and rule prerequisites.
5. Calculate the complete next state before writing.
6. Batch related Sheet cell updates where possible.
7. Append an audit event.
8. Return the new authoritative state and any IRC commands/notices.
9. Update browser state from the response, then refresh related surfaces.

The frontend should never infer that a failed request succeeded. Keep submit buttons retryable until the server confirms
the mutation. Completed score rows make retries idempotent when the response was lost after a successful write.

## 8. Score Settlement Pipeline

`POST /api/match/:matchId/score` is the highest-risk route. Preserve a fixed ordering:

1. Validate slot, players, numeric score or accuracy values, and special fields such as miss counts.
2. Find the latest picked or in-progress `match_maps` row.
3. If it is already completed, return the stored result without awarding anything again.
4. Load active recipe events bound to the current slot.
5. Detect or accept HD use and remove the `1.06` multiplier for score win conditions.
6. Apply additive effects.
7. Apply multiplicative effects.
8. Apply alternate win conditions such as accuracy or miss count.
9. If tied or a replay recipe requires another run, persist replay context and return without settlement.
10. Determine winner and loser.
11. Calculate canonical match stars.
12. Calculate normal pool resources and home-pool bonuses.
13. Apply recipe rewards, steals, or conditional effects.
14. Mark recipe events resolved and store sufficient `resolution` data for reversal.
15. Batch-write the map, match stars, inventories, recipe events, and match flow.
16. Return inventories, totals, next picker, restore commands, and notices.

When adding a new win condition, define its input range, tie behavior, replay behavior, and integration-test mapping.
When adding a reward, define its reversal data at the same time. An `unpick` implementation that cannot reverse a
settled gimmick is incomplete.

## 9. Gimmick Engine

### Definition

An item definition contains:

```json
{
  "item_id": "item_21",
  "name": "Example",
  "cost_sugar": 3,
  "timing": "before_map",
  "effect_type": "wildcard_slot",
  "effect_payload": {},
  "enabled": true
}
```

### Event Lifecycle

```text
crafted -> active -> activated on target -> resolved
             |
             +-> reverted and refunded before activation
```

- `active`: Paid for and still capable of affecting a future/current map.
- `resolved`: Effect has completed or was an immediate action.
- `reverted`: Cancelled and no longer eligible for activation or result output.
- `target`: Slot or entity to which the effect is bound.
- `payload`: Selection input and immutable effect context.
- `resolution`: Actual outcome and everything needed to undo it.

### Existing Effect Categories

- Immediate: protection, unban, direct ingredient steal, or no-op.
- Map-bound setup: replace mods, add per-player mods, force mods, change scoring mode.
- Map-bound scoring: add score, multiply score, alternate winner comparison.
- Replay: retain first-run values and request another game.
- Conditional reward: bonus ingredient, comeback reward, or margin-based steal.
- Flow mutation: add a ban or immediately inject a wildcard map.
- Copy: resolve another recipe definition from prior event history.

For a larger new project, implement an effect registry with explicit hooks:

```ts
interface EffectHandler {
  validateCraft(context: CraftContext): Promise<void>
  activate(context: ActivationContext): Promise<SetupDelta>
  settle(context: SettlementContext): Promise<SettlementDelta>
  reverse(context: ReversalContext): Promise<ReversalDelta>
}
```

This avoids adding more long `if/else` chains to the API entrypoint and forces every gimmick to define validation,
activation, settlement, and reversal behavior.

## 10. Caramel As A Reference Flow

Caramel is the best reference for a gimmick that changes flow, selects external data, applies conditions, resolves a
custom winner, and grants a custom reward.

Current behavior:

1. Crafting is allowed only during `craft`, before a map is selected, and not at the real tiebreaker.
2. If another recipe is `active` and has no `activated_at`, its full cost is returned and its event is reverted.
3. An existing active Caramel blocks another craft, keeping one active Caramel in normal sequential use.
4. All valid rows from `caramel_maps` are candidates. Source stage, year, and `pick_id` do not restrict eligibility.
5. Historical non-reverted wildcard events are counted by beatmap ID.
6. The server uses cryptographic randomness among globally least-used candidates and excludes the immediately previous
   beatmap when another candidate is available.
7. A blank `mod` is NM/none even if `pick_id` says HR or DT.
8. A blank `win_con` is ScoreV2 score comparison. `acc` keeps the lobby on ScoreV2 but compares player accuracy.
9. The API appends a `WC` match row, binds the recipe, writes `play` as the phase, and returns setup commands.
10. The client sends the beatmap, ScoreV2 configuration, mods, allowed mods, two informational chat lines, and timer.
11. Score submission requires exactly two valid ingredient choices and awards both to the computed map winner.
12. Result output includes the recipe and `(year) - pick_id - title` details.

Lobby text is:

```text
Caramel map: (2025) - HR2 - Example Title
Mod applied: NM (none) - Win condition: Score
```

The authenticated referee prefix is applied by the IRC API, so lobby users see:

```text
<RefereeName> Caramel map: (2025) - HR2 - Example Title
<RefereeName> Mod applied: NM (none) - Win condition: Score
```

The repeat avoidance is best-effort because Sheets does not provide a transactional compare-and-swap across concurrent
Worker invocations. If two matches craft at the exact same time, a strict no-duplicate guarantee requires a Durable
Object, D1 transaction, or another serialized coordinator.

## 11. IRC Architecture

The relay exists because a Cloudflare Worker cannot own a durable TCP IRC connection.

### Required Relay Guarantees

- Require `X-Relay-Secret` on all private routes.
- Accept only channels matching `^#mp_\d+$`.
- Store the channel on every SSE subscriber.
- Broadcast an IRC event only to subscribers for the exact same channel.
- Serialize `!mp make` requests because BanchoBot responses arrive on one shared private conversation.
- Correlate lobby creation using the exact expected lobby title.
- Deduplicate in-flight and recently completed creation requests by a match-specific request key.
- Rejoin known channels after IRC reconnect.
- Send SSE heartbeats so proxies do not close quiet streams.

### Outgoing Messages

The Pages API prefixes every non-command with the authenticated session username:

```text
<username> message
```

Messages beginning with `!` are passed unchanged. The relay appends an anti-spam suffix to selected repeated BanchoBot
commands such as `map`, `mods`, `timer`, and `start`.

Apply the prefix at the API boundary, not only in the browser. Otherwise the local transcript and actual lobby diverge.

### Parallel Session Failure To Avoid

Never expose one unfiltered global IRC stream and filter it only in React. Every layer must carry and enforce the exact
channel: relay subscriber, Pages stream proxy, `LiveMsg.channel`, and mounted chat component.

## 12. Authentication And Authorization

- OAuth uses authorization code flow with a short-lived state cookie.
- User identity is fetched from osu! and matched against `access.username` and `access.osu_id`.
- Sessions are signed JWTs stored in an HTTP-only cookie for 12 hours.
- Public routes bypass the session middleware explicitly.
- Bypass sessions use `osuId = 0` and are blocked from all writes on both client and server.
- Admin UI visibility comes from `user.is_admin`, but every admin mutation rechecks `access` server-side.
- Referee signup claims only an empty assignment; it never silently replaces another referee.
- Any authenticated referee may open an unfinished match for emergency coverage without changing assignment ownership.

For a new deployment, register a new osu! OAuth application and set the callback exactly. Do not reuse session,
proxy, or relay secrets from this project.

## 13. Frontend Structure And Redesign Boundary

The current interface is operational rather than promotional. Its first screen is the schedule/dashboard, and its match
screen prioritizes repeated referee actions.

| File                                                   | Responsibility                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `apps/ref-panel/src/App.tsx`                           | Session, public config, routes, and test-mode propagation.                            |
| `apps/ref-panel/src/components/DashboardPage.tsx`      | Assigned matches, active matches, sortable schedule, signup, and admin schedule edit. |
| `apps/ref-panel/src/components/match/MatchPanel.tsx`   | Main orchestration, API calls, IRC commands, and cross-panel state.                   |
| `apps/ref-panel/src/components/match/FlowPanel.tsx`    | Phase-specific roll, order, map setup, and score controls.                            |
| `apps/ref-panel/src/components/match/PlayerColumn.tsx` | Player metadata, stars, inventory, home pool, lobby, reset, and result actions.       |
| `apps/ref-panel/src/components/match/MappoolTable.tsx` | Scannable pool state and selection.                                                   |
| `apps/ref-panel/src/components/match/RecipePanel.tsx`  | Catalog, costs, activation forms, and lifecycle status.                               |
| `apps/ref-panel/src/components/match/IrcChat.tsx`      | Channel SSE, manual messages, quick commands, and timer display.                      |
| `apps/ref-panel/src/components/match/TestSimPanel.tsx` | Real osu! MP verification in test mode.                                               |
| `apps/ref-panel/src/index.css`                         | Theme variables, fonts, and global styling.                                           |
| `apps/ref-panel/src/data/constants.ts`                 | Pool colors, resource labels, and home pools.                                         |
| `apps/ref-panel/src/data/recipes.ts`                   | Current frontend recipe catalog.                                                      |

For the redesign:

- Keep shadcn primitives and replace theme tokens, fonts, and assets first.
- Preserve fixed dimensions for tables, action columns, score controls, and compact referee workflows.
- Keep actions stable when labels change state; avoid layout movement between sign-in and sign-out states.
- Use icons for compact utility actions and tooltips for unfamiliar icons.
- Do not bury match controls in decorative cards or a marketing landing page.
- Extract API calls and match orchestration into hooks before significantly changing `MatchPanel` layout.
- Test the same workflows at desktop and narrow laptop widths; OBS is only relevant to the public overlay.

## 14. Public Overlay API

`GET /api/public/match/:matchId/snapshot` is intentionally cookie-free and CORS-enabled. It returns a sanitized state
projection suitable for an OBS Browser Source:

- Player names and home pools.
- Picked, banned, protected, and completed maps.
- Canonical score/stars.
- Both inventories.
- Current active recipe.
- Resolved recipe history as an array.
- All active recipes as an array.

Public responses use a short edge cache. Do not expose session data, service-account data, internal audit fields, or
secrets. Keep overlay polling slow enough for the data freshness requirement; one-second polling from several browser
sources can exhaust upstream quota if caching is bypassed.

## 15. Real osu! Integration Test Mode

Test mode is not only a navigation demo. It can bind an existing multiplayer match and validate actual osu! API data.

Flow:

1. Enter an MP link or numeric ID.
2. Probe the lobby and choose which osu! users map to red and blue.
3. Choose replay mode from the first recorded event or live mode after the newest event.
4. Persist the MP ID, user mapping, and event cursor in `match_state.test_binding`.
5. Run normal portal picks and recipes.
6. Persist the expected beatmap, lobby mods, player mods, scoring type, and win condition.
7. Fetch the next osu! game and validate every expected field.
8. Apply verified values through the normal `/score` settlement endpoint.
9. Advance the cursor only after apply or explicit skip.

Test mode still writes match state, maps, inventory, recipes, and scores to its connected Sheet. It suppresses or
simulates external lobby transport where marked. Use a dedicated test spreadsheet or test match IDs.

## 16. Quota And Performance Rules

The service account is one Google API user. All referees, overlays, and Worker isolates contribute to its per-user read
quota.

Mandatory practices:

- Use `values:batchGet` when a request needs several ranges.
- Use `values:batchUpdate` for multi-cell settlement.
- Cache stable reads such as config, access, players, and match lists for a short burst window.
- Invalidate every cached Sheet range after a related write.
- Do not poll nonexistent or hardcoded match IDs.
- Keep OBS snapshot caching enabled and use a sensible polling interval.
- Avoid helper functions that each reread the same Sheet in one request.
- Count all outbound calls when working under Cloudflare Worker subrequest limits.
- Prefer one settlement request over many independent inventory/event/map writes.

The observed Google failure mode was `429 ReadRequestsPerMinutePerUser` with a 60-request limit. The observed Worker
failure mode was `Too many subrequests by a single Worker invocation`. Treat both as architecture signals, not errors
to solve with blind retries.

## 17. Consistency And Failure Handling

### Existing Protections

- Completed map rows make score retries idempotent.
- Score settlement batches related Sheet updates.
- Recipe resolution stores reversal information.
- Lobby creation is serialized and recently deduplicated by the relay.
- Exact IRC channel filtering prevents cross-lobby chat leakage.
- UI surfaces API failures instead of permanently disabling the score form.

### Remaining Risks

- `updated_at` exists but is not yet used as an optimistic concurrency version.
- Separate browser sessions can still race on the same match.
- Some recipe crafting operations require sequential cross-tab writes and may partially complete if Sheets fails midway.
- Match state may commit before the browser finishes sending all IRC setup commands.
- The single Hono file makes shared-read duplication and effect coupling easy to introduce.
- Module-level caches are per Worker isolate, not globally coherent.

Recommended next-project fixes:

1. Add a version field and reject stale writes, or serialize each match with a Durable Object.
2. Add idempotency keys to all mutations, not only score behavior.
3. Store required IRC commands in an outbox with sent/acknowledged state.
4. Reconcile incomplete operations on match load.
5. Separate Sheet repositories, domain services, effect handlers, and HTTP route adapters.

## 18. API Surface

The complete current request and response documentation is in
[`apps/ref-panel/README.md`](../../apps/ref-panel/README.md). The groups to preserve conceptually are:

| Group            | Responsibilities                                                       |
| ---------------- | ---------------------------------------------------------------------- |
| Public           | Health, public config, sanitized match snapshot.                       |
| Authentication   | Login, callback, session, logout, read-only bypass, local diagnostics. |
| Dashboard        | Match list, referee signup/signout, admin schedule edits.              |
| Match state      | Mappool, inventory, state transitions, manual star corrections, reset. |
| Match actions    | Pick, ban, protect, unpick, setup, score, forfeit, final result.       |
| Gimmicks         | List events, craft/use, revert/refund.                                 |
| IRC/lobby        | Send, stream, create, join, close, reminder.                           |
| Integration test | Probe, bind, unbind, validate result, consume event.                   |

Do not expose a mutation as public merely because the caller is a browser overlay. Read-only overlay endpoints may be
public; any action that changes Sheet, lobby, recipe, or score state requires authentication and authorization.

## 19. Recommended New-Project Plan

### Phase 1: Lock The Rules

Produce a written specification containing:

- Match format and win threshold.
- Complete phase/transition table.
- Pick and ban order per round.
- Pool names and required/optional mods.
- Tie and replay handling.
- Resource earning and spending rules.
- Every gimmick's timing, conflicts, activation, resolution, reversal, and output text.
- Result webhook and overlay fields.

Do not start by renaming Caramel or changing colors. Rule ambiguity causes most expensive rework.

### Phase 2: Create A New Data Contract

1. Copy only the required Sheet tabs into a new spreadsheet.
2. Remove MWS-specific columns or rename them through an explicit migration.
3. Seed test players, test matches, pool maps, access rows, and item definitions.
4. Use a separate service account or explicitly share the new Sheet with the intended account.
5. Document required formats and validation rules in the Sheet itself.

### Phase 3: Fork Infrastructure

1. Copy `apps/ref-panel` into a new workspace app or a new repository.
2. Copy `infra/irc-relay` if the project needs live BanchoBot control.
3. Rename package, Worker, Pages project, cookie, and service names.
4. Register a new osu! OAuth client.
5. Generate new session, proxy, and relay secrets.
6. Configure a separate production domain and callback URL.

### Phase 4: Isolate Domain Logic

Before adding new gimmicks, extract:

```text
functions/domain/match-flow.ts
functions/domain/scoring.ts
functions/domain/effects/*.ts
functions/repositories/sheets/*.ts
functions/services/irc.ts
functions/services/osu.ts
functions/routes/*.ts
```

Keep pure rule functions in a shared module so both UI and API tests can use them without duplicating logic.

### Phase 5: Implement Rules And Gimmicks

1. Implement the base state machine without gimmicks.
2. Verify pick, ban, score, replay, unpick, reset, forfeit, and result flows.
3. Add the resource model.
4. Add one effect handler at a time with activation, settlement, and reversal tests.
5. Add conflict/exclusivity rules.
6. Add chat and result descriptions.
7. Add public snapshot fields only after authoritative storage exists.

### Phase 6: Redesign

1. Replace brand assets and theme tokens.
2. Establish the schedule/dashboard information hierarchy.
3. Recompose match controls around the new state machine.
4. Keep high-frequency controls visible and stable.
5. Verify loading, error, disabled, pending, retry, empty, and completed states.
6. Capture screenshots at desktop, narrow laptop, and overlay sizes.

### Phase 7: Integration And Load Testing

1. Run recorded MP histories through test mode.
2. Run two simultaneous lobbies with different referees and verify zero cross-channel events.
3. Run concurrent actions against one match and confirm stale writes are rejected.
4. Poll public snapshots from realistic OBS clients.
5. Observe Sheets requests and Worker subrequests.
6. Force relay, Sheets, and osu! API failures and verify retry behavior.

### Phase 8: Production Cutover

1. Freeze Sheet headers.
2. Set `test mode = FALSE`.
3. Remove or strictly gate diagnostics.
4. Verify OAuth callback and cookie settings on the production domain.
5. Verify relay health and secrets.
6. Run one full private match rehearsal.
7. Deploy an immutable commit and verify the production asset hash and `/api/health`.

## 20. Acceptance Test Matrix

| Area                    | Required test                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| OAuth                   | Valid allowed user succeeds; unknown user fails; state mismatch fails.                                            |
| Admin                   | Non-admin cannot mutate schedule even with a manual API request.                                                  |
| Schedule                | Date remains a formatted Sheet date after portal edit.                                                            |
| Signup                  | Empty match can be claimed; another referee is not replaced; own signup can be removed.                           |
| Lobby creation          | Two simultaneous creates produce the correct two titles and URLs.                                                 |
| IRC isolation           | Activity in lobby A never appears or sends in lobby B.                                                            |
| IRC identity            | Non-command text includes actual authenticated ref; commands remain unchanged.                                    |
| Rolls/order             | Manual and detected rolls lead to the correct picker/banner.                                                      |
| Bans                    | Every round enforces its exact count and no more than the absolute maximum.                                       |
| Home pool               | Same-home-pool players both receive the correct loss/win behavior.                                                |
| Mods                    | Each pool and effect produces exact `!mp mods` and `!mp allowed_mods` commands.                                   |
| HD normalization        | Reported HD score is divided by the configured multiplier before comparison.                                      |
| Alternate win condition | Score, accuracy, and any custom statistic choose the correct winner and tie behavior.                             |
| Gimmick conflict        | Exclusive gimmick refunds only active pending conflicts and leaves one active event.                              |
| Random map              | Every valid catalog row is eligible; blank conditions use defaults; repeats are avoided while alternatives exist. |
| Rewards                 | Winner receives exact resources once; retry gives no duplicate; unpick reverses them.                             |
| Replay                  | First run persists, second run settles, and tied values remain replayable.                                        |
| Manual correction       | Star reset does not cause the next score to use stale totals.                                                     |
| API failure             | A failed settlement remains retryable and does not leave the UI falsely completed.                                |
| Result                  | Score, URL, bans, home pools, rundown, recipes, and gimmick details are present.                                  |
| Overlay                 | Cookie-free request returns current sanitized state with CORS and bounded cache age.                              |
| Quota                   | Normal dashboard plus overlay traffic remains below Sheets quota.                                                 |

## 21. Environment And Deployment

Required environment variable names are documented in
[`apps/ref-panel/.env.example`](../../apps/ref-panel/.env.example). Use new values for the next project and never commit
real credentials.

Minimum local workflow:

```bash
bun install
cd apps/ref-panel
cp .env.example .env.local
bun run dev:pages
```

Verification:

```bash
bun run typecheck
bun test
bun run build
```

Cloudflare Pages settings:

| Setting            | Value                           |
| ------------------ | ------------------------------- |
| Root directory     | `apps/ref-panel`                |
| Install command    | `bun install --frozen-lockfile` |
| Build command      | `bun run build`                 |
| Output directory   | `dist`                          |
| Compatibility flag | `nodejs_compat`                 |

Direct deployment pattern:

```bash
npx wrangler pages deploy dist \
  --project-name <new-pages-project> \
  --branch main \
  --commit-hash <git-commit>
```

The relay must be deployed separately as a persistent service. Its implementation and operational contract are in
[`infra/irc-relay/README.md`](../../infra/irc-relay/README.md).

## 22. Current Verification Baseline

At handoff creation:

- `npm run typecheck` passed.
- Ref portal production build passed.
- Focused ESLint checks for changed files passed.
- `24/24` Bun tests passed.
- Production `/api/health` returned HTTP 200.
- `main` and `origin/main` pointed to `a1ac50f` before this documentation-only change.

Repository-wide lint still has existing React Fast Refresh and effect-state findings in unrelated application/shadcn
files. Do not treat those as regressions from the current gimmick work, but resolve them when creating the clean fork.

## 23. Key References

| Artifact                                                                                       | Purpose                                                              |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`apps/ref-panel/README.md`](../../apps/ref-panel/README.md)                                   | Full current API, Sheet, auth, and deployment reference.             |
| [`plan.md`](../../plan.md)                                                                     | Current implementation status, pending work, and original decisions. |
| [`apps/ref-panel/functions/api/[[route]].ts`](../../apps/ref-panel/functions/api/[[route]].ts) | Current Hono API implementation.                                     |
| [`apps/ref-panel/src/lib/match-rules.ts`](../../apps/ref-panel/src/lib/match-rules.ts)         | Pure rules and formatting helpers.                                   |
| [`apps/ref-panel/tests/match-rules.test.ts`](../../apps/ref-panel/tests/match-rules.test.ts)   | Current rule regression tests.                                       |
| [`infra/irc-relay/relay.ts`](../../infra/irc-relay/relay.ts)                                   | Persistent IRC transport and lobby creation coordinator.             |
| [`recipe.csv`](../../recipe.csv)                                                               | Original recipe reference data for the current tournament only.      |

## 24. Handoff Summary

| Requirement             | Current solution                                             | Next-project action                                                  |
| ----------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Durable match workflow  | Sheet-backed explicit state machine                          | Rewrite transitions from the new rules before UI work.               |
| Parallel lobbies        | Exact-channel SSE and serialized lobby creation              | Reuse unchanged and load-test with two lobbies.                      |
| Flexible gimmicks       | Item definitions plus lifecycle events                       | Replace condition chains with effect handlers.                       |
| Correct scoring         | Ordered server-side settlement and idempotent completed rows | Preserve ordering; add API-level tests and idempotency keys.         |
| Stream integration      | Public cached snapshot without cookies                       | Reuse schema pattern and customize fields.                           |
| Different visual design | shadcn primitives plus theme tokens                          | Keep primitives, replace tokens/assets/layout intentionally.         |
| Sheets scalability      | Batch reads/writes and short isolate cache                   | Add repository request coalescing and monitor quotas.                |
| Concurrent referees     | Shared authoritative Sheet state                             | Add version checks or per-match serialization.                       |
| Production operations   | Pages deployment plus persistent relay                       | Create separate projects, secrets, OAuth client, and rehearsal plan. |
