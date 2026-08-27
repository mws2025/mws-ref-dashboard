import "server-only"
import { unstable_cache } from "next/cache"
import { readSheetValues } from "../google"
import { fetchOsuUsers, fetchOsuBeatmaps, computeBws } from "../osu"
import { getEnv, requireEnv } from "../env"
import { parseRows, toTable } from "./rows"
import { parseMatches } from "./matches"
import {
  parseStageSettings,
  parseStagePool,
  stageRange,
  SETTINGS_RANGE,
} from "./mappools"
import {
  staffSchema,
  playerRowSchema,
  type Staff,
  type Player,
  type MappoolStage,
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

  // Only rows with a linked osu! account need the API round-trip.
  const linked = rows.filter((r): r is typeof r & { id: number } => r.id !== null)
  const osu = await fetchOsuUsers(linked.map((r) => r.id))

  const staff: Staff[] = []
  for (const row of rows) {
    const pronouns = joinPronouns(row.pronoun1, row.pronoun2)

    // No osu! id: fall back to the discord handle for the display name. There's
    // no osu! avatar or country to source, so the card relies on a matching
    // file in public/staff-icons and renders without a flag.
    if (row.id === null) {
      if (!row.discord) {
        console.warn("[staff] row has neither an osu! id nor a discord handle, dropping")
        continue
      }
      staff.push({ ...row, username: row.discord, countryCode: null, pronouns })
      continue
    }

    const match = osu.get(row.id)
    if (!match) {
      console.warn(`[staff] no osu! user found for id ${row.id}, dropping`)
      continue
    }
    staff.push({
      ...row,
      username: match.username,
      countryCode: match.countryCode,
      pronouns,
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
  async (): Promise<MappoolStage[]> => {
    const env = await getEnv()
    const spreadsheetId = requireEnv(env, "SHEET_ID_POOLING")

    // Stage metadata comes from the sheet's Settings tab; which stages are
    // PUBLIC is the allowlist in ./mappools.ts (this sheet has no publish
    // column and marks every row TRUE, dumps included).
    const stages = parseStageSettings(
      await readSheetValues(spreadsheetId, env.RANGE_MAPPOOL_SETTINGS ?? SETTINGS_RANGE)
    )

    // Stage tabs are independent; one malformed tab shouldn't blank the page.
    const pools = await Promise.all(
      stages.map(async (stage) => {
        try {
          const values = await readSheetValues(
            spreadsheetId,
            stageRange(stage.tab)
          )
          return { ...stage, maps: parseStagePool(stage.tab, values) }
        } catch (err) {
          console.error(
            `[mappools] failed to read tab "${stage.tab}":`,
            err
          )
          return { ...stage, maps: [] }
        }
      })
    )

    const published = pools.filter((stage) => {
      if (stage.maps.length === 0) {
        // Allowlisted but the tab is empty/unreadable — an empty stage reads
        // as a bug to visitors, so drop it.
        console.warn(
          `[mappools] stage "${stage.name}" parsed 0 maps — hiding`
        )
        return false
      }
      if (
        stage.expectedMapCount != null &&
        stage.maps.length !== stage.expectedMapCount
      ) {
        // Not fatal: the pool still renders. Signals a slot-count mismatch
        // between the Settings row and the actual tab.
        console.warn(
          `[mappools] stage "${stage.name}" parsed ${stage.maps.length} maps ` +
            `but Settings expects ${stage.expectedMapCount}`
        )
      }
      return true
    })

    return enrichMappools(published)
  }
)

/**
 * Attach beatmapset ids + cover art from the osu! API.
 *
 * Best-effort: covers are decoration, so a failed lookup degrades to a
 * cover-less pool rather than taking the page down.
 */
async function enrichMappools(
  stages: MappoolStage[]
): Promise<MappoolStage[]> {
  const ids = [
    ...new Set(stages.flatMap((s) => s.maps.map((m) => m.beatmapId))),
  ]
  if (ids.length === 0) return stages

  let beatmaps: Awaited<ReturnType<typeof fetchOsuBeatmaps>>
  try {
    beatmaps = await fetchOsuBeatmaps(ids)
  } catch (err) {
    console.error("[mappools] osu! beatmap enrichment failed:", err)
    return stages
  }

  return stages.map((stage) => ({
    ...stage,
    maps: stage.maps.map((map) => {
      const osu = beatmaps.get(map.beatmapId)
      if (!osu) return map
      return {
        ...map,
        // osu! is authoritative for metadata; fall back to the sheet's copy.
        artist: osu.artist || map.artist,
        title: osu.title || map.title,
        difficulty: osu.difficulty || map.difficulty,
        mapper: osu.mapper || map.mapper,
        beatmapsetId: osu.beatmapsetId,
        coverUrl: osu.coverUrl,
        listUrl: osu.listUrl,
      }
    }),
  }))
}

/** One stage by tab identifier ("Q"), or null if it isn't published. */
export async function getMappoolStage(
  tab: string
): Promise<MappoolStage | null> {
  const stages = await getMappools()
  const wanted = tab.toUpperCase()
  return stages.find((s) => s.tab.toUpperCase() === wanted) ?? null
}

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
