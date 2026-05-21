export type Pool = "NM" | "HD" | "HR" | "DT" | "FM" | "TB"
export type MapStatus = "available" | "picked" | "banned" | "in-progress" | "completed"
export type MatchStatus = "scheduled" | "upcoming" | "live" | "completed" | "forfeit"
export type IngKey = "egg" | "sugar" | "butter" | "flour" | "milk"
export type Inventory = Record<IngKey, number>

export interface PoolMap {
  slot: string
  pool: Pool
  map: string
  bpm: number
  ar: number
  cs: number
  status: MapStatus
  pickedBy?: string
  bannedBy?: string
  winner?: string
}

export interface Recipe {
  id: number
  name: string
  desc: string
  cost: Partial<Inventory>
  timing: string
}

export interface Match {
  id: string
  round: string
  playerA: string
  playerB: string
  date: string
  time: string
  status: MatchStatus
  lobbyUrl?: string
  winner?: string
  currentMap?: string
  notes?: string
  referee?: string
}

export interface IrcEntry {
  time: string
  sender: string
  ref?: string
  msg: string
  type: "bancho" | "player" | "ref"
}
