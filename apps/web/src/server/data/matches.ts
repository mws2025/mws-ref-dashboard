import type { SheetTable } from "./rows"
import { matchMetaSchema, type Match, type MapScore } from "./schemas"

// Score column convention (documented — adjust here if your headers differ):
//   "P1 1", "P2 1", "P1 2", "P2 2", ...  (player, map number)
// Also accepts "P1-1", "P1 Map 1". Trailing token must be digits, so
// metadata like "P1 Seed" is NOT captured as a score.
const SCORE_HEADER = /^\s*p\s*([12])\s*[-_ ]?\s*(?:map\s*)?(\d+)\s*$/i

type ScoreColumn = { player: 1 | 2; map: number; key: string }

function scoreColumns(table: SheetTable): ScoreColumn[] {
  const cols: ScoreColumn[] = []
  table.headers.forEach((header, i) => {
    const m = SCORE_HEADER.exec(header)
    if (m) {
      cols.push({
        player: Number(m[1]) as 1 | 2,
        map: Number(m[2]),
        key: table.keys[i],
      })
    }
  })
  return cols
}

function parseScore(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null
  const n = Number(raw.replace(/[, ]/g, ""))
  return Number.isFinite(n) ? n : null
}

/** Parse match rows including variable-width (Bo9/11/13) per-map scores. */
export function parseMatches(table: SheetTable): Match[] {
  const cols = scoreColumns(table)
  const mapNumbers = [...new Set(cols.map((c) => c.map))].sort((a, b) => a - b)

  const matches: Match[] = []
  table.records.forEach((record, i) => {
    const meta = matchMetaSchema.safeParse(record)
    if (!meta.success) {
      console.warn(`[sheets:matches] skipped row ${i + 2}:`, meta.error.issues)
      return
    }

    const scores: MapScore[] = []
    let p1Wins = 0
    let p2Wins = 0
    for (const map of mapNumbers) {
      const p1Key = cols.find((c) => c.map === map && c.player === 1)?.key
      const p2Key = cols.find((c) => c.map === map && c.player === 2)?.key
      const p1 = parseScore(p1Key ? record[p1Key] : undefined)
      const p2 = parseScore(p2Key ? record[p2Key] : undefined)
      if (p1 == null && p2 == null) continue // map not played yet
      if (p1 != null && p2 != null) {
        if (p1 > p2) p1Wins++
        else if (p2 > p1) p2Wins++
      }
      scores.push({ map, p1, p2 })
    }

    matches.push({ ...meta.data, scores, p1Wins, p2Wins })
  })
  return matches
}
