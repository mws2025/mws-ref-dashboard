export function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, "0")
}

export function withAntiSpam(cmd: string): string {
  return cmd.trimEnd().startsWith("!mp") ? `${cmd.trimEnd()} ${randomSuffix()}` : cmd
}
