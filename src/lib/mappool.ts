import type { CSSProperties } from "react"
import type { IngKey, Inventory, MatchStatus, PoolMap, Recipe } from "@/types"
import { POOL_CONFIG } from "@/data/constants"

export function canAfford(recipe: Recipe, inv: Inventory): boolean {
  return (Object.entries(recipe.cost) as [IngKey, number][]).every(
    ([k, n]) => (inv[k] ?? 0) >= n
  )
}

export function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

export function rowStyle(map: PoolMap): CSSProperties {
  const { hex } = POOL_CONFIG[map.pool]
  const [r, g, b] = hexToRgb(hex)

  if (map.status === "banned") {
    return { backgroundColor: "rgba(49,37,37,0.04)", borderLeft: "3px solid rgba(99,72,50,0.2)", opacity: 0.6 }
  }
  if (map.status === "in-progress") {
    return { backgroundColor: `rgba(${r},${g},${b},0.2)`, borderLeft: `3px solid ${hex}` }
  }
  if (map.status === "completed") {
    return { backgroundColor: `rgba(${r},${g},${b},0.12)`, borderLeft: `3px solid rgba(${r},${g},${b},0.55)` }
  }
  return { backgroundColor: "transparent", borderLeft: "3px solid rgba(99,72,50,0.14)" }
}

export function statusVariant(s: string): "default" | "secondary" | "outline" {
  if (s === "live")     return "default"
  if (s === "upcoming") return "secondary"
  return "outline"
}

export function isTerminalMatchStatus(status: MatchStatus): boolean {
  return status === "completed" || status === "forfeit"
}
