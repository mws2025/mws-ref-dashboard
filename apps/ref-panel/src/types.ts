export type Pool = "NM" | "PS" | "HR" | "DT" | "FM" | "TB"
export type MapStatus = "available" | "picked" | "banned" | "protected" | "in-progress" | "completed"
export type MatchStatus = "scheduled" | "upcoming" | "live" | "completed" | "forfeit"
export type IngKey = "egg" | "sugar" | "butter" | "flour" | "milk"
export type Inventory = Record<IngKey, number>
export type RecipeEventStatus = "active" | "resolved" | "reverted"
export type RecipeInputKind = "mod" | "mods_both" | "protect_map" | "unban_map" | "ingredient" | "reward_ingredients"
export type HomeMod = "NM" | "PS" | "HR" | "DT" | "FM"
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
  effectType: string
  inputs?: RecipeInputKind[]
}

export interface RecipeActivation {
  mod?: string
  modA?: string
  modB?: string
  targetSlot?: string
  ingredient?: IngKey
  rewardIngredients?: [IngKey, IngKey]
}

export interface RecipeEvent {
  id: string
  player: string
  recipeId: number
  target?: string
  payload: Record<string, unknown>
  status: RecipeEventStatus
  createdAt: string
  activatedAt?: string
  resolvedAt?: string
  resolution?: Record<string, unknown>
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
