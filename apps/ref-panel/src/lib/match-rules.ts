import type { MapWinCondition } from "../types"

export type { MapWinCondition } from "../types"

export type RollAnnouncement = {
  player: string
  value: number
}

export type FinishedScoreAnnouncement = {
  player: string
  score: number
}

export const MAX_MATCH_BANS = 4
export const HD_SCORE_MULTIPLIER = 1.06

const TOURNAMENT_ROUND_RANKS = new Map<string, number>([
  ["ro32", 0],
  ["round32", 0],
  ["roundof32", 0],
  ["ro16", 1],
  ["round16", 1],
  ["roundof16", 1],
  ["qf", 2],
  ["quarterfinal", 2],
  ["quarterfinals", 2],
  ["sf", 3],
  ["semifinal", 3],
  ["semifinals", 3],
  ["final", 4],
  ["finals", 4],
  ["gf", 5],
  ["grandfinal", 5],
  ["grandfinals", 5],
])

export function tournamentRoundRank(round: string): number | null {
  const normalized = round.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
  return TOURNAMENT_ROUND_RANKS.get(normalized) ?? null
}

export function latestRoundScheduleMatches<T extends { round: string }>(matches: readonly T[]): T[] {
  const latestRank = matches.reduce((highest, match) => {
    const rank = tournamentRoundRank(match.round)
    return rank === null ? highest : Math.max(highest, rank)
  }, -1)
  if (latestRank < 0) return [...matches]
  return matches.filter((match) => tournamentRoundRank(match.round) === latestRank)
}

type PotentialScheduleMatch = {
  id: string
  playerA: string
  playerB: string
  date: string
  time: string
  referee?: string
}

export type ResolvedScheduleMatch<T extends PotentialScheduleMatch> = T & {
  refereeSourceId?: string
}

function potentialMatchParts(id: string): { baseId: string; suffix: string } | null {
  const match = id.trim().match(/^(\d+)([a-d])$/i)
  return match ? { baseId: match[1], suffix: match[2].toLowerCase() } : null
}

function normalizedPlayer(value: string): string {
  return value.trim().toLowerCase()
}

function isFinalizedPlayer(value: string): boolean {
  const normalized = normalizedPlayer(value)
  return Boolean(normalized) &&
    !["-", "tbd", "unknown", "n/a"].includes(normalized) &&
    !/^(winner|loser)\b/.test(normalized)
}

function sameMatchup(left: PotentialScheduleMatch, right: PotentialScheduleMatch): boolean {
  if (
    !isFinalizedPlayer(left.playerA) || !isFinalizedPlayer(left.playerB) ||
    !isFinalizedPlayer(right.playerA) || !isFinalizedPlayer(right.playerB)
  ) return false

  const leftPlayers = [normalizedPlayer(left.playerA), normalizedPlayer(left.playerB)].sort()
  const rightPlayers = [normalizedPlayer(right.playerA), normalizedPlayer(right.playerB)].sort()
  return leftPlayers[0] === rightPlayers[0] && leftPlayers[1] === rightPlayers[1]
}

function selectedPotentialMatch<T extends PotentialScheduleMatch>(base: T, candidates: readonly T[]): T | null {
  const matching = candidates.filter((candidate) => sameMatchup(base, candidate))
  if (matching.length === 0) return null

  return [...matching].sort((left, right) => {
    const score = (candidate: T): number =>
      (candidate.date.trim() === base.date.trim() ? 4 : 0) +
      (candidate.time.trim() === base.time.trim() ? 2 : 0) +
      (candidate.referee?.trim() ? 1 : 0)
    return score(right) - score(left) || left.id.localeCompare(right.id, undefined, { numeric: true })
  })[0]
}

/**
 * Potential lower-bracket schedules use IDs such as 41a-41d. Until the numeric
 * row has a finalized matchup, expose those candidates for referee signup.
 * Once finalized, expose only the numeric row and inherit the selected
 * candidate's referee assignment.
 */
