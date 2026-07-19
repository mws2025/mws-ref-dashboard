import type { z } from "zod"

// "Country Code" -> "countryCode", "Match URL" -> "matchUrl", "BPM" -> "bpm"
export function toKey(header: string): string {
  const words = header
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
  return words
    .map((w, i) => {
      const lower = w.toLowerCase()
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join("")
}

export type SheetTable = {
  headers: string[] // original header row
  keys: string[] // normalized keys, index-aligned with headers
  records: Record<string, string>[] // one per data row, keyed by normalized key
}

/** Turn a raw cell grid (row 0 = headers) into keyed records. */
export function toTable(values: string[][]): SheetTable {
  if (values.length === 0) return { headers: [], keys: [], records: [] }
  const headers = values[0]
  const keys = headers.map(toKey)
  const records = values.slice(1).map((row) => {
    const record: Record<string, string> = {}
    keys.forEach((key, i) => {
      if (key) record[key] = (row[i] ?? "").trim()
    })
    return record
  })
  return { headers, keys, records }
}

/**
 * Parse each record with `schema`, dropping (and warning about) rows that
 * fail so one TO typo can't 500 the whole page.
 */
export function parseRows<T>(
  entity: string,
  records: Record<string, string>[],
  schema: z.ZodType<T>
): T[] {
  const out: T[] = []
  records.forEach((record, i) => {
    const result = schema.safeParse(record)
    if (result.success) {
      out.push(result.data)
    } else {
      // row 1 is headers, data starts at sheet row 2
      console.warn(
        `[sheets:${entity}] skipped row ${i + 2}:`,
        result.error.issues
      )
    }
  })
  return out
}
