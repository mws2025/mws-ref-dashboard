import "server-only"
import { unstable_cache } from "next/cache"
import { readSheetValues } from "../google"
import { fetchOsuUsers, computeBws } from "../osu"
import { getEnv, requireEnv } from "../env"
import { parseRows, toTable } from "./rows"
import { parseMatches } from "./matches"
import {
  staffSchema,
  playerRowSchema,
  mappoolMapSchema,
  type Staff,
  type Player,
  type StageMappool,
  type Match,
} from "./schemas"
import { PLAYER_KEY_ORDER, STAFF_KEY_ORDER, remap } from "./sheet-mappings"

// Entity tags — also the values Apps Script posts to /api/revalidate.
export const TAGS = {
  staff: "staff",
  players: "players",
  mappools: "mappools",
  matches: "matches",
} as const

const REVALIDATE_SECONDS = 300 // safety net; onEdit webhook is the primary path

function joinPronouns(pronoun1: string, pronoun2: string): string | null {
  if (pronoun1 && pronoun2) return `${pronoun1}/${pronoun2}`
  return pronoun1 || pronoun2 || null
}

// Wrap a loader in the incremental cache (KV on Cloudflare). On failure the
// cache serves the last-good value, so Google/osu! downtime never 500s a page.
function cached<T>(tag: string, loader: () => Promise<T>): () => Promise<T> {
  return unstable_cache(loader, [tag], {
    tags: [tag],
    revalidate: REVALIDATE_SECONDS,
  })
}

export const getStaff = cached(TAGS.staff, async (): Promise<Staff[]> => {
  const env = await getEnv()
  const values = await readSheetValues(
    requireEnv(env, "SHEET_ID_ADMIN"),
    env.RANGE_STAFF
  )
  const allRows = parseRows(
    "staff",
    toTable(values).records.map((r) => remap(r, STAFF_KEY_ORDER)),
    staffSchema
  )
  const rows = allRows.filter((row) => row.approved)

  const osu = await fetchOsuUsers(rows.map((r) => r.id))
  const staff: Staff[] = []
  for (const row of rows) {
    const match = osu.get(row.id)
    if (!match) {
      console.warn(`[staff] no osu! user found for id ${row.id}, dropping`)
      continue
    }
    staff.push({
      ...row,
      username: match.username,
      countryCode: match.countryCode,
      pronouns: joinPronouns(row.pronoun1, row.pronoun2),
    })
  }
  return staff
})

export const getPlayers = cached(TAGS.players, async (): Promise<Player[]> => {
  const env = await getEnv()
  const values = await readSheetValues(
    requireEnv(env, "SHEET_ID_ADMIN"),
    env.RANGE_PLAYERS
  )

  const rows = parseRows(
    "players",
    toTable(values).records.map((r) => remap(r, PLAYER_KEY_ORDER)),
    playerRowSchema
  )

  // Enrich with live rank from osu! (batched, revalidation-time only)
  const osu = await fetchOsuUsers(rows.map((r) => r.id))
  const players: Player[] = []
  for (const row of rows) {
    const match = osu.get(row.id)
    if (!match) {
      console.warn(`[players] no osu! user found for id ${row.id}, dropping`)
      continue
    }

    players.push({
      ...row,
      username: match.username,
      countryCode: match.countryCode,
      pronouns: joinPronouns(row.pronoun1, row.pronoun2),
      rank: match.rank,
      bws: computeBws(match.rank, row.badges),
    })
  }
  return players
})

export const getMappools = cached(
  TAGS.mappools,
  async (): Promise<StageMappool[]> => {
    const env = await getEnv()
    const spreadsheetId = requireEnv(env, "SHEET_ID_POOLING")
    // { "Round of 32": "R32!A2:Z", ... }
    const stages = JSON.parse(env.MAPPOOL_STAGES ?? "{}") as Record<
      string,
      string
    >

    const pools: StageMappool[] = []
    for (const [stage, range] of Object.entries(stages)) {
      const values = await readSheetValues(spreadsheetId, range)
      pools.push({
        stage,
        maps: parseRows(
          `mappools:${stage}`,
          toTable(values).records,
          mappoolMapSchema
        ),
      })
    }
    return pools
  }
)

export const getMatches = cached(TAGS.matches, async (): Promise<Match[]> => {
  const env = await getEnv()
  const values = await readSheetValues(
    requireEnv(env, "SHEET_ID_REFEREE"),
    env.RANGE_MATCHES
  )
  return parseMatches(toTable(values))
})

// Schedule is just matches ordered by date/time — same source, different view.
export async function getSchedule(): Promise<Match[]> {
  const matches = await getMatches()
  return [...matches].sort((a, b) =>
    `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
  )
}

export * from "./schemas"
