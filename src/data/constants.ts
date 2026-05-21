import type { IngKey, Pool } from "@/types"

export const TOURNAMENT_NAME    = "Monodramatic World Stage"
export const TOURNAMENT_SUBTITLE = "Whisked 2026"
export const CURRENT_ROUND      = "Round of 16"
export const MOCK_USER          = { name: "RefA" }

export const POOL_CONFIG: Record<Pool, { hex: string; ing: IngKey | null; label: string }> = {
  NM: { hex: "#957259", ing: "egg",    label: "NM" },
  HD: { hex: "#b89600", ing: "sugar",  label: "HD" },
  HR: { hex: "#8d3f38", ing: "butter", label: "HR" },
  DT: { hex: "#4e6a7a", ing: "flour",  label: "DT" },
  FM: { hex: "#5f7f63", ing: "milk",   label: "FM" },
  TB: { hex: "#ffffff", ing: null,     label: "TB" },
}

export const INGREDIENTS: { key: IngKey; name: string; pool: string; hex: string }[] = [
  { key: "egg",    name: "Egg",    pool: "NM", hex: "#957259" },
  { key: "sugar",  name: "Sugar",  pool: "HD", hex: "#b89600" },
  { key: "butter", name: "Butter", pool: "HR", hex: "#8d3f38" },
  { key: "flour",  name: "Flour",  pool: "DT", hex: "#4e6a7a" },
  { key: "milk",   name: "Milk",   pool: "FM", hex: "#5f7f63" },
]
