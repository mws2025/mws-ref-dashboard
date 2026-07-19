# Google Sheets data layer — implementation plan

How to finish wiring the site to read from Google Sheets (private sheets →
service account → KV-cached reads → `revalidateTag` webhook). Files already
built are marked **(exists)**; the rest is config + wiring the last two pages.

Each phase has a **Gate** — don't move on until it passes. None of the data
layer has run against real credentials yet, so these gates are the real tests.

---

## Phase 1 — Structure the sheets

No repo files. The header row of each sheet **must normalize to the schema
keys**, or rows are silently skipped.

- Reference (don't edit): `apps/web/src/server/data/schemas.ts` (field names) +
  `apps/web/src/server/data/rows.ts` → `toKey()` (normalization rule).

| Sheet | Header row (row 1) |
|---|---|
| staff | `ID`, `Username`, `Country Code`, `Discord`, `Roles`, `Timezone`, `Pronouns`, `Custom Link`, `Custom Image` |
| players | `Timestamp`, `ID`, `Discord`, `Badges`, `Timezone`, `Pronouns Pt1`, `Pronouns Pt2` |
| mappools (per stage range) | `Slot`, `Beatmap ID`, `Difficulty`, `Mapper`, `Star Rating`, `BPM`, `Is Original`, `Is Custom` |
| matches | `Match ID`, `Stage`, `Date`, `Time`, `Match URL`, `Referee`, `Streamer`, `Commentators`, `P1`, `P2`, `P1 Seed`, `P2 Seed`, then `P1 1`, `P2 1`, `P1 2`, `P2 2`, … |

- `Roles` / `Commentators`: comma-separated in one cell.
- `Is Original` / `Is Custom`: `TRUE` / `FALSE`.
- **players** is registration-form shaped: `username`, `country`, and `rank`
  are **not** in the sheet — they come from the osu! API (Phase 5).

**Gate:** send the real matches header row → confirm/adjust the score regex in
`apps/web/src/server/data/matches.ts:11`.

---

## Phase 2 — Google service account

No repo files.

1. GCP → create a service account → create a **JSON key**.
2. Enable the **Google Sheets API** for the project.
3. Share **all 4 spreadsheets** with the SA email as **Viewer**.
4. `client_email` / `private_key` → `.dev.vars` (Phase 5).

---

## Phase 3 — osu! OAuth app

No repo files. osu! settings → OAuth → new application → client id/secret into
`.dev.vars`. No redirect URL (client-credentials grant).

---

## Phase 4 — Cloudflare KV

- **Modify:** `apps/web/wrangler.jsonc` — paste the id, remove the TODO.

```bash
cd apps/web
bunx wrangler kv namespace create NEXT_INC_CACHE_KV
```

---

## Phase 5 — Local run + verify

- **Create:** `apps/web/.dev.vars` — copy from `apps/web/.dev.vars.example`
  **(exists)** and fill every value.

```bash
cd apps/web && bun run dev   # :5174
```

- **Gate A** — `/staff` renders from the sheet. Missing rows → console shows
  `[sheets:staff] skipped row N` (header/format mismatch vs Phase 1).
- **Gate B** — `/players` shows real ranks. If `—`, fix the field path:
  - **Modify:** `apps/web/src/server/osu.ts` → `extractRank()`.

> **players enrichment TODO:** the players sheet no longer carries `username` /
> `country`, but `PlayerCard` needs them. `fetchOsuUsers` currently returns only
> `{ id, rank }`. Extend it to also pull `user.username` and
> `user.country_code` (or `user.country.code`), then map them in `getPlayers`
> (`apps/web/src/server/data/index.ts`). Update the `Player` type + `OsuUser`
> type in `schemas.ts` / `osu.ts` accordingly.

Involved files (exists; no edits unless a gate fails): `env.ts`, `google.ts`,
`data/index.ts`, `data/rows.ts`, `data/schemas.ts`; `next.config.ts` (dev
bindings already wired via `initOpenNextCloudflareForDev()`).

---

## Phase 6 — Prove caching

- **Optional modify:** `apps/web/src/server/data/index.ts` → `REVALIDATE_SECONDS`.
- Route (exists): `apps/web/src/app/api/revalidate/route.ts`.

**Gate C:**
1. Load `/staff`, note the data.
2. Edit a cell → reload → still shows **old** data (proof reads are cached).
3. `curl -X POST ".../api/revalidate?secret=SECRET&tag=staff"` → reload → fresh.

---

## Phase 7 — Wire the remaining pages

- **Modify:** `apps/web/src/app/(pages)/mappools/page.tsx` → `await getMappools()`.
- **Modify:** `apps/web/src/app/(pages)/schedule/page.tsx` → `await getSchedule()`.
- **Create (likely):**
  - `apps/web/src/app/(pages)/mappools/components/MapCard.tsx`
  - `apps/web/src/app/(pages)/schedule/components/MatchRow.tsx`
- Types from `apps/web/src/server/data/schemas.ts` (`StageMappool`, `Match`).

---

## Phase 8 — Apps Script triggers (seconds-fresh)

External, per spreadsheet. Tags must match `TAGS` in
`apps/web/src/server/data/index.ts`.

- **Optional create (version-controlled reference):** `apps/web/scripts/revalidate.gs`

```js
const REVALIDATE_URL = "https://YOUR-DOMAIN/api/revalidate"
const SECRET = "YOUR_SECRET"
const TAG = "staff" // staff | players | mappools | matches

function onEditPing() {
  UrlFetchApp.fetch(`${REVALIDATE_URL}?secret=${SECRET}&tag=${TAG}`, {
    method: "post",
    muteHttpExceptions: true,
  })
}
```

Add an **installable onEdit trigger** in each sheet's Apps Script editor.

**Gate D:** edit a sheet → site reflects it within seconds.

---

## Phase 9 — Deploy

- **Modify (optional):** `apps/web/wrangler.jsonc` if wiring the `API` service binding.

```bash
cd apps/web
bunx wrangler secret put GOOGLE_SA_EMAIL   # repeat per secret in .dev.vars.example
bun run deploy
```

Re-run Gates A–D against the deployed URL.

---

## Cleanup

- **Delete (decision):** `packages/db/schema/staff.ts` — unused by the web app
  now. Keep only if the bot needs it. If dropping all of `packages/db`, also
  remove it from the workspace in the root `package.json`.

---

## Fastest path

Phase 4 → 5, get `/staff` green first (no osu! dependency), then `/players`.
The two riskiest, unverified assumptions: **matches score headers** (Phase 1)
and the **osu! rank field path** (Gate B).