export function resolvePotentialScheduleMatches<T extends PotentialScheduleMatch>(
  matches: readonly T[],
): Array<ResolvedScheduleMatch<T>> {
  const bases = new Map(matches.filter((match) => !potentialMatchParts(match.id)).map((match) => [match.id.trim(), match]))
  const candidatesByBase = new Map<string, T[]>()
  for (const match of matches) {
    const potential = potentialMatchParts(match.id)
    if (!potential) continue
    const candidates = candidatesByBase.get(potential.baseId) ?? []
    candidates.push(match)
    candidatesByBase.set(potential.baseId, candidates)
  }

  const selectedByBase = new Map<string, T | null>()
  for (const [baseId, candidates] of candidatesByBase) {
    const base = bases.get(baseId)
    selectedByBase.set(baseId, base ? selectedPotentialMatch(base, candidates) : null)
  }

  const resolved: Array<ResolvedScheduleMatch<T>> = []
  for (const match of matches) {
    const potential = potentialMatchParts(match.id)
    if (potential) {
      if (!bases.has(potential.baseId) || !selectedByBase.get(potential.baseId)) resolved.push({ ...match })
      continue
    }

    const candidates = candidatesByBase.get(match.id.trim())
    if (!candidates) {
      resolved.push({ ...match })
      continue
    }

    const selected = selectedByBase.get(match.id.trim())
    if (!selected) continue
    resolved.push({
      ...match,
      referee: selected.referee?.trim() || match.referee,
      refereeSourceId: selected.id,
    })
  }
  return resolved
}

export function baseBanLimitForRound(round: string): number {
  const normalized = round.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
  return ["ro32", "round32", "roundof32", "ro16", "round16", "roundof16"].includes(normalized)
    ? 2
    : MAX_MATCH_BANS
}

export function effectiveBanLimitForRound(round: string, hasExtraBan = false): number {
  return Math.min(MAX_MATCH_BANS, baseBanLimitForRound(round) + (hasExtraBan ? 1 : 0))
}

export function isBanLimitReached(currentBans: number, limit = MAX_MATCH_BANS): boolean {
  return currentBans >= limit
}

