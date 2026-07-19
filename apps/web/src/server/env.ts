import "server-only"
import { getCloudflareContext } from "@opennextjs/cloudflare"

// Secrets + config bindings we expect on the Worker. These come from
// `wrangler secret put` (prod) and `.dev.vars` (local `next dev`).
// Augmenting CloudflareEnv keeps `env.X` fully typed everywhere.
declare global {
  interface CloudflareEnv {
    // Google service account (sheet shared as Viewer with this account)
    GOOGLE_SA_EMAIL?: string
    GOOGLE_SA_PRIVATE_KEY?: string // PEM (PKCS8), \n may be escaped

    // Each entity is its own spreadsheet file → one id per entity
    SHEET_ID_ADMIN?: string
    SHEET_ID_POOLING?: string
    SHEET_ID_REFEREE?: string

    // Optional A1 tab/range overrides (default: whole first tab)
    RANGE_STAFF?: string
    RANGE_PLAYERS?: string
    RANGE_MATCHES?: string
    // JSON: { "Round of 32": "R32!A2:Z", "Round of 16": "R16!A2:Z", ... }
    MAPPOOL_STAGES?: string

    // osu! API v2 (client credentials) for live rank enrichment
    OSU_CLIENT_ID?: string
    OSU_CLIENT_SECRET?: string

    // shared secret guarding the /api/revalidate webhook
    REVALIDATE_SECRET?: string
  }
}

export async function getEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true })
  return env
}

export function requireEnv(
  env: CloudflareEnv,
  key: keyof CloudflareEnv
): string {
  const value = env[key]
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required env binding: ${String(key)}`)
  }
  return value
}
