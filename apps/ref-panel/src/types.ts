export type Pool = "NM" | "HD" | "HR" | "DT" | "FM" | "TB" | "PS"
export type MapStatus = "available" | "picked" | "banned" | "protected" | "in-progress" | "completed"
export type MatchStatus = "scheduled" | "upcoming" | "live" | "completed" | "forfeit"
export type IngKey = "egg" | "sugar" | "butter" | "flour" | "milk"
export type Inventory = Record<IngKey, number>
export type HomeMod = "NM" | "HD" | "HR" | "DT" | "FM"
export type MatchFlowPhase =
  | "lobby"
  | "roll"
  | "order"
  | "home_mod"
  | "ban"
  | "craft"
  | "play"
  | "ready_result"
  | "completed"

export interface PoolMap {
  slot: string
  pool: Pool
  map: string
  beatmapId?: string
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

export interface MatchFlowState {
  matchId: string
  phase: MatchFlowPhase
  rollA?: number
  rollB?: number
  rollWinner?: string
  firstPicker?: string
  firstBanner?: string
  turnPlayer?: string
  homeModA?: HomeMod
  homeModB?: HomeMod
  currentSlot?: string
  updatedAt?: string
}

export interface Match {
  id: string
  round: string
  mappool?: string
  playerA: string
  playerB: string
  playerAOsuId?: string
  playerBOsuId?: string
  date: string
  time: string
  status: MatchStatus
  scoreA?: number
  scoreB?: number
  bestOf?: number
  lobbyUrl?: string
  winner?: string
  currentMap?: string
  notes?: string
  referee?: string
  streamer?: string
}

export interface IrcEntry {
  time: string
  sender: string
  ref?: string
  msg: string
  type: "bancho" | "player" | "ref"
}
