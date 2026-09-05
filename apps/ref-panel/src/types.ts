export type Pool = "NM" | "PS" | "HR" | "DT" | "FM" | "TB" | "WC"
export type MapStatus = "available" | "picked" | "banned" | "protected" | "in-progress" | "completed"
export type MatchStatus = "scheduled" | "upcoming" | "live" | "completed" | "forfeit"
export type IngKey = "egg" | "sugar" | "butter" | "flour" | "milk"
export type Inventory = Record<IngKey, number>
export type RecipeEventStatus = "active" | "resolved" | "reverted"
export type RecipeInputKind = "mod" | "mods_both" | "protect_map" | "unban_map" | "ingredient"
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
}

export interface ScoreSubmissionDetails {
  usesHdA: boolean
  usesHdB: boolean
  missCountA?: number
  missCountB?: number
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
  scoreOverridden?: boolean
  testBinding?: TestMpBinding
  updatedAt?: string
}

export interface TestExpectedSetup {
  slot: string
  beatmapId: number
  lobbyMods: string
  playerAMods: string[]
  playerBMods: string[]
  scoringType: string
  winCondition: "score" | "accuracy"
}

export interface TestMpBinding {
  mpId: number
  mode: "replay" | "live"
  playerAOsuId: number
  playerBOsuId: number
  lastEventId: number
  lastGameId: number
  boundAt: string
  expected?: TestExpectedSetup
}

export interface TestMpUser {
  id: number
  username: string
}

export interface TestMpProbe {
  mpId: number
  name: string
  users: TestMpUser[]
  games: Array<{
    eventId: number
    id: number
    beatmapId: number
    endedAt: string | null
    scoringType: string
    mods: string[]
    scoreCount: number
  }>
}

export interface TestMpResult {
  pending: boolean
  message?: string
  canApply?: boolean
  slot?: string
  mpId?: number
  game?: {
    id: number
    beatmapId: number
    endedAt: string | null
    mods: string[]
    scoringType: string
  }
  checks?: Array<{
    key: string
    label: string
    ok: boolean
    expected: string
    actual: string
  }>
  values?: {
    scoreA: number | null
    scoreB: number | null
    accuracyMode: boolean
    usesHdA: boolean
    usesHdB: boolean
    missCountA: number | null
    missCountB: number | null
    missCountMode: boolean
  }
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
