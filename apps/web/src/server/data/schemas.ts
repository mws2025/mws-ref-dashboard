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

// A free-text sheet cell that is meant to be a link. Anything that isn't an
// http(s) URL becomes null so the UI can fall back instead of rendering a
// broken href — this also stops `javascript:`/`data:` values in the sheet from
// reaching an anchor tag. A scheme-less "example.com/foo" is assumed https.
const optUrl = optStr.transform((v) => {
  if (!v) return null
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (!url.hostname.includes(".")) return null
  return url.toString()
})

// osu! id cell. A blank cell is legitimate — some staff have no osu! account
// linked — so it parses to null instead of failing the row. The UI then falls
// back to the discord handle for the name and to public/staff-icons for the
// avatar. Anything non-numeric is still a hard error, so a typo'd id surfaces
// as a skipped row rather than silently becoming "no account".
const optId = z
  .string()
  .trim()
  .transform((v) => (v.length ? Number(v) : null))
  .refine((v) => v === null || (Number.isInteger(v) && v > 0), {
    message: "expected a positive integer osu! id, or a blank cell",
  })

export const staffSchema = z.object({
  timestamp: z.string(),
  id: optId,
  discord: z.string().trim(),
  pronoun1: z.string().trim(),
  pronoun2: z.string().trim(),
  roles: csv,
  customLink: optUrl, // invalid → null; falls back to osu! profile in UI
  experience: z.string().trim(),
  timezone: z.string().trim().default(""),
  approved: sheetBoolean.default(false), // admin-only column, gates staff page visibility

  // username: z.string().trim(),
  // countryCode: z.string().trim().toUpperCase(),
  // customImage: optStr,
})
export type StaffRow = z.infer<typeof staffSchema>

export type Staff = StaffRow & {
  /** osu! username, or the discord handle when no osu! id is linked. */
  username: string
  /** null when there's no osu! account to source a country from. */
  countryCode: string | null
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

// Mappool types live in ./mappools.ts — that sheet is read positionally
// (merged header cells) rather than through the header-keyed zod path here.
import type { MappoolMap, StageSettings } from "./mappools"

export type { MappoolMap, ModBracket, StageSettings } from "./mappools"
export { MOD_BRACKETS } from "./mappools"

/** A published stage plus its parsed pool. */
export type MappoolStage = StageSettings & {
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
