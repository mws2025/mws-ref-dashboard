// Parsers for the "MWS:Wisked Pooling Sheet".
//
// This is a heavily customised pooling sheet, not the stock tournament
// template. Three things to know, all verified against the live file:
//
// 1. Columns are read POSITIONALLY, never by header text. Stage tabs are 66
//    columns wide and carry four parallel blocks (suggestions, ratings,
//    filter, assembly) that repeat header names like "Mod" and "SR", so the
//    header-keyed `toTable()` path used by staff/players cannot address them.
// 2. The authoritative pool is the "Mappool Assembly" block at AU:BN. The
//    earlier blocks are suggestion//filter scratch space and must be ignored.
// 3. The sheet has NO "publish" column, so which pools are public is gated by
//    PUBLISHED_STAGE_TABS below — see the note there before changing it.

/**
 * The tournament's mod brackets, matching the identifiers defined in the
 * sheet's own mod enum (`Settings` rows 29-34). Qualifiers only uses
 * NM/HR/DT, but later rounds add PS, FM and TB.
 */
export const MOD_BRACKETS = ["NM", "PS", "HR", "DT", "FM", "TB"] as const
export type ModBracket = (typeof MOD_BRACKETS)[number]

const BRACKET_SET = new Set<string>(MOD_BRACKETS)

/**
 * Stage tabs that may be shown on the site, by their `Settings` identifier.
 *
 * This sheet has no "Publish Pool" column, and `Settings` marks every row
 * TRUE — including unreleased rounds and the skillset dump tabs. Leaking an
 * unreleased mappool is the worst failure this page can have, so visibility
 * is an explicit allowlist in code rather than anything inferred from the
 * sheet. Add a round here on the day it goes public.
 */
export const PUBLISHED_STAGE_TABS: readonly string[] = ["Q"]

// ---------------------------------------------------------------------------
// Settings tab — stage metadata
// ---------------------------------------------------------------------------

/**
 * Range covering the stage registry. Row 3 is the header, stage rows follow.
 *
 * Deliberately reaches out to AC so there is room to add columns without
 * touching this — widen it only if a column lands past AC. Overridable per
 * environment with RANGE_MAPPOOL_SETTINGS.
 */
export const SETTINGS_RANGE = "Settings!A1:AC26"

/** "A" -> 0, "L" -> 11, "AA" -> 26. Lets the map below use sheet letters. */
const col = (letter: string): number =>
  letter
    .toUpperCase()
    .split("")
    .reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1

/**
 * Which sheet column holds what. Edit the letters here to match the sheet —
 * nothing else needs to change, as long as SETTINGS_RANGE still spans them.
 *
 * A column that is empty (or missing entirely) reads as blank, and the UI
 * hides a link it hasn't got — so pointing one at a not-yet-created column is
 * safe. `statsUrl` is in that state today.
 */
const S = {
  enabled: col("A"), // TRUE/FALSE
  tab: col("B"), // "Q" — also the stage tab's name
  name: col("C"), // "Qualifiers"
  targetSr: col("E"), // "★7.10"
  slotsStart: col("F"), // F..K  NM PS HR DT FM TB (see SETTINGS_SLOT_ORDER)
  mappackUrl: col("X"), // mappack link
  statsUrl: col("Y"), // statistics link — not filled in yet
} as const

/**
 * Physical order of the per-bracket count columns F..K.
 *
 * Every entry must stay even when MOD_BRACKETS doesn't cover it: these are
 * positional offsets, so removing "PS" or "FM" silently shifts each following
 * bracket onto the wrong column. Brackets outside MOD_BRACKETS are read and
 * discarded below rather than omitted here.
 */
const SETTINGS_SLOT_ORDER = ["NM", "PS", "HR", "DT", "FM", "TB"] as const

export type StageSettings = {
  /** Sheet tab name / identifier, e.g. "Q". */
  tab: string
  /** Display name, e.g. "Qualifiers". */
  name: string
  targetSr: number | null
  /** Mappack download. Null until the column exists and is filled in. */
  mappackUrl: string | null
  /** Detailed statistics sheet. Null until the column exists and is filled in. */
  statsUrl: string | null
  /** Expected slot count per bracket, used to sanity-check the parsed pool. */
  slotCounts: Partial<Record<ModBracket, number>>
  expectedMapCount: number | null
}

const cell = (row: string[], i: number): string => (row[i] ?? "").trim()

/** Only accept real links, so a stray note in the column isn't rendered as one. */
const urlOrNull = (raw: string): string | null =>
  /^https?:\/\//i.test(raw) ? raw : null