export function refereeAssignments(value?: string): string[] {
  return (value ?? "")
    .split(/[,;|]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function refereeIsAssigned(value: string | undefined, username: string): boolean {
  const normalizedUsername = username.trim().toLowerCase()
  return Boolean(normalizedUsername) && refereeAssignments(value).some(
    (entry) => entry.toLowerCase() === normalizedUsername,
  )
}

export function resolveLobbyReferees(
  value: string | undefined,
  operator: string,
  operatorIsAdmin: boolean,
): { referee: string; usernames: string[]; adminTookOver: boolean } {
  const originalReferee = value?.trim() ?? ""
  const assigned = refereeAssignments(originalReferee)
  if (assigned.length > 0 && !refereeIsAssigned(originalReferee, operator) && operatorIsAdmin) {
    return { referee: operator, usernames: [operator], adminTookOver: true }
  }
  if (!refereeIsAssigned(originalReferee, operator)) assigned.push(operator)
  return { referee: originalReferee, usernames: assigned, adminTookOver: false }
}

export function canClaimRefereeAssignment(value: string | undefined, username: string): boolean {
  const assigned = refereeAssignments(value)
  return assigned.length === 0 || refereeIsAssigned(value, username)
}

export function formatScheduleTimeInput(value: string): string {
  const cleaned = value.replace(/[^\d:]/g, "")
  if (cleaned.includes(":")) {
    const [hours = "", minutes = ""] = cleaned.split(":")
    return `${hours.slice(0, 2)}:${minutes.replace(/:/g, "").slice(0, 2)}`
  }
  const digits = cleaned.slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
}

export function normalizeScheduleTime(value: string): string | null {
  const match = formatScheduleTimeInput(value).match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

export function isValidScheduleDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function scheduleDateSerial(value: string): number | null {
  if (!isValidScheduleDate(value)) return null
  const [year, month, day] = value.split("-").map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000 + 25_569
}

export type ScheduleDateTimeDisplay = {
  date: string
  time: string
}

export type MatchResultMapEntry = {
  slot: string
  status: string
  pickedBy?: string
  bannedBy?: string
  winner?: string
}

export type MatchResultRecipeEntry = {
  player: string
  name: string
  target?: string
  details?: string
}

export type MatchResultSections = {
  bans: string
  homeMods: string
  rundown: string
  recipes: string
}

export function formatMatchResultTitle(round: string, matchId: string): string {
  const normalizedRound = round.trim()
  return `${normalizedRound ? `${normalizedRound} - ` : ""}Match ${matchId.trim()}`
}

export function formatForfeitResultDescription(
  playerA: string,
  playerB: string,
  scoreA: number,
  scoreB: number,
  winner: string,
): string {
  const winnerIsA = winner.trim().toLowerCase() === playerA.trim().toLowerCase()
  const scoreLine = winnerIsA
    ? `### 🏆 🔴 **${playerA}**  \`${scoreA}\` - \`${scoreB}\`  **${playerB}** 🔵`
    : `### 🔴 **${playerA}**  \`${scoreA}\` - \`${scoreB}\`  **${playerB}** 🔵 🏆`
  return `${scoreLine}\n\n**${winner} wins by default.**`
}

export function formatMatchResultSections(
  playerA: string,
  playerB: string,
  homeModA: string | undefined,
  homeModB: string | undefined,
  maps: readonly MatchResultMapEntry[],
  recipes: readonly MatchResultRecipeEntry[],
): MatchResultSections {
  const red = "🔴"
  const blue = "🔵"
  const emojiFor = (player: string | undefined): string => {
    const normalized = player?.trim().toLowerCase()
    if (normalized === playerA.trim().toLowerCase()) return red
    if (normalized === playerB.trim().toLowerCase()) return blue
    return "⚪"
  }

  const bansByPlayer = new Map<string, string[]>([[red, []], [blue, []]])
  for (const map of maps) {
    if (map.status.toLowerCase() !== "banned" || !map.slot || !map.bannedBy) continue
    const emoji = emojiFor(map.bannedBy)
    bansByPlayer.get(emoji)?.push(`\`${map.slot}\``)
  }
  const bans = [...bansByPlayer.entries()]
    .filter(([, slots]) => slots.length > 0)
    .map(([emoji, slots]) => `${emoji} bans ${slots.join(", ")}`)
    .join("\n") || "None"

  const homeMods = [
    `${red} \`${homeModA || "Not selected"}\``,
    `${blue} \`${homeModB || "Not selected"}\``,
  ].join("\n")

  const rundown = maps
    .filter((map) => map.status.toLowerCase() === "completed")
    .map((map) => `${emojiFor(map.pickedBy)} picks \`${map.slot}\` - ${emojiFor(map.winner)} wins!`)
    .join("\n") || "None"

  const recipeLines = recipes
    .filter((recipe) => recipe.name)
    .map((recipe) => {
      const target = recipe.target ? ` \`${recipe.target}\`` : ""
      const details = recipe.details ? ` - ${recipe.details}` : ""
      return `${emojiFor(recipe.player)} ${recipe.name}${target}${details}`
    })

  return {
    bans,
    homeMods,
    rundown,
    recipes: recipeLines.join("\n") || "None",
  }
}

function scheduleDateParts(value: string): [number, number, number] | null {
  const isoMatch = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return [Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])]
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return [parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()]
}

export function formatScheduleDateTime(
  dateValue: string,
  timeValue: string,
  timeZone: string,
): ScheduleDateTimeDisplay | null {
  const dateParts = scheduleDateParts(dateValue)
  const timeMatch = timeValue.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!dateParts || !timeMatch) return null

  const [year, month, day] = dateParts
  const hours = Number(timeMatch[1])
  const minutes = Number(timeMatch[2])
  if (hours > 23 || minutes > 59) return null

  const instant = new Date(Date.UTC(year, month - 1, day, hours, minutes))
  try {
    const weekday = instant.toLocaleDateString("en-US", { timeZone, weekday: "short" })
    const monthName = instant.toLocaleDateString("en-US", { timeZone, month: "short" })
    const localDay = instant.toLocaleDateString("en-US", { timeZone, day: "numeric" })
    const time = instant.toLocaleTimeString("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
    return { date: `(${weekday}) ${monthName} ${localDay}`, time }
  } catch {
    return null
  }
}

export function parseRollAnnouncement(message: string): RollAnnouncement | null {
  const match = message.trim().match(/^(.+?)\s+(?:rolls|rolled)\s+(\d+)\s+point\(s\)\.?$/i)
  if (!match) return null

  const player = match[1]?.trim() ?? ""
  const value = Number(match[2])
  return player && isValidRoll(value) ? { player, value } : null
}

export function isValidRoll(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 100
}

export function parseFinishedScoreAnnouncement(message: string): FinishedScoreAnnouncement | null {
  const match = message.trim().match(/^(.+?) finished playing \(Score:\s*([\d,]+),/i)
  if (!match) return null

  const player = match[1]?.trim() ?? ""
  const score = Number((match[2] ?? "").replace(/,/g, ""))
  return player && Number.isFinite(score) && score >= 0 ? { player, score } : null
}

export function isTiebreakerReady(scoreA: number, scoreB: number, bestOf: number): boolean {
  const winsNeeded = Math.ceil(bestOf / 2)
  return scoreA === winsNeeded - 1 && scoreB === winsNeeded - 1
}

export function formatLobbyMods(mods: readonly string[], enforceNF: boolean): string {
  const tokens = mods
    .flatMap((mod) => mod.trim().split(/\s+/))
    .map((mod) => mod.toUpperCase() === "FREEMOD" ? "Freemod" : mod.toUpperCase())
    .filter((mod) => mod && mod !== "NONE" && mod !== "NF")

  const unique = [...new Set(tokens)]
  if (enforceNF) unique.push("NF")
  return unique.join(" ") || "None"
}

export function lobbyModsForPool(pool: string, enforceNF: boolean): string {
  return pool.trim().toUpperCase() === "DT"
    ? formatLobbyMods(["DT", "Freemod"], enforceNF)
    : formatLobbyMods(["Freemod"], enforceNF)
}

export function parseMappoolMods(value: string): string[] {
  return value.trim()
    .split(/[,/|+\s]+/)
    .map((mod) => mod.trim().toUpperCase())
    .filter(Boolean)
}

export function caramelLobbyMods(value: string, enforceNF: boolean): string | null {
  const normalized = value.trim().toLowerCase().replace(/[\s+]+/g, "-")
  const modsBySheetValue: Record<string, string[]> = {
    "": [],
    none: [],
    easy: ["EZ"],
    hard_rock: ["HR"],
    "hard-rock": ["HR"],
    double_time: ["DT"],
    "double-time": ["DT"],
    "easy-double_time": ["EZ", "DT"],
    "easy-double-time": ["EZ", "DT"],
    autopilot: ["AP"],
  }
  const mods = modsBySheetValue[normalized]
  return mods ? formatLobbyMods([...mods, "Freemod"], enforceNF) : null
}

export function parseMapWinCondition(value: string): MapWinCondition | null {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
  if (!normalized || normalized === "v2" || normalized === "score" || normalized === "scorev2") return "score"
  if (normalized === "acc" || normalized === "accuracy") return "accuracy"
  if (normalized === "miss" || normalized === "misscount") return "miss"
  if (normalized === "combo" || normalized === "maxcombo") return "combo"
  return null
}

export function formatRefereeIrcMessage(username: string, message: string): string {
  const trimmed = message.trim()
  return trimmed.startsWith("!") ? trimmed : `<${username.trim() || "Referee"}> ${trimmed}`
}

export function addLobbyMod(base: string, mod: string, enforceNF: boolean): string {
  const baseMods = base.trim().split(/\s+/).filter(Boolean)
  if (baseMods.some((candidate) => candidate.toLowerCase() === "freemod")) {
    return formatLobbyMods(["Freemod"], enforceNF)
  }
  return formatLobbyMods([...baseMods, mod], enforceNF)
}

export function nextPlayerAfterPick(pickedBy: string | undefined, playerA: string, playerB: string): string | undefined {
  const picker = pickedBy?.trim().toLowerCase()
  if (!picker) return undefined
  if (picker === playerA.trim().toLowerCase()) return playerB
  if (picker === playerB.trim().toLowerCase()) return playerA
  return undefined
}

export function parseScoreValue(value: string | number): number | null {
  const cleaned = typeof value === "string" ? value.trim().replace(/,/g, "").replace(/%$/, "").trim() : null
  if (cleaned === "") return null
  const normalized = typeof value === "number" ? value : Number(cleaned)
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null
}

export function normalizeHdScore(score: number, usesHd: boolean): number {
  return usesHd ? Math.round(score / HD_SCORE_MULTIPLIER) : score
}

export type OsuScoreReportGame = {
  beatmapId: number
  endedAt?: string | null
  scores: Array<{
    userId: number
    score: number
    accuracy?: number | null
    misses?: number | null
    maxCombo?: number | null
    mods: readonly string[]
  }>
}

export type DetectedOsuMapResult = {
  scoreA: number
  scoreB: number
  accuracyA: number | null
  accuracyB: number | null
  missCountA: number | null
  missCountB: number | null
  comboA: number | null
  comboB: number | null
  usesHdA: boolean
  usesHdB: boolean
}

export function mapResultFromScoreReport(
  games: readonly OsuScoreReportGame[],
  beatmapId: number,
  playerAOsuId: number,
  playerBOsuId: number,
  scoreA: number,
  scoreB: number,
): DetectedOsuMapResult | null {
  for (let index = games.length - 1; index >= 0; index -= 1) {
    const candidate = games[index]
    if (!candidate?.endedAt || candidate.beatmapId !== beatmapId) continue
    const playerA = candidate.scores.find((score) => score.userId === playerAOsuId)
    const playerB = candidate.scores.find((score) => score.userId === playerBOsuId)
    if (playerA?.score !== scoreA || playerB?.score !== scoreB) continue
    const percentage = (accuracy: number | null | undefined): number | null => Number.isFinite(accuracy)
      ? Number(((accuracy ?? 0) <= 1 ? (accuracy ?? 0) * 100 : (accuracy ?? 0)).toFixed(4))
      : null
    return {
      scoreA: playerA.score,
      scoreB: playerB.score,
      accuracyA: percentage(playerA.accuracy),
      accuracyB: percentage(playerB.accuracy),
      missCountA: Number.isFinite(playerA.misses) ? Math.max(0, Math.trunc(playerA.misses ?? 0)) : null,
      missCountB: Number.isFinite(playerB.misses) ? Math.max(0, Math.trunc(playerB.misses ?? 0)) : null,
      comboA: Number.isFinite(playerA.maxCombo) ? Math.max(0, Math.trunc(playerA.maxCombo ?? 0)) : null,
      comboB: Number.isFinite(playerB.maxCombo) ? Math.max(0, Math.trunc(playerB.maxCombo ?? 0)) : null,
      usesHdA: playerA.mods.some((mod) => mod.toUpperCase() === "HD"),
      usesHdB: playerB.mods.some((mod) => mod.toUpperCase() === "HD"),
    }
  }
  return null
}

export function hdUsageFromScoreReport(
  games: readonly OsuScoreReportGame[],
  beatmapId: number,
  playerAOsuId: number,
  playerBOsuId: number,
  scoreA: number,
  scoreB: number,
): { usesHdA: boolean; usesHdB: boolean } | null {
  for (let index = games.length - 1; index >= 0; index -= 1) {
    const candidate = games[index]
    if (!candidate?.endedAt || candidate.beatmapId !== beatmapId) continue
    const playerA = candidate.scores.find((score) => score.userId === playerAOsuId)
    const playerB = candidate.scores.find((score) => score.userId === playerBOsuId)
    if (playerA?.score !== scoreA || playerB?.score !== scoreB) continue
    return {
      usesHdA: playerA.mods.some((mod) => mod.toUpperCase() === "HD"),
      usesHdB: playerB.mods.some((mod) => mod.toUpperCase() === "HD"),
    }
  }
  return null
}

export function compareMapResults(
  winCondition: MapWinCondition,
  result: {
    scoreA: number
    scoreB: number
    missCountA?: number | null
    missCountB?: number | null
    comboA?: number | null
    comboB?: number | null
  },
): number | null {
  if (winCondition === "miss") {
    if (
      !Number.isInteger(result.missCountA) || !Number.isInteger(result.missCountB) ||
      (result.missCountA ?? -1) < 0 || (result.missCountB ?? -1) < 0
    ) return null
    return Math.sign((result.missCountB ?? 0) - (result.missCountA ?? 0))
  }
  if (winCondition === "combo") {
    if (
      !Number.isInteger(result.comboA) || !Number.isInteger(result.comboB) ||
      (result.comboA ?? -1) < 0 || (result.comboB ?? -1) < 0
    ) return null
    return Math.sign((result.comboA ?? 0) - (result.comboB ?? 0))
  }
  return Math.sign(result.scoreA - result.scoreB)
}

export function formatLobbyTitle(abbreviation: string, playerA: string, playerB: string): string {
  return `${abbreviation.trim() || "MWS"}: (${playerA.trim()}) vs (${playerB.trim()})`
}

export function parseCreatedLobbyAnnouncement(message: string, expectedTitle: string): string | null {
  const match = message.match(/^Created the tournament match https:\/\/osu\.ppy\.sh\/mp\/(\d+)\s+(.+)$/)
  return match?.[2]?.trim() === expectedTitle.trim() ? match[1] ?? null : null
}

export function lobbyInviteTarget(username: string, osuId?: string): string {
  const normalizedId = osuId?.trim()
  if (normalizedId && /^\d+$/.test(normalizedId)) return `#${normalizedId}`
  return username.trim().replace(/\s+/g, "_")
}

export function homeModIngredientAwards(
  pool: string,
  winner: string,
  playerA: string,
  playerB: string,
  homeModA?: string,
  homeModB?: string,
): { playerA: number; playerB: number } {
  const normalizedPool = pool.trim().toUpperCase()
  return {
    playerA: (winner.trim().toLowerCase() === playerA.trim().toLowerCase() ? 1 : 0) +
      (homeModA?.trim().toUpperCase() === normalizedPool ? 1 : 0),
    playerB: (winner.trim().toLowerCase() === playerB.trim().toLowerCase() ? 1 : 0) +
      (homeModB?.trim().toUpperCase() === normalizedPool ? 1 : 0),
  }
}
