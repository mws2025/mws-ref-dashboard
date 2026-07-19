import "server-only"
import { getEnv, requireEnv } from "./env"

let cachedToken: { value: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }
  const env = await getEnv()
  const res = await fetch("https://osu.ppy.sh/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: requireEnv(env, "OSU_CLIENT_ID"),
      client_secret: requireEnv(env, "OSU_CLIENT_SECRET"),
      grant_type: "client_credentials",
      scope: "public",
    }),
  })
  if (!res.ok) {
    throw new Error(`osu! token failed: ${res.status} ${await res.text()}`)
  }
  const json = (await res.json()) as {
    access_token: string
    expires_in: number
  }
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
  return cachedToken.value
}

export type OsuUser = {
  id: number
  username: string
  countryCode: string
  rank: number | null
}

/**
 * Look up users by osu! id in batches of 50 (the API's `ids[]` limit).
 * NOTE: verify the rank field path against the live response — the lookup
 * endpoint returns statistics under `statistics_rulesets.osu` for some
 * shapes and `statistics` for others. Adjust `extractRank` if needed.
 */
export async function fetchOsuUsers(
  ids: number[]
): Promise<Map<number, OsuUser>> {
  const result = new Map<number, OsuUser>()
  if (ids.length === 0) return result
  const token = await getToken()

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const params = new URLSearchParams()
    for (const id of batch) params.append("ids[]", String(id))
    const res = await fetch(`https://osu.ppy.sh/api/v2/users?${params}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store",
    })
    if (!res.ok) {
      throw new Error(
        `osu! users lookup failed: ${res.status} ${await res.text()}`
      )
    }
    const json = (await res.json()) as {
      users?: Array<Record<string, unknown>>
    }
    for (const user of json.users ?? []) {
      const id = Number(user.id)
      result.set(id, {
        id,
        rank: extractRank(user),
        username: user.username as string,
        countryCode: user.country_code as string,
      })
    }
  }
  return result
}

function extractRank(user: Record<string, unknown>): number | null {
  const stats =
    (user.statistics as Record<string, unknown> | undefined) ??
    ((user.statistics_rulesets as Record<string, unknown> | undefined)?.osu as
      | Record<string, unknown>
      | undefined)
  const rank = stats?.global_rank
  return typeof rank === "number" ? rank : null
}

/**
 * Badge-Weighted Seed: seed = rank ^ (0.9937 ^ (badges ^ 2))
 */
export function computeBws(rank: number | null, badges: number): number | null {
  if (rank == null) return null
  const safeBadges = Number.isNaN(badges) ? 0 : badges
  return Math.round(rank ** (0.9937 ** (safeBadges ** 2)))
}
