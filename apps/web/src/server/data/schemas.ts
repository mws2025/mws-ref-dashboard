import { z } from "zod"

// schemas for the raw rows as they exist in the sheet, some data is enriched

// Cells arrive as strings. These coercions tolerate blank cells and
// spreadsheet formatting; a row that fails is dropped + warned, not fatal.
const num = z.coerce.number()
// like `num`, but blank/non-numeric cells fall back to 0 instead of failing the row
const numOrZero = z.coerce.number().catch(0)
const optStr = z
  .string()
  .trim()
  .transform((s) => (s.length ? s : null))
  .nullable()

// comma-separated cell → string[]
const csv = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
  )

// "TRUE" / "FALSE" cell → boolean. Not z.coerce.boolean(): that coerces via
// JS `Boolean(str)`, which is true for ANY non-empty string — "FALSE" would
// parse as `true`.
const sheetBoolean = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase() === "TRUE")

export const staffSchema = z.object({
  timestamp: z.string(),
  id: num,
  discord: z.string().trim(),
  pronoun1: z.string().trim(),
  pronoun2: z.string().trim(),
  roles: csv,
  customLink: optStr, // falls back to osu! profile in UI
  experience: z.string().trim(),
  timezone: z.string().trim().default(""),
  approved: sheetBoolean.default(false), // admin-only column, gates staff page visibility

  // username: z.string().trim(),
  // countryCode: z.string().trim().toUpperCase(),
  // customImage: optStr,
})
export type StaffRow = z.infer<typeof staffSchema>

export type Staff = StaffRow & {
  username: string
  countryCode: string
  pronouns: string | null
}

// rank, username, and country are enriched via osu! api
export const playerRowSchema = z.object({
  timestamp: z.string(),
  id: num,
  discord: z.string().trim(),
  badges: numOrZero,
  timezone: z.string().trim(),
  pronoun1: z.string().trim(),
  pronoun2: z.string().trim(),
  joinedDiscord: z.coerce.boolean(),

  // username: z.string().trim(),
  // countryCode: z.string().trim().toUpperCase(),
})
export type PlayerRow = z.infer<typeof playerRowSchema>

// Player after osu! API enrichment
export type Player = PlayerRow & {
  rank: number | null // live global rank from osu! API
  bws: number | null // badge-weighted seed (computeBws)
  username: string
  countryCode: string
  pronouns: string | null
}

// TODO
export const mappoolMapSchema = z.object({
  slot: z.string().trim(), // NM1, HD2, DT3, ...
  beatmapId: num,
  difficulty: z.string().trim().default(""), // difficulty/diff name
  mapper: z.string().trim().default(""),
  starRating: z.coerce.number().nullable().catch(null),
  bpm: z.coerce.number().nullable().catch(null),
  isOriginal: z.coerce.boolean().catch(false),
  isCustom: z.coerce.boolean().catch(false),
})
export type MappoolMap = z.infer<typeof mappoolMapSchema>

export type StageMappool = {
  stage: string
  maps: MappoolMap[]
}

// Per-map result for a single map in a match (both players' scores)
export type MapScore = {
  map: number // 1-indexed map order within the match
  p1: number | null
  p2: number | null
}

// TODO
// Metadata for a match row (scores are parsed separately, see matches.ts)
export const matchMetaSchema = z.object({
  matchId: z.string().trim(),
  stage: z.string().trim(), // "Round of 32", ...
  date: z.string().trim().default(""),
  time: z.string().trim().default(""), // UTC
  matchUrl: optStr, // osu! mp link
  referee: optStr,
  streamer: optStr,
  commentators: csv,
  p1: z.string().trim(), // username
  p2: z.string().trim(),
  p1Seed: optStr,
  p2Seed: optStr,
})
export type MatchMeta = z.infer<typeof matchMetaSchema>

export type Match = MatchMeta & {
  scores: MapScore[]
  p1Wins: number
  p2Wins: number
}
