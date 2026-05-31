import type { HomeMod, IngKey, Pool } from "@/types"

export const TOURNAMENT_NAME    = "Monodramatic World Stage"
export const TOURNAMENT_SUBTITLE = "Whisked 2026"
export const CURRENT_ROUND      = "Round of 16"
export const MOCK_USER          = { name: "RefA" }

export const POOL_CONFIG: Record<Pool, { hex: string; ing: IngKey | null; label: string }> = {
  NM: { hex: "#89bfd4", ing: "egg",    label: "NM" },
  PS: { hex: "#b89600", ing: "sugar",  label: "PS" },
  HR: { hex: "#8d3f38", ing: "butter", label: "HR" },
  DT: { hex: "#4e6a7a", ing: "flour",  label: "DT" },
  FM: { hex: "#5f7f63", ing: "milk",   label: "FM" },
  TB: { hex: "#ffffff", ing: null,     label: "TB" },
}

export const INGREDIENTS: { key: IngKey; name: string; pool: string; hex: string; icon: string }[] = [
  { key: "egg",    name: "Egg",    pool: "NM", hex: "#957259", icon: "eggs"   },
  { key: "sugar",  name: "Sugar",  pool: "PS", hex: "#b89600", icon: "sugar"  },
  { key: "butter", name: "Butter", pool: "HR", hex: "#8d3f38", icon: "butter" },
  { key: "flour",  name: "Flour",  pool: "DT", hex: "#4e6a7a", icon: "flour"  },
  { key: "milk",   name: "Milk",   pool: "FM", hex: "#5f7f63", icon: "milk"   },
]

export const HOME_MODS: { key: HomeMod; label: string; ingredient: IngKey; hex: string }[] = [
  { key: "NM", label: "NM", ingredient: "egg",    hex: POOL_CONFIG.NM.hex },
  { key: "PS", label: "PS", ingredient: "sugar",  hex: POOL_CONFIG.PS.hex },
  { key: "HR", label: "HR", ingredient: "butter", hex: POOL_CONFIG.HR.hex },
  { key: "DT", label: "DT", ingredient: "flour",  hex: POOL_CONFIG.DT.hex },
  { key: "FM", label: "FM", ingredient: "milk",   hex: POOL_CONFIG.FM.hex },
]
