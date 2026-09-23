// Parsers for the schedule, read from the admin sheet.
//
// Two tabs matter:
//
// 1. `m_i` — the match table. One header row, one row per match, fed by a
//    single IMPORTRANGE from the ref panel's own `matches` sheet. The `b_d`
//    tab next to it is only a formatted display built from this one with
//    FILTER(), so this is the source to read: it keeps the best-of, the year
//    (b_d's dates are bare "(Sat) Sep 19") and an explicit status.
// 2. `PlayerList` — osu! user id per entrant. `m_i` names players but never
//    ids them, and ids are what avatars and ranks need.
//
// Unlike the pooling sheet these tabs have usable headers, so they are read by
// key rather than by column position.

import { toTable } from "./rows"

// ---------------------------------------------------------------------------
// Ranges
// ---------------------------------------------------------------------------

/** Row 1 is the header. Generous on rows — the tab grows as rounds are drawn. */
export const MATCHES_RANGE = "m_i!A1:S200"
/** Row 1 is the header ("User ID", "Player", "Discord", "Team", "Time Zone"). */
export const PLAYER_LIST_RANGE = "PlayerList!A1:E400"

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

export type RoundSettings = {
  /** Display name exactly as the match table spells it, e.g. "Round of 32". */
  stage: string
  /** URL segment, e.g. "ro32". */
  slug: string
  /** 9, 11, 13 — the sheet's own `best_of` column. */
  bestOf: number | null
  /** Wins needed to close the match out: 9 -> 5. Null when bestOf is absent. */
  winsNeeded: number | null
}

/**
 * Stage name -> URL slug. Only the names that don't reduce cleanly are listed;
 * "Round of 32" and friends are handled by the numeric rule below.
 */
const STAGE_SLUGS: Record<string, string> = {
  qualifiers: "q",
  quarterfinals: "qf",
  semifinals: "sf",
  finals: "f",
  "grand finals": "gf",
}

