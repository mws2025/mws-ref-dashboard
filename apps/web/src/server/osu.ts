import "server-only"
import { getEnv, requireEnv } from "./env"

type CachedToken = { value: string; expiresAt: number }

/**
 * Where the osu! OAuth token lives, and why it isn't just a module variable.
 *
 * A module variable is per-ISOLATE, and a Worker runs many short-lived ones —
 * every cold isolate, and every background ISR revalidation, was minting its
 * own token. osu! rate-limits `/oauth/token` hard, so the endpoint started
 * answering 429 and `enrichMappools` (which throws away every cover if the
 * lookup fails at all) served cover-less mappools.
 *
 * So the token is cached in KV, where every isolate shares it: one mint per
 * token lifetime instead of one per isolate. The isolate variable stays in
 * front of it as an L1, since a KV read is a network hop.
 *
 * KV is the Next incremental-cache namespace rather than a dedicated one —
 * it's the only binding on the Worker, and a distinct key namespace keeps it
 * out of Next's way.
 */
const TOKEN_KEY = "osu:oauth-token:v1"

/** Treat a token as spent a minute early, so it can't expire mid-request. */
const EXPIRY_MARGIN_MS = 60_000

let cachedToken: CachedToken | null = null
/** Collapses concurrent misses in one isolate into a single mint. */
let inflight: Promise<string> | null = null

const usable = (t: CachedToken | null): t is CachedToken =>
  t != null && t.expiresAt > Date.now() + EXPIRY_MARGIN_MS

async function readTokenFromKv(kv: NonNullable<CloudflareEnv["NEXT_INC_CACHE_KV"]> | undefined): Promise<CachedToken | null> {
  if (!kv) return null
  try {
    const raw = await kv.get(TOKEN_KEY)
    return raw ? (JSON.parse(raw) as CachedToken) : null
  } catch (err) {
    // A cache miss is survivable; minting a fresh token is the fallback.
    console.warn("[osu] token cache read failed:", err)
    return null
  }
}

async function mintToken(env: CloudflareEnv): Promise<CachedToken> {
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
  return {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
}

async function resolveToken(): Promise<string> {
  const env = await getEnv()
  const kv = env.NEXT_INC_CACHE_KV

  // Another isolate may already have minted one.
  const shared = await readTokenFromKv(kv)
  if (usable(shared)) {
    cachedToken = shared
    return shared.value
  }

  let minted: CachedToken
  try {
    minted = await mintToken(env)
  } catch (err) {
    // Rate-limited or down. A token that is merely inside the safety margin
    // still works, so prefer it over failing every caller.
    const stale = cachedToken ?? shared
    if (stale && stale.expiresAt > Date.now()) {
      console.warn("[osu] token mint failed, using the cached token:", err)
      return stale.value
    }
    throw err
  }

  cachedToken = minted
  if (kv) {
    const ttl = Math.floor((minted.expiresAt - Date.now()) / 1000)
    try {
      // KV rejects a TTL under 60s; such a token isn't worth sharing anyway.
      if (ttl >= 60) {
        await kv.put(TOKEN_KEY, JSON.stringify(minted), { expirationTtl: ttl })
      }
    } catch (err) {
      console.warn("[osu] token cache write failed:", err)
    }
  }
  return minted.value
}

async function getToken(): Promise<string> {
  if (usable(cachedToken)) return cachedToken.value
  inflight ??= resolveToken().finally(() => {
    inflight = null
  })
  return inflight
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

/**
 * Look up users by osu! username, one request each.
 *
 * Only for names the sheet's own roster couldn't resolve — a player who has
 * changed their osu! username since signing up. The endpoint takes a single
 * name (there is no batch form), so the caller is expected to pass a handful;
 * `limit` stops a malformed sheet from turning into a request storm. A miss
 * (404, or a rename that also freed the old name) is not an error: it yields
 * no entry and the player renders without an avatar.
 */
export async function fetchOsuUsersByName(
  names: string[],
  limit = 10
): Promise<Map<string, OsuUser>> {
  const result = new Map<string, OsuUser>()
  if (names.length === 0) return result
  if (names.length > limit) {
    console.warn(
      `[osu] ${names.length} unresolved names, looking up the first ${limit}`
    )
  }
  const token = await getToken()

  for (const name of names.slice(0, limit)) {
    const res = await fetch(
      `https://osu.ppy.sh/api/v2/users/${encodeURIComponent(name)}/osu?key=username`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
        },
        cache: "no-store",
      }
    )
    if (!res.ok) {
      if (res.status !== 404) {
        console.warn(`[osu] username lookup failed for "${name}": ${res.status}`)
      }
      continue
    }
    const user = (await res.json()) as Record<string, unknown>
    const id = Number(user.id)
    if (!Number.isFinite(id)) continue
    result.set(name.toLowerCase(), {
      id,
      rank: extractRank(user),
      username: user.username as string,
      countryCode: user.country_code as string,
    })
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

export type OsuBeatmap = {
  beatmapId: number
  beatmapsetId: number
  artist: string
  title: string
  difficulty: string
  mapper: string
  coverUrl: string
  listUrl: string
}

/**
 * Look up beatmaps by *difficulty* id (what the pooling sheet stores) in
 * batches of 50. Used mainly to recover `beatmapset_id` — the sheet has no
 * set id, and cover art lives under the set.
 *
 * Metadata here is authoritative for artist/title/difficulty/mapper. The
 * sheet's own stat columns stay authoritative for SR/BPM/CS/AR/OD/HP, because
 * the pooling template already mod-adjusts them (HR CS x1.3, DT AR > 10, ...).
 */
export async function fetchOsuBeatmaps(
  ids: number[]
): Promise<Map<number, OsuBeatmap>> {
  const result = new Map<number, OsuBeatmap>()
  if (ids.length === 0) return result
  const token = await getToken()

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const params = new URLSearchParams()
    for (const id of batch) params.append("ids[]", String(id))
    const res = await fetch(`https://osu.ppy.sh/api/v2/beatmaps?${params}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store",
    })
    if (!res.ok) {
      throw new Error(
        `osu! beatmaps lookup failed: ${res.status} ${await res.text()}`
      )
    }
    const json = (await res.json()) as {
      beatmaps?: Array<Record<string, unknown>>
    }
    for (const beatmap of json.beatmaps ?? []) {
      const beatmapId = Number(beatmap.id)
      const beatmapsetId = Number(beatmap.beatmapset_id)
      if (!Number.isFinite(beatmapId) || !Number.isFinite(beatmapsetId)) {
        continue
      }
      const set = (beatmap.beatmapset ?? {}) as Record<string, unknown>
      const covers = (set.covers ?? {}) as Record<string, string>
      const str = (v: unknown) => (typeof v === "string" ? v : "")
      result.set(beatmapId, {
        beatmapId,
        beatmapsetId,
        artist: str(set.artist),
        title: str(set.title),
        difficulty: str(beatmap.version),
        mapper: str(set.creator),
        coverUrl:
          covers["cover@2x"] ||
          covers.cover ||
          `https://assets.ppy.sh/beatmaps/${beatmapsetId}/covers/cover@2x.jpg`,
        listUrl:
          covers["list@2x"] ||
          covers.list ||
          `https://assets.ppy.sh/beatmaps/${beatmapsetId}/covers/list@2x.jpg`,
      })
    }
  }
  return result
}