function numOrNull(raw: string): number | null {
  // Values arrive decorated ("★7.10", "1398x", "283.5"); keep sign/digits.
  const cleaned = raw.replace(/[^0-9.-]/g, "")
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Parse the `Settings` tab, keeping only stages in PUBLISHED_STAGE_TABS.
 *
 * Column A ("TRUE") is the pooler's own enable flag; it is TRUE for every row
 * including the dumps, so it is necessary but not sufficient for visibility.
 */
export function parseStageSettings(values: string[][]): StageSettings[] {
  const allowed = new Set(PUBLISHED_STAGE_TABS.map((t) => t.toUpperCase()))
  const stages: StageSettings[] = []

  // Rows 1-2 are titles, row 3 the header, data starts at row 4 (index 3).
  for (const row of values.slice(3)) {
    const tab = cell(row, S.tab)
    const name = cell(row, S.name)
    if (!tab || !name) continue
    if (cell(row, S.enabled).toUpperCase() !== "TRUE") continue
    if (!allowed.has(tab.toUpperCase())) continue

    const slotCounts: Partial<Record<ModBracket, number>> = {}
    let expected = 0
    SETTINGS_SLOT_ORDER.forEach((bracket, i) => {
      const n = numOrNull(cell(row, S.slotsStart + i))
      if (n == null || n <= 0) return
      // Count every bracket toward the expected total, but only record the
      // ones MOD_BRACKETS knows how to display.
      expected += n
      if (BRACKET_SET.has(bracket)) {
        slotCounts[bracket as ModBracket] = n
      }
    })

    stages.push({
      tab,
      name,
      targetSr: numOrNull(cell(row, S.targetSr)),
      mappackUrl: urlOrNull(cell(row, S.mappackUrl)),
      statsUrl: urlOrNull(cell(row, S.statsUrl)),
      slotCounts,
      expectedMapCount: expected > 0 ? expected : null,
    })
  }

  // Preserve the allowlist's order rather than the sheet's.
  const order = new Map(
    PUBLISHED_STAGE_TABS.map((t, i) => [t.toUpperCase(), i])
  )
  return stages.sort(
    (a, b) =>
      (order.get(a.tab.toUpperCase()) ?? 99) -
      (order.get(b.tab.toUpperCase()) ?? 99)
  )
}

// ---------------------------------------------------------------------------
// Stage tab — the "Mappool Assembly" block
// ---------------------------------------------------------------------------

/**
 * The assembly block spans AU:BN. Row 2 holds its headers and maps start at
 * row 3; reading from AU1 keeps the offsets below aligned to the block.
 */
export const stageRange = (tab: string): string =>
  `${escapeTabName(tab)}!AU1:BN300`

/** A1 notation quotes tab names containing spaces or `/`, escaping `'` as `''`. */
export function escapeTabName(name: string): string {
  return /^[A-Za-z0-9_]+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`
}

// Column offsets relative to column AU (the start of the block).
const P = {
  note: 0, // AU  "Skillset/Notes" — free text, often blank
  mod: 1, // AV  "NM" — bracket only; the number is separate
  slotNumber: 2, // AW  "1"
  mapIdOrUrl: 3, // AX  id or full beatmap URL
  // AY "Banner" is an in-sheet image formula, empty over the values API.
  map: 5, // AZ  "Artist - Title [Difficulty]"
  starRating: 6, // BA  "★7.38"
  bpm: 7, // BB
  drain: 8, // BC  "03:15" drain time (not total length)
  combo: 9, // BD  "1398x"
  cs: 10, // BE
  ar: 11, // BF
  od: 12, // BG
  hp: 13, // BH
  mapId: 14, // BI  resolved numeric id
  pooled: 15, // BJ  "pooled"
} as const

export type MappoolMap = {
  slot: string // "NM1"
  bracket: ModBracket // "NM"
  slotIndex: number // 1
  beatmapId: number
  /** Pooler's free-text note, e.g. "regular nm1 aim". Often blank. */
  note: string | null
  artist: string
  title: string
  difficulty: string
  mapper: string
  /** All stats below are already mod-adjusted by the pooling sheet. */
  starRating: number | null
  bpm: number | null
  /** Drain time in seconds (the sheet tracks drain, not total length). */
  drainSeconds: number | null
  maxCombo: number | null
  cs: number | null
  ar: number | null
  od: number | null
  hp: number | null
  /** Filled by osu! API enrichment; null if the lookup failed or was skipped. */
  beatmapsetId: number | null
  coverUrl: string | null
  listUrl: string | null
}

/** Extract a beatmap id from either a bare id or an osu! URL. */
export function parseBeatmapId(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  // .../beatmapsets/123#osu/456 -> 456 ; .../b/456 -> 456
  const hash = /#\w+\/(\d+)/.exec(trimmed)
  if (hash) return Number(hash[1])
  const path = /\/(?:b|beatmaps)\/(\d+)/.exec(trimmed)
  if (path) return Number(path[1])
  return null
}

/**
 * "Artist - Title [Difficulty]" -> parts.
 *
 * Artist splits on the FIRST " - " (titles routinely contain more). Difficulty
 * is the LAST balanced bracket group, since diff names themselves contain
 * brackets — e.g. "bubbles - F [Extra [4WC26 Edit]]".
 */
export function parseMapTitle(raw: string): {
  artist: string
  title: string
  difficulty: string
} {
  let rest = raw.trim()
  let difficulty = ""

  if (rest.endsWith("]")) {
    // Walk back from the end matching brackets, so nested groups stay whole.
    let depth = 0
    let open = -1
    for (let i = rest.length - 1; i >= 0; i--) {
      if (rest[i] === "]") depth++
      else if (rest[i] === "[") {
        depth--
        if (depth === 0) {
          open = i
          break
        }
      }
    }
    if (open !== -1) {
      difficulty = rest.slice(open + 1, rest.length - 1).trim()
      rest = rest.slice(0, open).trim()
    }
  }

  const sep = rest.indexOf(" - ")
  if (sep === -1) return { artist: "", title: rest, difficulty }
  return {
    artist: rest.slice(0, sep).trim(),
    title: rest.slice(sep + 3).trim(),
    difficulty,
  }
}

/** "03:15" -> 195. Also tolerates "1:02:33" and a bare seconds count. */
export function parseLength(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parts = trimmed.split(":")
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0)
}

/**
 * Parse one stage tab's Mappool Assembly block.
 *
 * Membership is decided by the Mod column (AV) holding a recognised bracket
 * AND the slot number (AW) being present — the block's rows continue past the
 * end of the pool carrying leftover values in other columns.
 */
export function parseStagePool(
  stage: string,
  values: string[][]
): MappoolMap[] {
  const maps: MappoolMap[] = []

  // Row 2 is the header; maps start at row 3 (index 2).
  values.slice(2).forEach((row, i) => {
    const rawMod = cell(row, P.mod)
    const rawNumber = cell(row, P.slotNumber)
    if (!rawMod || !rawNumber) return // past the end of the pool

    const bracket = rawMod.toUpperCase()
    if (!BRACKET_SET.has(bracket)) {
      console.warn(
        `[mappools:${stage}] row ${i + 3}: unrecognised mod "${rawMod}" — skipped`
      )
      return
    }
    const slotIndex = numOrNull(rawNumber)
    if (slotIndex == null || !Number.isInteger(slotIndex)) {
      console.warn(
        `[mappools:${stage}] row ${i + 3}: bad slot number "${rawNumber}" — skipped`
      )
      return
    }

    const beatmapId =
      parseBeatmapId(cell(row, P.mapId)) ??
      parseBeatmapId(cell(row, P.mapIdOrUrl))
    if (beatmapId == null) {
      console.warn(
        `[mappools:${stage}] row ${i + 3}: slot ${bracket}${slotIndex} has no valid beatmap id — skipped`
      )
      return
    }

    const note = cell(row, P.note)
    const { artist, title, difficulty } = parseMapTitle(cell(row, P.map))

    maps.push({
      slot: `${bracket}${slotIndex}`,
      bracket: bracket as ModBracket,
      slotIndex,
      beatmapId,
      note: note || null,
      artist,
      title,
      difficulty,
      mapper: "",
      starRating: numOrNull(cell(row, P.starRating)),
      bpm: numOrNull(cell(row, P.bpm)),
      drainSeconds: parseLength(cell(row, P.drain)),
      maxCombo: numOrNull(cell(row, P.combo)),
      cs: numOrNull(cell(row, P.cs)),
      ar: numOrNull(cell(row, P.ar)),
      od: numOrNull(cell(row, P.od)),
      hp: numOrNull(cell(row, P.hp)),
      beatmapsetId: null,
      coverUrl: null,
      listUrl: null,
    })
  })

  return sortMaps(maps)
}

/** Bracket display order, with TB always last. */
const BRACKET_RANK = new Map<ModBracket, number>(
  MOD_BRACKETS.map((b, i) => [b, b === "TB" ? MOD_BRACKETS.length : i])
)

export function sortMaps(maps: MappoolMap[]): MappoolMap[] {
  return [...maps].sort((a, b) => {
    const rank =
      (BRACKET_RANK.get(a.bracket) ?? 99) - (BRACKET_RANK.get(b.bracket) ?? 99)
    return rank !== 0 ? rank : a.slotIndex - b.slotIndex
  })
}

/** Group a stage's maps into display brackets, preserving sort order. */
export function groupByBracket(
  maps: MappoolMap[]
): Array<{ bracket: ModBracket; maps: MappoolMap[] }> {
  const groups = new Map<ModBracket, MappoolMap[]>()
  for (const map of sortMaps(maps)) {
    const existing = groups.get(map.bracket)
    if (existing) existing.push(map)
    else groups.set(map.bracket, [map])
  }
  return [...groups].map(([bracket, bracketMaps]) => ({
    bracket,
    maps: bracketMaps,
  }))
}

export function formatLength(seconds: number | null): string | null {
  if (seconds == null) return null
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}
