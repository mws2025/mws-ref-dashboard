export type RollAnnouncement = {
  player: string
  value: number
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

export function homeModIngredientCount(
  pool: string,
  winner: string,
  playerA: string,
  playerB: string,
  homeModA?: string,
  homeModB?: string,
): number {
  const normalizedWinner = winner.trim().toLowerCase()
  const homeMod = normalizedWinner === playerA.trim().toLowerCase()
    ? homeModA
    : normalizedWinner === playerB.trim().toLowerCase()
      ? homeModB
      : undefined

  return homeMod?.trim().toUpperCase() === pool.trim().toUpperCase() ? 2 : 1
}
