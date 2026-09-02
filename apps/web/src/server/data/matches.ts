// Parsers for the referee sheet ("hoaq ref sheet v0.2").
//
// Three tabs matter, and like the pooling sheet they are read POSITIONALLY:
//
// 1. `bracket` — one row per match. Row 2 holds headers, rows 3-4 are blank
//    and data starts at row 5. Several data columns have no header at all
//    (K/L/M carry ref+streamer signups that duplicate O/P), so header-keyed
//    reading cannot address this tab.
// 2. `settings` — round -> best-of. This is what decides whether a score is
//    final, and therefore whether a match is still live.
// 3. `players` — osu! user id per player name. The bracket tab names players
//    but never ids them, and ids are what avatars and ranks need.

/** "A" -> 0, "K" -> 10. Lets the column maps below use sheet letters. */
const col = (letter: string): number =>
  letter
    .toUpperCase()
    .split("")
    .reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1

const cell = (row: string[], i: number): string => (row[i] ?? "").trim()

// ---------------------------------------------------------------------------
// Ranges
// ---------------------------------------------------------------------------

/** Reaches to Y so the commentator columns are covered; rows are generous. */
export const BRACKET_RANGE = "bracket!A1:Y400"
/** Row 3 is the header ("round/pool name", "best of", ...), rounds follow. */
export const MATCH_SETTINGS_RANGE = "settings!A3:D30"
/** Row 1 is the header ("user id", "player name", ...). */
export const REF_PLAYERS_RANGE = "players!A1:E400"

// ---------------------------------------------------------------------------
// settings — round metadata
// ---------------------------------------------------------------------------

