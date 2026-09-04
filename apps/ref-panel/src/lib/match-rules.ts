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

export function baseBanLimitForRound(round: string): number {
  const normalized = round.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
  return normalized === "ro32" || normalized === "roundof32" ? 2 : MAX_MATCH_BANS
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
  switch (pool.trim().toUpperCase()) {
    case "FM":
    case "TB":
      return formatLobbyMods(["Freemod"], enforceNF)
    case "HR":
      return formatLobbyMods(["HR"], enforceNF)
    case "DT":
      return formatLobbyMods(["DT"], enforceNF)
    default:
      return formatLobbyMods([], enforceNF)
  }
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

export function isMissCountWinCondition(slot: string): boolean {
  return slot.trim().toUpperCase() === "PS3"
}

export function compareMapResults(
  slot: string,
  scoreA: number,
  scoreB: number,
  missCountA?: number | null,
  missCountB?: number | null,
): number | null {
  if (!isMissCountWinCondition(slot)) return Math.sign(scoreA - scoreB)
  if (
    !Number.isInteger(missCountA) || !Number.isInteger(missCountB) ||
    (missCountA ?? -1) < 0 || (missCountB ?? -1) < 0
  ) return null
  return Math.sign((missCountB ?? 0) - (missCountA ?? 0))
}

export function formatLobbyTitle(abbreviation: string, playerA: string, playerB: string): string {
  return `${abbreviation.trim() || "MWS"}: (${playerA.trim()}) vs (${playerB.trim()})`
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