export function stageSlug(stage: string): string {
  const key = stage.trim().toLowerCase()
  const known = STAGE_SLUGS[key]
  if (known) return known
  const roundOf = /^round of (\d+)$/.exec(key)
  if (roundOf) return `ro${roundOf[1]}`
  // Anything unrecognised still needs a usable, stable segment.
  return key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

const num = (raw: string | undefined): number | null => {
  const cleaned = (raw ?? "").replace(/[^0-9.-]/g, "")
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * The rounds to show tabs for, in the order the match table lists them.
 *
 * There is no separate round registry to read: every row carries its own round
 * name and best-of, so the rounds are whatever the drawn matches say they are.
 * Row order is match id order, which is bracket order, so first appearance is
 * the right ordering — and a round with no matches never appears at all.
 */
export function deriveRounds(matches: ScheduleMatch[]): RoundSettings[] {
  const rounds: RoundSettings[] = []
  const seen = new Set<string>()
  for (const match of matches) {
    if (seen.has(match.slug)) continue
    seen.add(match.slug)
    rounds.push({
      stage: match.stage,
      slug: match.slug,
      bestOf: match.bestOf,
      winsNeeded: winsNeeded(match.bestOf),
    })
  }
  return rounds
}

/** Bo9 -> 5. A match ends the moment one player reaches this. */
const winsNeeded = (bestOf: number | null): number | null =>
  bestOf != null && bestOf > 0 ? Math.ceil(bestOf / 2) : null

// ---------------------------------------------------------------------------
// PlayerList — name -> osu! id
// ---------------------------------------------------------------------------

export type Entrants = {
  /** Lower-cased entrant name (player and team spelling) -> osu! user id. */
  byName: Map<string, number>
  /** Every registered entrant's id, used to tell real matches from test rows. */
  ids: Set<number>
}

/**
 * Index the registration list.
 *
 * The match table identifies players by name only, so this join is the only
 * route to an avatar or a rank. Both the player and team spellings are indexed;
 * they are identical in this 1v1 season ("Team Size: 1" on the admin Settings
 * tab), but a team name that drifts from the osu! username shouldn't cost the
 * player their avatar. Names are matched case-insensitively.
 */
export function parsePlayerList(values: string[][]): Entrants {
  const byName = new Map<string, number>()
  const ids = new Set<number>()
  for (const row of toTable(values).records) {
    const id = num(row.userId)
    if (id == null) continue
    ids.add(id)
    for (const name of [row.player, row.team]) {
      if (name) byName.set(name.toLowerCase(), id)
    }
  }
  return { byName, ids }
}

// ---------------------------------------------------------------------------
// m_i — the matches themselves
// ---------------------------------------------------------------------------

export type MatchPlayer = {
  name: string
  /** Null when the name can't be resolved to a registered entrant. */
  osuId: number | null
  /** Live global rank, filled by osu! enrichment. */
  rank: number | null
}

export type MatchStatus = "upcoming" | "live" | "complete"

export type ScheduleMatch = {
  /** Numeric part of the sheet's id — the tournament's own ordering. */
  matchId: number
  /** The id as the sheet writes it, e.g. "41" or the contingency row "41b". */
  matchLabel: string
  stage: string
  slug: string
  /** ISO 8601 UTC start, or null if the row has no usable date and time. */
  startTime: string | null
  /** The date exactly as the sheet writes it ("19/09/2026"), for a fallback. */
  date: string
  /** The time exactly as the sheet writes it ("16:00"). UTC. */
  time: string
  p1: MatchPlayer
  p2: MatchPlayer
  /** Numeric score, or null when the cell is blank or a forfeit. */
  p1Score: number | null
  p2Score: number | null
  /** Which side forfeited, if either. */
  forfeit: "p1" | "p2" | null
  mpId: number | null
  mpUrl: string | null
  referee: string | null
  streamer: string | null
  commentators: string[]
  bestOf: number | null
  status: MatchStatus
}

/** A forfeit is written as "FF", or as a -1 on the forfeiting side's score. */
const FORFEIT = /^(ff|forfeit|-1)$/i

/** The sheet joins the two commentator cells with this. */
const COMMS_SEPARATOR = "✢"

/**
 * "41a" — a contingency row.
 *
 * When a slot's entrants aren't known yet the sheet keeps the real row ("41",
 * players blank) and adds one lettered row per possible pairing, each with its
 * own booked time and staff, so a referee and a stream slot are held whatever
 * the previous round does. Only one of them can ever be played, so publishing
 * all four would advertise three matches that won't happen.
 */
const CONTINGENCY = /^\d+\s*[a-z]+$/i

/** How long after its start time a match is still assumed to be in progress. */
const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000

/**
 * "19/09/2026" + "16:00" -> "2026-09-19T16:00:00.000Z".
 *
 * The sheet writes dd/mm/yyyy and treats every time as UTC. Anything that
 * doesn't match that shape yields null rather than a guessed date — the raw
 * strings are kept on the match either way, so the card can still render.
 */
export function toStartTime(date: string, time: string): string | null {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date.trim())
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!d || !t) return null
  const [, day, month, year] = d
  const [, hour, minute] = t
  const ms = Date.UTC(+year, +month - 1, +day, +hour, +minute)
  if (!Number.isFinite(ms)) return null
  // Date.UTC rolls overflow over silently (month 13 -> January), so reject
  // anything that didn't survive the round trip.
  const iso = new Date(ms)
  if (iso.getUTCMonth() !== +month - 1 || iso.getUTCDate() !== +day) return null
  return iso.toISOString()
}

/**
 * Decide where a match is in its life.
 *
 * The sheet's own `status` is authoritative when it is set — the ref panel
 * writes it when a match is closed out. Everything else is inference: a score
 * that reaches first-to-N is final whatever the status column says, a lobby
 * with no result yet is in progress, and otherwise the clock decides. The
 * window matters because a match that was abandoned, retired or never fully
 * scored would otherwise read as live forever.
 */
function matchStatus(
  sheetStatus: string,
  p1Score: number | null,
  p2Score: number | null,
  forfeit: "p1" | "p2" | null,
  mpId: number | null,
  wins: number | null,
  startTime: string | null,
  now: number
): MatchStatus {
  if (forfeit) return "complete"
  const status = sheetStatus.trim().toLowerCase()
  if (status === "completed" || status === "forfeit") return "complete"

  const p1 = p1Score ?? 0
  const p2 = p2Score ?? 0
  if (wins != null && (p1 >= wins || p2 >= wins)) return "complete"
  // A lobby exists but nothing has closed the match out yet.
  if (mpId != null) return "live"

  const start = startTime ? Date.parse(startTime) : NaN
  if (!Number.isFinite(start)) return p1 + p2 > 0 ? "live" : "upcoming"
  if (now < start) return "upcoming"
  // Started, but no lobby, no final score and the window has passed: whatever
  // the sheet kept is what it is, and the match is not still going.
  return now < start + LIVE_WINDOW_MS ? "live" : "complete"
}

/**
 * Parse the `m_i` tab.
 *
 * A row counts as a match when it has an id and both player names; the tab
 * carries undrawn slots (an id and a pencilled-in date, no players) without
 * them. Players arrive unresolved — `osuId` is filled in by the caller, which
 * is also what drops rows that aren't between two registered entrants.
 */