export type RoundSettings = {
  /** Display name exactly as the bracket tab spells it, e.g. "Round of 32". */
  stage: string
  /** URL segment, e.g. "ro32". */
  slug: string
  /** 9, 11, 13 — the sheet's own "best of" column. */
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

const num = (raw: string): number | null => {
  const cleaned = raw.replace(/[^0-9.-]/g, "")
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Parse the `settings` tab's round table.
 *
 * Order is preserved: the sheet lists rounds in bracket order, and that is the
 * order the round tabs are shown in.
 */
export function parseRoundSettings(values: string[][]): RoundSettings[] {
  const rounds: RoundSettings[] = []
  // The range starts at the header row, so skip it.
  for (const row of values.slice(1)) {
    const stage = cell(row, 0)
    if (!stage) continue
    const bestOf = num(cell(row, 1))
    rounds.push({
      stage,
      slug: stageSlug(stage),
      bestOf,
      // Bo9 -> 5. A match ends the moment one player reaches this.
      winsNeeded: bestOf != null && bestOf > 0 ? Math.ceil(bestOf / 2) : null,
    })
  }
  return rounds
}

// ---------------------------------------------------------------------------
// players — name -> osu! id
// ---------------------------------------------------------------------------

/**
 * Map of lower-cased player name -> osu! user id.
 *
 * The bracket tab identifies players by name only, so this join is the only
 * route to an avatar or a rank. Names are matched case-insensitively; a player
 * missing here (or renamed since signup) simply renders without an avatar
 * rather than dropping the match.
 */
export function parseRefPlayers(values: string[][]): Map<string, number> {
  const byName = new Map<string, number>()
  for (const row of values.slice(1)) {
    const id = num(cell(row, 0))
    const name = cell(row, 1)
    if (id == null || !name) continue
    byName.set(name.toLowerCase(), id)
  }
  return byName
}

// ---------------------------------------------------------------------------
// bracket — the matches themselves
// ---------------------------------------------------------------------------

// Column offsets. Header row 2 labels most of these; K/L/M are unlabelled
// signup cells that mirror O/P, so the labelled pair is what's read.
const M = {
  stage: col("C"), // "Round of 32"
  matchId: col("D"), // "1"
  date: col("E"), // "(Sun) Sep 28" — no year, see below
  time: col("F"), // "02:00" (UTC)
  p1: col("G"), // "red team"
  p1Score: col("H"), // "5", or "FF"
  p2Score: col("I"),
  p2: col("J"), // "blue team"
  mp: col("K"), // multiplayer room id, blank until the lobby exists
  referee: col("O"),
  streamer: col("P"),
  commentator: col("Q"),
} as const

export type MatchPlayer = {
  name: string
  /** Null when the name isn't in the `players` tab. */
  osuId: number | null
  /** Live global rank, filled by osu! enrichment. */
  rank: number | null
}

export type MatchStatus = "upcoming" | "live" | "complete"

export type ScheduleMatch = {
  matchId: number
  stage: string
  slug: string
  /** As written in the sheet, e.g. "(Sun) Sep 28". No year is recorded. */
  date: string
  /** As written in the sheet, e.g. "20:00". UTC. */
  time: string
  p1: MatchPlayer
  p2: MatchPlayer
  /** Numeric score, or null when the cell is blank or a forfeit. */
  p1Score: number | null
  p2Score: number | null
  /** What the cell actually said — "FF" survives for display. */
  p1ScoreRaw: string
  p2ScoreRaw: string
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

const FORFEIT = /^(ff|forfeit)$/i

/**
 * Decide where a match is in its life.
 *
 * Deliberately NOT time-based: the sheet's date cells carry no year
 * ("(Sun) Sep 28"), so comparing them against now means guessing a year and
 * getting it wrong every December. Instead the sheet's own evidence is used —
 * a lobby id or a score on the board means the match started, and a score that
 * reaches the round's win threshold means it finished.
 */
function matchStatus(
  p1Score: number | null,
  p2Score: number | null,
  forfeit: "p1" | "p2" | null,
  mpId: number | null,
  winsNeeded: number | null
): MatchStatus {
  if (forfeit) return "complete"
  const p1 = p1Score ?? 0
  const p2 = p2Score ?? 0
  if (winsNeeded != null && (p1 >= winsNeeded || p2 >= winsNeeded)) {
    return "complete"
  }
  // No best-of configured for this round: without a threshold there is no way
  // to tell a finished match from one in progress, so never claim it is live.
  if (winsNeeded == null) return mpId != null ? "complete" : "upcoming"
  return mpId != null || p1 + p2 > 0 ? "live" : "upcoming"
}

/**
 * Parse the `bracket` tab.
 *
 * A row counts as a match when it has a numeric id and both player names; the
 * tab carries blank spacer rows and unplayed placeholder rows without them.
 */
export function parseBracket(
  values: string[][],
  rounds: RoundSettings[],
  playerIds: Map<string, number>
): ScheduleMatch[] {
  const byStage = new Map(rounds.map((r) => [r.stage.toLowerCase(), r]))
  const matches: ScheduleMatch[] = []

  // Row 2 is the header, rows 3-4 are spacers, data starts at row 5 (index 4).
  values.slice(4).forEach((row, i) => {
    const stage = cell(row, M.stage)
    const matchId = num(cell(row, M.matchId))
    const p1Name = cell(row, M.p1)
    const p2Name = cell(row, M.p2)
    if (!stage || matchId == null) return
    if (!p1Name || !p2Name) return // slot not drawn yet

    const round = byStage.get(stage.toLowerCase())
    if (!round) {
      console.warn(
        `[matches] row ${i + 5}: stage "${stage}" is not in the settings tab — skipped`
      )
      return
    }

    const p1Raw = cell(row, M.p1Score)
    const p2Raw = cell(row, M.p2Score)
    const forfeit = FORFEIT.test(p1Raw)
      ? "p1"
      : FORFEIT.test(p2Raw)
        ? "p2"
        : null
    const p1Score = forfeit ? null : num(p1Raw)
    const p2Score = forfeit ? null : num(p2Raw)
    const mpId = num(cell(row, M.mp))

    matches.push({
      matchId,
      stage: round.stage,
      slug: round.slug,
      date: cell(row, M.date),
      time: cell(row, M.time),
      p1: { name: p1Name, osuId: playerIds.get(p1Name.toLowerCase()) ?? null, rank: null },
      p2: { name: p2Name, osuId: playerIds.get(p2Name.toLowerCase()) ?? null, rank: null },
      p1Score,
      p2Score,
      p1ScoreRaw: p1Raw,
      p2ScoreRaw: p2Raw,
      forfeit,
      mpId,
      mpUrl: mpId != null ? `https://osu.ppy.sh/mp/${mpId}` : null,
      referee: cell(row, M.referee) || null,
      streamer: cell(row, M.streamer) || null,
      commentators: cell(row, M.commentator)
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      bestOf: round.bestOf,
      status: matchStatus(p1Score, p2Score, forfeit, mpId, round.winsNeeded),
    })
  })

  // Match id is the tournament's own ordering (it runs in bracket order), and
  // the sheet is not guaranteed to be sorted.
  return matches.sort((a, b) => a.matchId - b.matchId)
}

/**
 * Demote "live" to "complete" outside the round the tournament is actually on.
 *
 * The score rule alone ("hasn't reached first-to-N yet") is the right test for
 * a match in progress, but it also catches every historical match that never
 * reached the threshold — a retirement, a rescheduled match abandoned at 3-1, a
 * score the referee never finished filling in. On last season's sheet that was
 * 42 of 191 rows, spread across rounds that finished months ago.
 *
 * Since rounds run in sequence, only the furthest round with any activity can
 * contain a live match. Earlier rounds keep whatever score the sheet has, but
 * they read as finished rather than perpetually live.
 */
export function applyLiveGuard(
  matches: ScheduleMatch[],
  rounds: RoundSettings[]
): ScheduleMatch[] {
  const order = new Map(rounds.map((r, i) => [r.slug, i]))
  let latestActive = -1
  for (const m of matches) {
    if (m.status === "upcoming") continue
    latestActive = Math.max(latestActive, order.get(m.slug) ?? -1)
  }
  return matches.map((m) =>
    m.status === "live" && (order.get(m.slug) ?? -1) < latestActive
      ? { ...m, status: "complete" as const }
      : m
  )
}

/** Rounds that actually have matches, in the settings tab's order. */
export function roundsWithMatches(
  rounds: RoundSettings[],
  matches: ScheduleMatch[]
): RoundSettings[] {
  const present = new Set(matches.map((m) => m.slug))
  return rounds.filter((r) => present.has(r.slug))
}
