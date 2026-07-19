// these match the exact order in sheets

export const PLAYER_KEY_ORDER = [
  "timestamp",
  "id",
  "discord",
  "badges",
  "timezone",
  "pronoun1",
  "pronoun2",
  "joinedDiscord",
] as const

export const STAFF_KEY_ORDER = [
  "timestamp",
  "id",
  "discord",
  "pronoun1",
  "pronoun2",
  "roles",
  "customLink",
  "experience",
  "timezone",
  "approved",
] as const

export function remap(
  record: Record<string, string>,
  order: readonly string[]
): Record<string, string> {
  const values = Object.values(record)
  return Object.fromEntries(order.map((key, i) => [key, values[i] ?? ""]))
}