export function parseMatches(
  values: string[][],
  now: number = Date.now()
): ScheduleMatch[] {
  const matches: ScheduleMatch[] = []

  toTable(values).records.forEach((row, i) => {
    const matchLabel = row.matchId ?? ""
    const matchId = num(matchLabel)
    const stage = row.round ?? ""
    const p1Name = row.playerA ?? ""
    const p2Name = row.playerB ?? ""
    if (matchId == null || !stage) return
    if (!p1Name || !p2Name) return // slot not drawn yet

    const p1Raw = row.scoreA ?? ""
    const p2Raw = row.scoreB ?? ""

    // A contingency row earns its place only once it has been played: a score
    // on the board means this is the pairing that happened.
    if (CONTINGENCY.test(matchLabel) && !p1Raw && !p2Raw) return

    const forfeit = FORFEIT.test(p1Raw)
      ? "p1"
      : FORFEIT.test(p2Raw)
        ? "p2"
        : null
    const bestOf = num(row.bestOf)
    const mpId = num(row.mp)
    const date = row.date ?? ""
    const time = row.time ?? ""
    const startTime = toStartTime(date, time)
    if (date && !startTime) {
      console.warn(
        `[matches] row ${i + 2}: unreadable date/time "${date} ${time}"`
      )
    }

    const p1Score = forfeit ? null : num(p1Raw)
    const p2Score = forfeit ? null : num(p2Raw)

    matches.push({
      matchId,
      matchLabel,
      stage,
      slug: stageSlug(stage),
      startTime,
      date,
      time,
      p1: { name: p1Name, osuId: null, rank: null },
      p2: { name: p2Name, osuId: null, rank: null },
      p1Score,
      p2Score,
      forfeit,
      mpId,
      mpUrl: mpId != null ? `https://osu.ppy.sh/mp/${mpId}` : null,
      referee: row.referee || null,
      streamer: row.streamer || null,
      commentators: (row.comms ?? "")
        .split(COMMS_SEPARATOR)
        .map((c) => c.trim())
        .filter(Boolean),
      bestOf,
      status: matchStatus(
        row.status ?? "",
        p1Score,
        p2Score,
        forfeit,
        mpId,
        winsNeeded(bestOf),
        startTime,
        now
      ),
    })
  })

  // Match id is the tournament's own ordering (it runs in bracket order), and
  // the sheet is not guaranteed to be sorted. Ties fall back to the label so a
  // played "41a" sorts next to "41" rather than at random.
  return matches.sort(
    (a, b) => a.matchId - b.matchId || a.matchLabel.localeCompare(b.matchLabel)
  )
}

/**
 * Attach osu! ids, and drop anything that isn't a match between two entrants.
 *
 * `resolved` covers the names the registration list didn't (a player who has
 * since changed their osu! username), so membership is tested on the id, not
 * the spelling. Rows between two non-entrants are the ref team's own test
 * lobbies, which the sheet keeps alongside the real matches.
 *
 * Fail-open: a name that resolved to nothing at all keeps its match and simply
 * renders without an avatar, so an osu! API outage can't empty the schedule.
 */
export function withEntrants(
  matches: ScheduleMatch[],
  entrants: Entrants,
  resolved: Map<string, number>
): ScheduleMatch[] {
  const idFor = (name: string): number | null =>
    entrants.byName.get(name.toLowerCase()) ??
    resolved.get(name.toLowerCase()) ??
    null

  const out: ScheduleMatch[] = []
  for (const match of matches) {
    const p1Id = idFor(match.p1.name)
    const p2Id = idFor(match.p2.name)
    if (
      (p1Id != null && !entrants.ids.has(p1Id)) ||
      (p2Id != null && !entrants.ids.has(p2Id))
    ) {
      console.warn(
        `[matches] #${match.matchLabel}: "${match.p1.name}" vs "${match.p2.name}" is not between two entrants — skipped`
      )
      continue
    }
    out.push({
      ...match,
      p1: { ...match.p1, osuId: p1Id },
      p2: { ...match.p2, osuId: p2Id },
    })
  }
  return out
}

/** Every player name in the schedule that the registration list didn't cover. */
export function unresolvedNames(
  matches: ScheduleMatch[],
  entrants: Entrants
): string[] {
  const names = new Set<string>()
  for (const match of matches) {
    for (const player of [match.p1, match.p2]) {
      if (!entrants.byName.has(player.name.toLowerCase())) names.add(player.name)
    }
  }
  return [...names]
}
