import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { Hono, type Context } from "hono"
import { handle } from "hono/cloudflare-pages"
import { sign, verify } from "hono/jwt"

type Bindings = {
  GOOGLE_APPLICATION_CREDENTIALS?: string
  GOOGLE_SHEETS_TOURNAMENT_ID?: string
  OSU_CLIENT_ID?: string
  OSU_CLIENT_SECRET?: string
  OSU_REDIRECT_URI?: string
  SESSION_SECRET?: string
  OSU_PROXY_BASE?: string
  OSU_PROXY_SECRET?: string
  IRC_RELAY_URL?: string
  IRC_RELAY_SECRET?: string
}

type ServiceAccountJson = {
  client_email?: string
  private_key?: string
}

type SessionUser = {
  osuId: number
  username: string
}

type SessionDebugResult = {
  hasCookie: boolean
  tokenLength: number
  user: SessionUser | null
  verifyError: string | null
}

type OsuUser = {
  id: number
  username: string
}

type SheetRecord = Record<string, string>

type ApiMatchStatus = "scheduled" | "upcoming" | "live" | "completed" | "forfeit"

type ApiMatch = {
  id: string
  round: string
  mappool?: string
  playerA: string
  playerB: string
  playerAOsuId?: string
  playerBOsuId?: string
  date: string
  time: string
  status: ApiMatchStatus
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

type ApiPoolMap = {
  slot: string
  pool: string
  map: string
  beatmapId?: string
  status: string
  pickedBy?: string
  bannedBy?: string
  winner?: string
}

type HomeMod = "NM" | "PS" | "HR" | "DT" | "FM"
type MatchFlowPhase =
  | "lobby"
  | "roll"
  | "order"
  | "home_mod"
  | "ban"
  | "craft"
  | "play"
  | "ready_result"
  | "completed"

type MatchFlowState = {
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

type InventoryMap = Record<"egg" | "sugar" | "butter" | "flour" | "milk", number>
type IngredientKey = keyof InventoryMap
type RecipeEventStatus = "active" | "resolved" | "reverted"

type RecipeEventRecord = {
  id: string
  matchId: string
  player: string
  itemId: string
  action: string
  target: string
  payload: Record<string, unknown>
  status: RecipeEventStatus
  createdAt: string
  activatedAt: string
  resolvedAt: string
  resolution: Record<string, unknown>
  revertedAt: string
}

const OSU_AUTH_BASE = "https://osu.ppy.sh"

function osuApiBase(env: Bindings): string {
  return env.OSU_PROXY_BASE?.trim() || OSU_AUTH_BASE
}

function fetchOsu(env: Bindings, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  const proxySecret = env.OSU_PROXY_SECRET?.trim()

  if (env.OSU_PROXY_BASE?.trim() && proxySecret) {
    headers.set("X-Proxy-Secret", proxySecret)
  }

  return fetch(`${osuApiBase(env)}${path}`, {
    ...init,
    headers,
  })
}
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"
const SESSION_COOKIE_NAME = "mws_ref_session"
const OAUTH_STATE_COOKIE_NAME = "mws_osu_oauth_state"
const SESSION_TTL_SECONDS = 60 * 60 * 12
const MATCH_STATE_SHEET = "match_state"
const MATCH_STATE_HEADERS = [
  "match_id",
  "phase",
  "roll_a",
  "roll_b",
  "roll_winner",
  "first_picker",
  "first_banner",
  "turn_player",
  "home_mod_a",
  "home_mod_b",
  "current_slot",
  "updated_at",
] as const
const INVENTORY_KEYS = ["egg", "sugar", "butter", "flour", "milk"] as const
const ITEM_EVENT_HEADERS = [
  "event_id",
  "match_id",
  "player_id",
  "item_id",
  "action",
  "target",
  "payload",
  "created_by",
  "created_at",
  "reverted_at",
  "status",
  "activated_at",
  "resolved_at",
  "resolution",
] as const
const RECIPE_MOD_CHOICES = ["HD", "HR", "HT", "EZ", "FL", "SO"] as const
const MAP_BOUND_EFFECTS = new Set([
  "mod_replace",
  "score_add",
  "mod_add_self",
  "mod_add_both",
  "replay_top_score",
  "mod_force_both",
  "accuracy_mode",
  "score_multiply",
  "conditional_replay",
  "scoring_mode",
  "win_bonus_steal",
  "home_base_ingredient",
  "comeback_bonus",
])
const BUILTIN_ITEM_RECORDS: SheetRecord[] = [
  {
    item_id: "item_8",
    name: "Cinnamon Roll",
    cost_egg: "1",
    cost_sugar: "2",
    cost_butter: "1",
    cost_flour: "1",
    cost_milk: "1",
    timing: "ban_phase",
    effect_type: "protect_map",
    effect_payload: "{}",
    enabled: "true",
  },
  {
    item_id: "item_12",
    name: "Crepe",
    cost_egg: "1",
    cost_sugar: "0",
    cost_butter: "2",
    cost_flour: "0",
    cost_milk: "1",
    timing: "before_map",
    effect_type: "accuracy_mode",
    effect_payload: "{\"mode\":\"accuracy\"}",
    enabled: "true",
  },
  {
    item_id: "item_18",
    name: "Magic Cake",
    cost_egg: "0",
    cost_sugar: "1",
    cost_butter: "2",
    cost_flour: "2",
    cost_milk: "0",
    timing: "before_map",
    effect_type: "copy_last_opponent",
    effect_payload: "{}",
    enabled: "true",
  },
  {
    item_id: "item_19",
    name: "Cinnamon Roll",
    cost_egg: "1",
    cost_sugar: "0",
    cost_butter: "2",
    cost_flour: "2",
    cost_milk: "1",
    timing: "ban_phase",
    effect_type: "unban_map",
    effect_payload: "{}",
    enabled: "true",
  },
]
const POOL_TO_INGREDIENT: Record<string, keyof InventoryMap | undefined> = {
  NM: "egg",
  PS: "sugar",
  HR: "butter",
  DT: "flour",
  FM: "milk",
}
const DEFAULT_BAN_ORDER = "ABAB"

const app = new Hono<{ Bindings: Bindings }>()
type AppContext = Context<{ Bindings: Bindings }>

function mustEnv(env: Bindings, key: keyof Bindings): string {
  const value = env[key]?.trim()
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`)
  }
  return value
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function toStringMatrix(value: unknown): string[][] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const rows: string[][] = []
  for (const row of value) {
    if (!Array.isArray(row)) {
      return null
    }

    rows.push(
      row.map((cell) => {
        if (typeof cell === "string") {
          return cell
        }
        return cell == null ? "" : String(cell)
      })
    )
  }

  return rows
}

async function getServiceAccountCredentials(env: Bindings): Promise<{ email: string; privateKey: string }> {
  const rawJson = mustEnv(env, "GOOGLE_APPLICATION_CREDENTIALS")
  if (!rawJson.trimStart().startsWith("{")) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS must be the full service account JSON string in Pages runtime"
    )
  }

  let parsed: ServiceAccountJson
  try {
    parsed = JSON.parse(rawJson) as ServiceAccountJson
  } catch {
    throw new Error("Invalid service account JSON in GOOGLE_APPLICATION_CREDENTIALS")
  }

  const email = parsed.client_email?.trim()
  const privateKey = parsed.private_key?.trim()
  if (!email || !privateKey) {
    throw new Error("Service account JSON must include client_email and private_key")
  }

  return { email, privateKey }
}

function isSecureRequest(url: string): boolean {
  return new URL(url).protocol === "https:"
}

function isLocalRequest(url: string): boolean {
  const requestUrl = new URL(url)
  return requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1"
}

function resolveOsuRedirectUri(c: AppContext): string {
  return mustEnv(c.env, "OSU_REDIRECT_URI")
}

function randomHex(size: number): string {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function jsonBase64Url(value: unknown): string {
  const json = JSON.stringify(value)
  return base64UrlEncode(new TextEncoder().encode(json))
}

function pemToArrayBuffer(pemRaw: string): ArrayBuffer {
  const pem = pemRaw.replace(/\\n/g, "\n")
  const stripped = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "")
  const decoded = atob(stripped)
  const bytes = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i++) {
    bytes[i] = decoded.charCodeAt(i)
  }
  return bytes.buffer
}

async function createServiceAccountAssertion(
  serviceAccountEmail: string,
  privateKeyPem: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: "RS256", typ: "JWT" }
  const payload = {
    iss: serviceAccountEmail,
    scope: GOOGLE_SHEETS_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }

  const signingInput = `${jsonBase64Url(header)}.${jsonBase64Url(payload)}`
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput)
  )

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`
}

async function getGoogleAccessToken(env: Bindings): Promise<string> {
  const { email: serviceAccountEmail, privateKey } = await getServiceAccountCredentials(env)

  const assertion = await createServiceAccountAssertion(serviceAccountEmail, privateKey)
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  })

  const tokenRes = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!tokenRes.ok) {
    const reason = await tokenRes.text()
    throw new Error(`Google OAuth token request failed: ${tokenRes.status} ${reason}`)
  }

  const tokenJson = toRecord(await tokenRes.json())
  const accessToken = tokenJson && typeof tokenJson.access_token === "string"
    ? tokenJson.access_token
    : null

  if (!accessToken) {
    throw new Error("Google OAuth token response missing access_token")
  }

  return accessToken
}

// Module-level read cache — survives across requests on the same CF isolate (burst window)
const _sheetCache = new Map<string, { data: string[][]; ts: number }>()
const _CACHE_TTL: Partial<Record<string, number>> = {
  "config!A:B":          30_000,
  "mappool!A1:Z":        30_000,
  "items!A1:Z":          30_000,
  "matches!A1:Z":        10_000,
  "match_maps!A1:Z":      2_000,
  "inventory!A1:Z":       2_000,
  "item_events!A1:ZZ":    2_000,
}
const _DEFAULT_TTL = 8_000

function _cacheGet(range: string): string[][] | null {
  const entry = _sheetCache.get(range)
  if (!entry) return null
  const ttl = _CACHE_TTL[range] ?? _DEFAULT_TTL
  if (Date.now() - entry.ts > ttl) { _sheetCache.delete(range); return null }
  return entry.data
}

function _cacheSet(range: string, data: string[][]): void {
  _sheetCache.set(range, { data, ts: Date.now() })
}

function _cacheInvalidate(sheetName: string): void {
  const prefix = sheetName.replace(/!.*/, "").toLowerCase()
  for (const key of _sheetCache.keys()) {
    if (key.toLowerCase().startsWith(prefix)) _sheetCache.delete(key)
  }
}

async function getSheetValuesSafe(env: Bindings, rangeA1: string): Promise<string[][]> {
  const cached = _cacheGet(rangeA1)
  if (cached) return cached
  try {
    const data = await getSheetValues(env, rangeA1)
    _cacheSet(rangeA1, data)
    return data
  } catch {
    return []
  }
}

async function getSheetValues(env: Bindings, rangeA1: string): Promise<string[][]> {
  const sheetId = mustEnv(env, "GOOGLE_SHEETS_TOURNAMENT_ID")
  const accessToken = await getGoogleAccessToken(env)
  const range = encodeURIComponent(rangeA1)
  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`

  const res = await fetch(valuesUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  })

  if (!res.ok) {
    const reason = await res.text()
    throw new Error(`Sheets read failed: ${res.status} ${reason}`)
  }

  const payload = toRecord(await res.json())
  if (!payload) {
    throw new Error("Sheets read failed: invalid JSON payload")
  }

  const values = toStringMatrix(payload.values)
  return values ?? []
}

async function getAccessRows(env: Bindings): Promise<string[][]> {
  return getSheetValues(env, "access!A2:C")
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s-]+/g, "_")
}

function sheetRowsToRecords(values: string[][]): SheetRecord[] {
  const [headers, ...rows] = values
  if (!headers) {
    return []
  }

  const normalizedHeaders = headers.map(normalizeHeader)
  return rows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const record: SheetRecord = {}
      normalizedHeaders.forEach((header, index) => {
        if (header) {
          record[header] = row[index]?.trim() ?? ""
        }
      })
      return record
    })
}

function firstValue(record: SheetRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]?.trim()
    if (value) {
      return value
    }
  }
  return ""
}

function normalizeMatchStatus(rawStatus: string): ApiMatchStatus {
  const normalized = rawStatus.trim().toLowerCase().replace(/[\s_-]+/g, "_")
  if (normalized === "live" || normalized === "active" || normalized === "started" || normalized === "in_progress") {
    return "live"
  }
  if (normalized === "upcoming" || normalized === "ready") {
    return "upcoming"
  }
  if (normalized === "completed" || normalized === "complete" || normalized === "done" || normalized === "finished") {
    return "completed"
  }
  if (normalized === "forfeit" || normalized === "ff" || normalized === "forfeited") {
    return "forfeit"
  }
  return "scheduled"
}

function isActiveMatch(match: ApiMatch): boolean {
  return match.status === "live"
}

function refereeMatchesNotes(notes: string, username: string): boolean {
  const normalizedUsername = username.trim().toLowerCase()
  if (!normalizedUsername) {
    return false
  }

  return notes
    .split(/[,;|]/)
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) => entry === normalizedUsername)
}

function getPlayerName(playerIdOrName: string, playersById: Map<string, string>): string {
  return playersById.get(playerIdOrName) ?? playerIdOrName
}

function compareMatches(a: ApiMatch, b: ApiMatch): number {
  const dateCompare = a.date.localeCompare(b.date)
  if (dateCompare !== 0) {
    return dateCompare
  }
  const timeCompare = a.time.localeCompare(b.time)
  if (timeCompare !== 0) {
    return timeCompare
  }
  return a.round.localeCompare(b.round)
}

function mapPlayersById(playerRecords: SheetRecord[]): Map<string, string> {
  const playersById = new Map<string, string>()
  playerRecords.forEach((record) => {
    const id = firstValue(record, ["player_id", "id"])
    const name = firstValue(record, ["name", "username", "osu_username"])
    if (id && name) {
      playersById.set(id, name)
    }
  })
  return playersById
}

function mapOsuIdsByKey(playerRecords: SheetRecord[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const r of playerRecords) {
    const osuId = firstValue(r, ["osu_id"])
    if (!osuId) continue
    const pid  = firstValue(r, ["player_id", "id"])
    const name = firstValue(r, ["name", "username", "osu_username"])
    if (pid)  map.set(pid, osuId)
    if (name) map.set(name.toLowerCase(), osuId)
    map.set(osuId, osuId) // osu_id → osu_id passthrough
  }
  return map
}

function parseOptionalInt(value: string): number | undefined {
  const n = parseInt(value, 10)
  return isNaN(n) ? undefined : n
}

function mapMatchRecord(record: SheetRecord, playersById: Map<string, string>, osuIdsMap?: Map<string, string>): ApiMatch {
  const rawA  = firstValue(record, ["player_a", "team_a", "playera", "team_a_id"])
  const rawB  = firstValue(record, ["player_b", "team_b", "playerb", "team_b_id"])
  const playerA = getPlayerName(rawA, playersById)
  const playerB = getPlayerName(rawB, playersById)
  const referee = firstValue(record, ["referee", "ref"])
  const notes = firstValue(record, ["notes"])
  const bestOf = parseOptionalInt(firstValue(record, ["best_of", "bestof", "bo"]))

  return {
    id: firstValue(record, ["match_id", "id"]),
    round: firstValue(record, ["round"]),
    mappool: firstValue(record, ["mappool", "mappool_id", "pool"]) || undefined,
    playerA,
    playerB,
    playerAOsuId: osuIdsMap?.get(rawA) ?? osuIdsMap?.get(playerA.toLowerCase()),
    playerBOsuId: osuIdsMap?.get(rawB) ?? osuIdsMap?.get(playerB.toLowerCase()),
    date: firstValue(record, ["date", "match_date", "scheduled_date", "scheduled_at"]) || "TBD",
    time: firstValue(record, ["time", "match_time", "scheduled_time", "start_time"]) || "TBD",
    status: normalizeMatchStatus(firstValue(record, ["status"])),
    scoreA: parseOptionalInt(firstValue(record, ["score_a", "scorea"])),
    scoreB: parseOptionalInt(firstValue(record, ["score_b", "scoreb"])),
    bestOf,
    lobbyUrl: firstValue(record, ["lobby_url", "lobby", "mp_link"]) || undefined,
    winner: firstValue(record, ["winner"]) || undefined,
    currentMap: firstValue(record, ["current_map", "current_map_id"]) || undefined,
    notes: notes || undefined,
    referee: referee || undefined,
    streamer: firstValue(record, ["streamer"]) || undefined,
  }
}

async function getMatches(env: Bindings): Promise<ApiMatch[]> {
  const [matchValues, playerValues] = await Promise.all([
    getSheetValues(env, "matches!A1:Z"),
    getSheetValues(env, "players!A1:Z"),
  ])
  const playerRecords = sheetRowsToRecords(playerValues)
  const playersById = mapPlayersById(playerRecords)
  const osuIdsMap   = mapOsuIdsByKey(playerRecords)

  return sheetRowsToRecords(matchValues)
    .map((record) => mapMatchRecord(record, playersById, osuIdsMap))
    .filter((match) => match.id)
    .sort(compareMatches)
}

function findAuthorizedAccessRow(rows: string[][], user: OsuUser): number | null {
  const username = user.username.trim().toLowerCase()
  const osuId = String(user.id)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowUsername = (row[0] ?? "").trim().toLowerCase()
    const rowOsuId = (row[1] ?? "").trim()
    if (rowUsername === username && rowOsuId === osuId) {
      return i + 2
    }
  }

  return null
}

async function updateLastAccessedAt(env: Bindings, rowNumber: number): Promise<void> {
  const sheetId = mustEnv(env, "GOOGLE_SHEETS_TOURNAMENT_ID")
  const accessToken = await getGoogleAccessToken(env)
  const rangeA1 = `access!C${rowNumber}`
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(rangeA1)}?valueInputOption=RAW`

  const res = await fetch(updateUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      range: rangeA1,
      majorDimension: "ROWS",
      values: [[new Date().toISOString()]],
    }),
  })

  if (!res.ok) {
    const reason = await res.text()
    throw new Error(`Sheets update failed: ${res.status} ${reason}`)
  }
}

async function exchangeOsuCodeForToken(
  env: Bindings,
  code: string,
  redirectUri: string
): Promise<string> {
  const clientId = mustEnv(env, "OSU_CLIENT_ID")
  const clientSecret = mustEnv(env, "OSU_CLIENT_SECRET")

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  })

  const tokenRes = await fetchOsu(env, "/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  })

  if (!tokenRes.ok) {
    const reason = await tokenRes.text()
    throw new Error(`osu! token exchange failed: ${tokenRes.status} ${reason}`)
  }

  const tokenJson = toRecord(await tokenRes.json())
  const accessToken = tokenJson && typeof tokenJson.access_token === "string"
    ? tokenJson.access_token
    : null

  if (!accessToken) {
    throw new Error("osu! token response missing access_token")
  }

  return accessToken
}

async function fetchOsuUser(accessToken: string, env: Bindings): Promise<OsuUser> {
  const userRes = await fetchOsu(env, "/api/v2/me/osu", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  })

  if (!userRes.ok) {
    const reason = await userRes.text()
    throw new Error(`osu! user lookup failed: ${userRes.status} ${reason}`)
  }

  const user = toRecord(await userRes.json())
  if (!user) {
    throw new Error("osu! user response malformed")
  }

  if (typeof user.id !== "number" || typeof user.username !== "string") {
    throw new Error("osu! user response missing id or username")
  }

  return { id: user.id, username: user.username }
}

async function issueSessionToken(secret: string, user: SessionUser): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return sign(
    {
      sub: String(user.osuId),
      username: user.username,
      osu_id: user.osuId,
      iat: now,
      exp: now + SESSION_TTL_SECONDS,
    },
    secret
  )
}

function getSessionSecret(env: Bindings): string | null {
  const secret = env.SESSION_SECRET?.trim()
  if (!secret) {
    return null
  }
  return secret
}

function parseOsuId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value)
  }
  return null
}

async function inspectSession(c: AppContext): Promise<SessionDebugResult> {
  const secret = getSessionSecret(c.env)
  const token = getCookie(c, SESSION_COOKIE_NAME)

  if (!secret || !token) {
    return {
      hasCookie: Boolean(token),
      tokenLength: token?.length ?? 0,
      user: null,
      verifyError: null,
    }
  }

  try {
    const payload = await verify(token, secret, "HS256")
    const username = payload?.username
    const osuId = parseOsuId(payload?.osu_id)

    if (typeof username !== "string" || osuId === null) {
      return {
        hasCookie: true,
        tokenLength: token.length,
        user: null,
        verifyError: "Session payload missing username or numeric osu_id",
      }
    }

    return {
      hasCookie: true,
      tokenLength: token.length,
      user: { username, osuId },
      verifyError: null,
    }
  } catch (error) {
    return {
      hasCookie: true,
      tokenLength: token.length,
      user: null,
      verifyError: error instanceof Error ? error.message : "Session verification failed",
    }
  }
}

async function readSessionUser(c: AppContext): Promise<SessionUser | null> {
  const secret = getSessionSecret(c.env)
  if (!secret) {
    return null
  }

  const token = getCookie(c, SESSION_COOKIE_NAME)
  if (!token) {
    return null
  }

  try {
    const payload = await verify(token, secret, "HS256")
    const username = payload?.username
    const osuId = parseOsuId(payload?.osu_id)

    if (typeof username !== "string" || osuId === null) {
      return null
    }

    return { username, osuId }
  } catch {
    return null
  }
}

function sessionCookieOptions(requestUrl: string) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: isSecureRequest(requestUrl),
    maxAge: SESSION_TTL_SECONDS,
  }
}

function oauthStateCookieOptions(requestUrl: string) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: isSecureRequest(requestUrl),
    maxAge: 10 * 60,
  }
}

async function getConfigMap(env: Bindings): Promise<Map<string, string>> {
  const values = await getSheetValuesSafe(env, "config!A:B")
  const map = new Map<string, string>()
  for (const row of values) {
    const key = row[0]?.trim().toLowerCase()
    const value = row[1]?.trim() ?? ""
    if (key) map.set(key, value)
  }
  return map
}

function isRestrictAccess(configMap: Map<string, string>): boolean {
  return configMap.get("restrict access")?.toLowerCase() !== "false"
}

function isTestMode(configMap: Map<string, string>): boolean {
  return configMap.get("test mode")?.toLowerCase() === "true"
}

function teamModeToInt(mode: string): number {
  switch (mode.trim().toLowerCase().replace(/[^a-z]/g, "")) {
    case "tagcoop": return 1
    case "teamvs": case "teamversus": return 2
    case "tagteamvs": return 3
    default: return 0 // head-to-head
  }
}

function scoringModeToInt(mode: string): number {
  switch (mode.trim().toLowerCase().replace(/[^a-z0-9]/g, "")) {
    case "accuracy": return 1
    case "combo": return 2
    case "scorev2": return 3
    default: return 0 // score
  }
}

function formatToLobbySize(format: string): number {
  const m = format.trim().match(/(\d+)v(\d+)/i)
  if (m) return parseInt(m[1], 10) + parseInt(m[2], 10)
  return 2
}

async function writeSheetCell(env: Bindings, rangeA1: string, value: string): Promise<void> {
  _cacheInvalidate(rangeA1.split("!")[0])
  const sheetId = mustEnv(env, "GOOGLE_SHEETS_TOURNAMENT_ID")
  const accessToken = await getGoogleAccessToken(env)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(rangeA1)}?valueInputOption=RAW`
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ range: rangeA1, majorDimension: "ROWS", values: [[value]] }),
  })
  if (!res.ok) {
    const reason = await res.text()
    throw new Error(`Sheets write failed: ${res.status} ${reason}`)
  }
}

function colLetter(idx: number): string {
  let result = ""
  let n = idx + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    result = String.fromCharCode(65 + rem) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

async function appendSheetRow(env: Bindings, sheetName: string, row: string[]): Promise<void> {
  _cacheInvalidate(sheetName)
  const sheetId = mustEnv(env, "GOOGLE_SHEETS_TOURNAMENT_ID")
  const accessToken = await getGoogleAccessToken(env)
  const range = encodeURIComponent(`${sheetName}!A:Z`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ majorDimension: "ROWS", values: [row] }),
  })
  if (!res.ok) {
    const reason = await res.text()
    throw new Error(`Sheets append failed: ${res.status} ${reason}`)
  }
}

async function appendAuditLog(
  env: Bindings,
  actor: string,
  action: string,
  entityType: string,
  entityId: string,
  beforeJson: string,
  afterJson: string,
): Promise<void> {
  const eventId = randomHex(8)
  const now = new Date().toISOString()
  await appendSheetRow(env, "audit_log", [eventId, actor, action, entityType, entityId, beforeJson, afterJson, now])
}

async function updateMatchField(env: Bindings, matchId: string, fieldName: string, value: string): Promise<void> {
  await updateMatchFields(env, matchId, { [fieldName]: value })
}

async function updateMatchFields(env: Bindings, matchId: string, fields: Record<string, string>): Promise<void> {
  const sheetId = mustEnv(env, "GOOGLE_SHEETS_TOURNAMENT_ID")
  const values = await getSheetValues(env, "matches!A1:Z")
  const [headers, ...rows] = values
  if (!headers) return
  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase().replace(/[\s-]/g, "_"))
  const rowIdx = rows.findIndex((r) => r[0]?.trim() === matchId)
  if (rowIdx < 0) throw new Error(`Match "${matchId}" not found in matches sheet`)
  const rowNum = rowIdx + 2

  const data: { range: string; values: string[][] }[] = []
  for (const [fieldName, value] of Object.entries(fields)) {
    const colIdx = normalizedHeaders.indexOf(fieldName)
    if (colIdx < 0) throw new Error(`Column "${fieldName}" not found in matches sheet`)
    data.push({ range: `matches!${colLetter(colIdx)}${rowNum}`, values: [[value]] })
  }

  _cacheInvalidate("matches")
  const accessToken = await getGoogleAccessToken(env)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  })
  if (!res.ok) {
    const reason = await res.text()
    throw new Error(`Sheets batch write failed: ${res.status} ${reason}`)
  }
}

async function batchUpdateValues(env: Bindings, data: { range: string; values: string[][] }[]): Promise<void> {
  if (data.length === 0) return
  data.forEach((d) => _cacheInvalidate(d.range.split("!")[0]))
  const sheetId = mustEnv(env, "GOOGLE_SHEETS_TOURNAMENT_ID")
  const accessToken = await getGoogleAccessToken(env)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  })
  if (!res.ok) {
    const reason = await res.text()
    throw new Error(`Sheets batch write failed: ${res.status} ${reason}`)
  }
}

async function ensureSheetWithHeaders(env: Bindings, sheetName: string, headers: readonly string[]): Promise<void> {
  const sheetId = mustEnv(env, "GOOGLE_SHEETS_TOURNAMENT_ID")
  const accessToken = await getGoogleAccessToken(env)
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  })
  if (!metaRes.ok) {
    const reason = await metaRes.text()
    throw new Error(`Sheets metadata read failed: ${metaRes.status} ${reason}`)
  }

  const meta = toRecord(await metaRes.json())
  const sheets = Array.isArray(meta?.sheets) ? meta.sheets : []
  const exists = sheets.some((sheet) => {
    const record = toRecord(sheet)
    const props = record ? toRecord(record.properties) : null
    return props?.title === sheetName
  })

  if (!exists) {
    const addRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }),
    })
    if (!addRes.ok) {
      const reason = await addRes.text()
      throw new Error(`Sheet create failed: ${addRes.status} ${reason}`)
    }
  }

  const current = await getSheetValuesSafe(env, `${sheetName}!A1:ZZ1`)
  const currentHeaders = current[0]?.map((cell) => cell.trim()) ?? []
  if (currentHeaders.length === 0 || currentHeaders.every((cell) => !cell)) {
    await batchUpdateValues(env, [
      { range: `${sheetName}!A1:${colLetter(headers.length - 1)}1`, values: [headers as string[]] },
    ])
    return
  }

  const normalized = new Set(currentHeaders.map(normalizeHeader))
  const missing = headers.filter((header) => !normalized.has(normalizeHeader(header)))
  if (missing.length > 0) {
    const merged = [...currentHeaders, ...missing]
    await batchUpdateValues(env, [
      { range: `${sheetName}!A1:${colLetter(merged.length - 1)}1`, values: [merged] },
    ])
  }
}

function parseNumberCell(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function normalizeHomeMod(value: unknown): HomeMod | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim().toUpperCase()
  return ["NM", "PS", "HR", "DT", "FM"].includes(normalized) ? normalized as HomeMod : undefined
}

function opponentOf(player: string, playerA: string, playerB: string): string {
  return player.trim().toLowerCase() === playerA.trim().toLowerCase() ? playerB : playerA
}

function defaultFlowState(matchId: string, hasLobby: boolean): MatchFlowState {
  return {
    matchId,
    phase: hasLobby ? "roll" : "lobby",
    updatedAt: new Date().toISOString(),
  }
}

function matchFlowFromRecord(record: SheetRecord, matchId: string, hasLobby: boolean): MatchFlowState {
  const phaseRaw = firstValue(record, ["phase"]) as MatchFlowPhase
  const phase: MatchFlowPhase = [
    "lobby",
    "roll",
    "order",
    "home_mod",
    "ban",
    "craft",
    "play",
    "ready_result",
    "completed",
  ].includes(phaseRaw) ? phaseRaw : defaultFlowState(matchId, hasLobby).phase

  return {
    matchId,
    phase,
    rollA: parseNumberCell(firstValue(record, ["roll_a", "rolla"])),
    rollB: parseNumberCell(firstValue(record, ["roll_b", "rollb"])),
    rollWinner: firstValue(record, ["roll_winner", "rollwinner"]) || undefined,
    firstPicker: firstValue(record, ["first_picker", "firstpicker"]) || undefined,
    firstBanner: firstValue(record, ["first_banner", "firstbanner"]) || undefined,
    turnPlayer: firstValue(record, ["turn_player", "turnplayer"]) || undefined,
    homeModA: normalizeHomeMod(firstValue(record, ["home_mod_a", "homemoda"])),
    homeModB: normalizeHomeMod(firstValue(record, ["home_mod_b", "homemodb"])),
    currentSlot: firstValue(record, ["current_slot", "currentslot"]) || undefined,
    updatedAt: firstValue(record, ["updated_at", "updatedat"]) || undefined,
  }
}

async function getMatchFlowState(env: Bindings, matchId: string, hasLobby = true): Promise<MatchFlowState> {
  const values = await getSheetValuesSafe(env, `${MATCH_STATE_SHEET}!A1:Z`)
  const records = sheetRowsToRecords(values)
  const record = records.find((r) => firstValue(r, ["match_id", "id"]) === matchId)
  return record ? matchFlowFromRecord(record, matchId, hasLobby) : defaultFlowState(matchId, hasLobby)
}

async function writeMatchFlowState(env: Bindings, state: MatchFlowState): Promise<MatchFlowState> {
  await ensureSheetWithHeaders(env, MATCH_STATE_SHEET, MATCH_STATE_HEADERS)
  const values = await getSheetValuesSafe(env, `${MATCH_STATE_SHEET}!A1:Z`)
  const [headersRaw, ...rows] = values
  const headers = headersRaw?.map(normalizeHeader) ?? [...MATCH_STATE_HEADERS]
  const matchIdIdx = headers.indexOf("match_id")
  const rowIdx = rows.findIndex((row) => row[matchIdIdx]?.trim() === state.matchId)
  const nextState: MatchFlowState = { ...state, updatedAt: new Date().toISOString() }
  const cellValue = (header: string): string => {
    switch (header) {
      case "match_id": return nextState.matchId
      case "phase": return nextState.phase
      case "roll_a": return nextState.rollA == null ? "" : String(nextState.rollA)
      case "roll_b": return nextState.rollB == null ? "" : String(nextState.rollB)
      case "roll_winner": return nextState.rollWinner ?? ""
      case "first_picker": return nextState.firstPicker ?? ""
      case "first_banner": return nextState.firstBanner ?? ""
      case "turn_player": return nextState.turnPlayer ?? ""
      case "home_mod_a": return nextState.homeModA ?? ""
      case "home_mod_b": return nextState.homeModB ?? ""
      case "current_slot": return nextState.currentSlot ?? ""
      case "updated_at": return nextState.updatedAt ?? ""
      default: return ""
    }
  }

  if (rowIdx >= 0) {
    const rowNum = rowIdx + 2
    await batchUpdateValues(env, headers.map((header, i) => ({
      range: `${MATCH_STATE_SHEET}!${colLetter(i)}${rowNum}`,
      values: [[cellValue(header)]],
    })))
  } else {
    await appendSheetRow(env, MATCH_STATE_SHEET, headers.map(cellValue))
  }

  return nextState
}

function orderedPlayersFromPattern(patternRaw: string, firstPlayer: string, secondPlayer: string): string[] {
  const pattern = (patternRaw || DEFAULT_BAN_ORDER).toUpperCase().replace(/[^AB12]/g, "")
  return Array.from(pattern || DEFAULT_BAN_ORDER).map((token) =>
    token === "A" || token === "1" ? firstPlayer : secondPlayer
  )
}

function countCompletedWins(matchMaps: SheetRecord[], matchId: string, player: string): number {
  return matchMaps.filter((r) =>
    firstValue(r, ["match_id"]) === matchId &&
    firstValue(r, ["status"]).toLowerCase() === "completed" &&
    firstValue(r, ["winner"]).toLowerCase() === player.toLowerCase()
  ).length
}

async function getMatchById(env: Bindings, matchId: string): Promise<ApiMatch | null> {
  const matches = await getMatches(env)
  return matches.find((match) => match.id === matchId) ?? null
}

function parseInventoryRecord(record?: SheetRecord): InventoryMap {
  return Object.fromEntries(
    INVENTORY_KEYS.map((key) => [key, Math.max(0, Number(record?.[key] ?? 0) || 0)])
  ) as InventoryMap
}

async function writeInventoryAbsolute(
  env: Bindings,
  matchId: string,
  player: string,
  inventory: InventoryMap,
  actor: string,
  auditAction = "inventory_update",
): Promise<InventoryMap> {
  await ensureSheetWithHeaders(env, "inventory", ["match_id", "player", ...INVENTORY_KEYS])
  const inventoryValues = await getSheetValuesSafe(env, "inventory!A1:Z")
  const [rawHeaders, ...rows] = inventoryValues
  if (!rawHeaders) throw new Error("Inventory sheet empty")

  const headers = rawHeaders.map(normalizeHeader)
  const matchIdIdx = headers.indexOf("match_id")
  const playerIdx = headers.indexOf("player")
  if (matchIdIdx < 0 || playerIdx < 0) {
    throw new Error("Inventory sheet missing required columns")
  }

  const rowIdx = rows.findIndex(
    (row) => row[matchIdIdx]?.trim() === matchId && row[playerIdx]?.trim().toLowerCase() === player.toLowerCase()
  )
  const afterJson = JSON.stringify(inventory)

  if (rowIdx >= 0) {
    const rowNum = rowIdx + 2
    await batchUpdateValues(env, INVENTORY_KEYS.map((key) => {
      const colIdx = headers.indexOf(key)
      return colIdx >= 0 ? { range: `inventory!${colLetter(colIdx)}${rowNum}`, values: [[String(inventory[key])]] } : null
    }).filter((write): write is { range: string; values: string[][] } => write !== null))
  } else {
    const row = rawHeaders.map((_, i) => {
      const header = headers[i]
      if (header === "match_id") return matchId
      if (header === "player") return player
      const key = INVENTORY_KEYS.find((candidate) => candidate === header)
      return key ? String(inventory[key]) : ""
    })
    await appendSheetRow(env, "inventory", row)
  }

  await appendAuditLog(env, actor, auditAction, "inventory", `${matchId}:${player}`, "{}", afterJson).catch(() => {})
  return inventory
}

async function applyInventoryDelta(
  env: Bindings,
  matchId: string,
  player: string,
  delta: Partial<InventoryMap>,
  actor: string,
  auditAction = "inventory_delta",
): Promise<InventoryMap> {
  const records = sheetRowsToRecords(await getSheetValuesSafe(env, "inventory!A1:Z"))
  const current = parseInventoryRecord(records.find((record) =>
    firstValue(record, ["match_id"]) === matchId &&
    firstValue(record, ["player"]).toLowerCase() === player.toLowerCase()
  ))
  for (const [key, rawDelta] of Object.entries(delta) as [keyof InventoryMap, number][]) {
    current[key] = Math.max(0, current[key] + rawDelta)
  }
  return writeInventoryAbsolute(env, matchId, player, current, actor, auditAction)
}

function parseJsonRecord(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {}
  try {
    return toRecord(JSON.parse(raw)) ?? {}
  } catch {
    return {}
  }
}

function normalizeRecipeStatus(record: SheetRecord): RecipeEventStatus {
  if (firstValue(record, ["reverted_at"])) return "reverted"
  const status = firstValue(record, ["status"]).toLowerCase()
  if (status === "active" || status === "resolved" || status === "reverted") return status
  return "resolved"
}

function parseRecipeEventRecord(record: SheetRecord): RecipeEventRecord | null {
  const id = firstValue(record, ["event_id", "id"])
  const matchId = firstValue(record, ["match_id"])
  const player = firstValue(record, ["player_id", "player"])
  const itemId = firstValue(record, ["item_id"])
  if (!id || !matchId || !player || !itemId) return null
  return {
    id,
    matchId,
    player,
    itemId,
    action: firstValue(record, ["action"]) || "use",
    target: firstValue(record, ["target"]),
    payload: parseJsonRecord(firstValue(record, ["payload"])),
    status: normalizeRecipeStatus(record),
    createdAt: firstValue(record, ["created_at"]),
    activatedAt: firstValue(record, ["activated_at"]),
    resolvedAt: firstValue(record, ["resolved_at"]),
    resolution: parseJsonRecord(firstValue(record, ["resolution"])),
    revertedAt: firstValue(record, ["reverted_at"]),
  }
}

async function getRecipeEvents(
  env: Bindings,
  matchId: string,
  ensureHeaders = true,
): Promise<RecipeEventRecord[]> {
  if (ensureHeaders) await ensureSheetWithHeaders(env, "item_events", ITEM_EVENT_HEADERS)
  return sheetRowsToRecords(await getSheetValuesSafe(env, "item_events!A1:ZZ"))
    .map(parseRecipeEventRecord)
    .filter((event): event is RecipeEventRecord => event !== null && event.matchId === matchId)
}

async function appendSheetRecord(
  env: Bindings,
  sheetName: string,
  headers: readonly string[],
  values: Record<string, string>,
): Promise<void> {
  await ensureSheetWithHeaders(env, sheetName, headers)
  const current = await getSheetValues(env, `${sheetName}!A1:ZZ1`)
  const actualHeaders = current[0]?.map(normalizeHeader) ?? [...headers]
  await appendSheetRow(env, sheetName, actualHeaders.map((header) => values[header] ?? ""))
}

async function updateSheetRecordFields(
  env: Bindings,
  sheetName: string,
  idHeader: string,
  id: string,
  fields: Record<string, string>,
): Promise<void> {
  const values = await getSheetValues(env, `${sheetName}!A1:ZZ`)
  const [rawHeaders, ...rows] = values
  if (!rawHeaders) throw new Error(`${sheetName} sheet is empty`)
  const headers = rawHeaders.map(normalizeHeader)
  const idIndex = headers.indexOf(idHeader)
  const rowIndex = rows.findIndex((row) => row[idIndex]?.trim() === id)
  if (idIndex < 0 || rowIndex < 0) throw new Error(`Record ${id} not found in ${sheetName}`)
  const rowNumber = rowIndex + 2
  await batchUpdateValues(env, Object.entries(fields).map(([field, value]) => {
    const column = headers.indexOf(normalizeHeader(field))
    if (column < 0) throw new Error(`Column ${field} not found in ${sheetName}`)
    return { range: `${sheetName}!${colLetter(column)}${rowNumber}`, values: [[value]] }
  }))
}

async function updateRecipeEvent(
  env: Bindings,
  eventId: string,
  fields: Record<string, string>,
): Promise<void> {
  await ensureSheetWithHeaders(env, "item_events", ITEM_EVENT_HEADERS)
  await updateSheetRecordFields(env, "item_events", "event_id", eventId, fields)
}

function itemForEvent(items: SheetRecord[], event: RecipeEventRecord): SheetRecord | undefined {
  return items.find((item) => firstValue(item, ["item_id", "id"]) === event.itemId)
}

function effectTypeForEvent(items: SheetRecord[], event: RecipeEventRecord): string {
  const copied = typeof event.payload.copiedEffectType === "string" ? event.payload.copiedEffectType : ""
  return copied || firstValue(itemForEvent(items, event) ?? {}, ["effect_type"])
}

function itemPayload(item: SheetRecord): Record<string, unknown> {
  if (firstValue(item, ["item_id", "id"]) === "item_11") return { mod: "PS" }
  return parseJsonRecord(firstValue(item, ["effect_payload", "payload"]))
}

async function getItemRecords(env: Bindings): Promise<SheetRecord[]> {
  const records = sheetRowsToRecords(await getSheetValuesSafe(env, "items!A1:Z"))
  for (const builtin of BUILTIN_ITEM_RECORDS) {
    const itemId = firstValue(builtin, ["item_id"])
    if (!records.some((record) => firstValue(record, ["item_id", "id"]) === itemId)) {
      records.push(builtin)
    }
  }
  return records
}

function recipeIdNumber(itemId: string): number {
  return Number(itemId.replace(/^item_/, "")) || 0
}

function recipeCost(item: SheetRecord): InventoryMap {
  return Object.fromEntries(INVENTORY_KEYS.map((key) => [
    key,
    Math.max(0, Number(firstValue(item, [`cost_${key}`, key])) || 0),
  ])) as InventoryMap
}

function samePlayer(left?: string, right?: string): boolean {
  return (left ?? "").trim().toLowerCase() === (right ?? "").trim().toLowerCase()
}

async function setMatchMapStatus(
  env: Bindings,
  matchId: string,
  slot: string,
  status: string,
  player: string,
  playerField?: "picked_by" | "banned_by",
): Promise<void> {
  const values = await getSheetValues(env, "match_maps!A1:Z")
  const [rawHeaders, ...rows] = values
  if (!rawHeaders) throw new Error("match_maps sheet is empty")
  const headers = rawHeaders.map(normalizeHeader)
  const matchIdIndex = headers.indexOf("match_id")
  const slotIndex = headers.indexOf("slot")
  const statusIndex = headers.indexOf("status")
  if (matchIdIndex < 0 || slotIndex < 0 || statusIndex < 0) {
    throw new Error("match_maps sheet missing match_id, slot, or status")
  }
  const rowIndex = rows.findIndex((row) =>
    row[matchIdIndex]?.trim() === matchId &&
    row[slotIndex]?.trim().toLowerCase() === slot.toLowerCase()
  )
  if (rowIndex >= 0) {
    const rowNumber = rowIndex + 2
    const writes = [
      { range: `match_maps!${colLetter(statusIndex)}${rowNumber}`, values: [[status]] },
    ]
    if (playerField) {
      const playerIndex = headers.indexOf(playerField)
      if (playerIndex >= 0) {
        writes.push({ range: `match_maps!${colLetter(playerIndex)}${rowNumber}`, values: [[player]] })
      }
    }
    if (status === "available") {
      for (const field of ["picked_by", "banned_by", "score_a", "score_b", "winner"]) {
        const index = headers.indexOf(field)
        if (index >= 0) writes.push({ range: `match_maps!${colLetter(index)}${rowNumber}`, values: [[""]] })
      }
    }
    await batchUpdateValues(env, writes)
    return
  }

  const record: Record<string, string> = {
    match_id: matchId,
    slot,
    map_id: slot,
    status,
  }
  if (playerField) record[playerField] = player
  await appendSheetRow(env, "match_maps", headers.map((header) => record[header] ?? ""))
}

function publicRecipeEvent(event: RecipeEventRecord): Record<string, unknown> {
  return {
    id: event.id,
    player: event.player,
    recipeId: recipeIdNumber(event.itemId),
    target: event.target || undefined,
    payload: event.payload,
    status: event.status,
    createdAt: event.createdAt,
    activatedAt: event.activatedAt || undefined,
    resolvedAt: event.resolvedAt || undefined,
    resolution: event.resolution,
  }
}

function publicSnapshotRecipe(
  event: RecipeEventRecord,
  items: SheetRecord[],
): Record<string, unknown> {
  const item = itemForEvent(items, event)
  return {
    eventId: event.id,
    recipeId: recipeIdNumber(event.itemId),
    name: firstValue(item ?? {}, ["name"]) || event.itemId,
    status: event.status,
    target: event.target || null,
    createdAt: event.createdAt || null,
    activatedAt: event.activatedAt || null,
    resolvedAt: event.resolvedAt || null,
  }
}

function publicSnapshotRecipesForPlayer(
  events: RecipeEventRecord[],
  items: SheetRecord[],
  player: string,
): Record<string, unknown> {
  const playerEvents = events.filter((event) =>
    samePlayer(event.player, player) && event.status !== "reverted"
  )
  const activeEvents = playerEvents.filter((event) => event.status === "active")
  const current = activeEvents.at(-1)
  const previous = playerEvents.filter((event) => event.status === "resolved").at(-1)
  return {
    current: current ? publicSnapshotRecipe(current, items) : null,
    previous: previous ? publicSnapshotRecipe(previous, items) : null,
    active: activeEvents.map((event) => publicSnapshotRecipe(event, items)),
  }
}

function baseLobbyMods(pool: string, enforceNF: boolean): string {
  const normalized = pool.trim().toUpperCase()
  if (normalized === "FM" || normalized === "TB") return "Freemod"
  if (normalized === "HR") return enforceNF ? "HRNF" : "HR"
  if (normalized === "DT") return enforceNF ? "DTNF" : "DT"
  return enforceNF ? "NF" : "None"
}

function addLobbyMod(base: string, mod: string, enforceNF: boolean): string {
  if (base.toLowerCase() === "freemod") return "Freemod"
  const codes: string[] = (base === "None" ? "" : base)
    .replace(/NF/g, "")
    .match(/[A-Z]{2}/g) ?? []
  if (!codes.includes(mod)) codes.push(mod)
  if (enforceNF && !codes.includes("NF")) codes.push("NF")
  return codes.join("") || "None"
}

type RecipePickSetup = {
  eventIds: string[]
  mods: string
  commandsBefore: string[]
  notices: string[]
}

async function activateRecipesForPick(
  env: Bindings,
  matchId: string,
  player: string,
  slot: string,
  pool: string,
): Promise<RecipePickSetup> {
  const [events, items, configMap] = await Promise.all([
    getRecipeEvents(env, matchId),
    getItemRecords(env),
    getConfigMap(env),
  ])
  const active = events.filter((event) => {
    if (event.status !== "active" || !samePlayer(event.player, player)) return false
    const effectType = effectTypeForEvent(items, event)
    if (effectType === "wildcard_slot") return samePlayer(event.target, slot)
    return MAP_BOUND_EFFECTS.has(effectType) && (!event.target || samePlayer(event.target, slot))
  })
  const now = new Date().toISOString()
  for (const event of active) {
    if (!event.target || !event.activatedAt) {
      await updateRecipeEvent(env, event.id, {
        target: slot,
        activated_at: event.activatedAt || now,
      })
      event.target = slot
      event.activatedAt = event.activatedAt || now
    }
  }

  const enforceNF = configMap.get("enforce nf?")?.toLowerCase() === "true"
  let mods = baseLobbyMods(pool, enforceNF)
  const commandsBefore: string[] = []
  const notices: string[] = []
  const teamMode = teamModeToInt(configMap.get("team mode") ?? "")
  const lobbySize = formatToLobbySize(configMap.get("format") ?? "1v1")

  for (const event of active) {
    const effectType = effectTypeForEvent(items, event)
    const item = itemForEvent(items, event)
    const payload = { ...itemPayload(item ?? {}), ...event.payload }
    if (effectType === "mod_replace" && pool.toUpperCase() === "DT") {
      mods = enforceNF ? "NCNF" : "NC"
    } else if (effectType === "mod_add_self") {
      mods = "Freemod"
      notices.push(`${event.player} must use ${String(payload.mod ?? "")}; the opponent must not add a recipe mod.`)
    } else if (effectType === "mod_add_both") {
      mods = "Freemod"
      notices.push(`Both players must use their selected Custard mods: ${String(payload.modA ?? payload.mod ?? "")} / ${String(payload.modB ?? payload.mod ?? "")}.`)
    } else if (effectType === "mod_force_both") {
      const forcedMod = String(payload.mod ?? "").toUpperCase()
      if (forcedMod === "PS") {
        mods = "Freemod"
        notices.push("Quiche active: both players must enable PS for this map.")
      } else if (forcedMod) {
        mods = addLobbyMod(mods, forcedMod, enforceNF)
      }
    } else if (effectType === "accuracy_mode") {
      commandsBefore.push(`!mp set ${teamMode} 1 ${lobbySize}`)
    } else if (effectType === "scoring_mode") {
      commandsBefore.push(`!mp set ${teamMode} 0 ${lobbySize}`)
    }
  }

  return { eventIds: active.map((event) => event.id), mods, commandsBefore, notices }
}

function getMapPoolForSlot(poolRecords: SheetRecord[], slot: string): string {
  const record = poolRecords.find((r) => firstValue(r, ["map_id", "slot"]).toLowerCase() === slot.toLowerCase())
  return firstValue(record ?? {}, ["mod_pool", "pool"]).toUpperCase()
}

app.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (path === "/api/health" || path.startsWith("/api/public/") || path.startsWith("/api/auth/")) {
    return next()
  }

  const sessionUser = await readSessionUser(c)
  if (!sessionUser) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  // Demo sessions (osuId === 0) cannot perform write actions
  const WRITE_PREFIXES = ["/api/irc/send", "/api/match/"]
  const isWriteRoute = c.req.method !== "GET" && WRITE_PREFIXES.some((p) => path.startsWith(p))
  if (isWriteRoute && sessionUser.osuId === 0) {
    return c.json({ error: "Demo mode: actions disabled" }, 403)
  }

  return next()
})

app.get("/api/auth/osu/login", (c) => {
  try {
    const clientId = mustEnv(c.env, "OSU_CLIENT_ID")
    const redirectUri = resolveOsuRedirectUri(c)
    const state = randomHex(24)

    setCookie(c, OAUTH_STATE_COOKIE_NAME, state, oauthStateCookieOptions(c.req.url))

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify",
      state,
    })

    return c.redirect(`${OSU_AUTH_BASE}/oauth/authorize?${params.toString()}`)
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "OAuth login init failed",
      },
      500
    )
  }
})

app.get("/api/auth/debug", (c) => {
  if (!isLocalRequest(c.req.url)) {
    return c.json({ error: "Not found" }, 404)
  }

  const clientSecret = c.env.OSU_CLIENT_SECRET?.trim() ?? ""
  const googleCredentials = c.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ?? ""

  return c.json({
    osuClientId: c.env.OSU_CLIENT_ID?.trim() ?? null,
    osuRedirectUri: c.env.OSU_REDIRECT_URI?.trim() ?? null,
    hasOsuClientSecret: clientSecret.length > 0,
    osuClientSecretLength: clientSecret.length,
    hasOsuProxyBase: Boolean(c.env.OSU_PROXY_BASE?.trim()),
    hasOsuProxySecret: Boolean(c.env.OSU_PROXY_SECRET?.trim()),
    hasSessionSecret: Boolean(c.env.SESSION_SECRET?.trim()),
    hasGoogleSheetId: Boolean(c.env.GOOGLE_SHEETS_TOURNAMENT_ID?.trim()),
    googleCredentialsMode: googleCredentials.startsWith("{") ? "json" : "path",
  })
})

app.get("/api/auth/session/debug", async (c) => {
  if (!isLocalRequest(c.req.url)) {
    return c.json({ error: "Not found" }, 404)
  }

  const session = await inspectSession(c)
  return c.json({
    hasSessionSecret: Boolean(getSessionSecret(c.env)),
    hasCookie: session.hasCookie,
    tokenLength: session.tokenLength,
    authenticated: Boolean(session.user),
    user: session.user
      ? {
          username: session.user.username,
          osu_id: session.user.osuId,
        }
      : null,
    verifyError: session.verifyError,
  })
})

app.get("/api/auth/osu/preflight", async (c) => {
  if (!isLocalRequest(c.req.url)) {
    return c.json({ error: "Not found" }, 404)
  }

  try {
    const clientId = mustEnv(c.env, "OSU_CLIENT_ID")
    const clientSecret = mustEnv(c.env, "OSU_CLIENT_SECRET")
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "public",
    })

    const tokenRes = await fetchOsu(c.env, "/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    })

    if (!tokenRes.ok) {
      return c.json({
        ok: false,
        status: tokenRes.status,
        osuClientId: clientId,
        osuRedirectUri: c.env.OSU_REDIRECT_URI?.trim() ?? null,
        response: await tokenRes.json().catch(() => null),
      }, 502)
    }

    const tokenJson = toRecord(await tokenRes.json())
    return c.json({
      ok: true,
      status: tokenRes.status,
      osuClientId: clientId,
      osuRedirectUri: c.env.OSU_REDIRECT_URI?.trim() ?? null,
      tokenType: tokenJson && typeof tokenJson.token_type === "string" ? tokenJson.token_type : null,
      expiresIn: tokenJson && typeof tokenJson.expires_in === "number" ? tokenJson.expires_in : null,
    })
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : "osu! preflight failed",
    }, 500)
  }
})

async function handleOsuCallback(c: AppContext) {
  const oauthState = c.req.query("state")
  const oauthCode = c.req.query("code")
  const oauthError = c.req.query("error")
  const expectedState = getCookie(c, OAUTH_STATE_COOKIE_NAME)

  deleteCookie(c, OAUTH_STATE_COOKIE_NAME, { path: "/" })

  if (oauthError) {
    return c.text(`osu! authorization failed: ${oauthError}`, 400)
  }

  if (!oauthState || !expectedState || oauthState !== expectedState) {
    return c.text("Invalid OAuth state", 400)
  }

  if (!oauthCode) {
    return c.text("Missing OAuth code", 400)
  }

  try {
    const redirectUri = resolveOsuRedirectUri(c)
    const accessToken = await exchangeOsuCodeForToken(c.env, oauthCode, redirectUri)
    const osuUser = await fetchOsuUser(accessToken, c.env)
    const accessRows = await getAccessRows(c.env)
    const allowedRow = findAuthorizedAccessRow(accessRows, osuUser)

    if (allowedRow === null) {
      return c.text("403 Forbidden", 403)
    }

    await updateLastAccessedAt(c.env, allowedRow)

    const sessionSecret = mustEnv(c.env, "SESSION_SECRET")
    const sessionToken = await issueSessionToken(sessionSecret, {
      username: osuUser.username,
      osuId: osuUser.id,
    })

    setCookie(c, SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions(c.req.url))

    return c.redirect("/", 302)
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "OAuth callback failed",
      },
      500
    )
  }
}

app.get("/api/auth/osu/callback", handleOsuCallback)
app.get("/auth/callback", handleOsuCallback)

app.get("/api/auth/session", async (c) => {
  const sessionUser = await readSessionUser(c)
  if (!sessionUser) {
    return c.json({ authenticated: false }, 401)
  }
  return c.json({
    authenticated: true,
    user: {
      username: sessionUser.username,
      osu_id: sessionUser.osuId,
    },
  })
})

app.post("/api/auth/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" })
  return c.json({ ok: true })
})

app.get("/api/matches", async (c) => {
  const sessionUser = await readSessionUser(c)
  if (!sessionUser) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  try {
    const matches = await getMatches(c.env)
    const yourMatches = matches.filter((match) =>
      refereeMatchesNotes(match.referee ?? "", sessionUser.username)
    )
    const activeMatches = matches.filter(isActiveMatch)

    return c.json({
      matches,
      yourMatches,
      activeMatches,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load matches",
      },
      500
    )
  }
})

app.get("/api/match/:matchId/mappool", async (c) => {
  const matchId = c.req.param("matchId")
  const mappoolId = c.req.query("mappool") ?? ""
  const playerA   = c.req.query("playerA") ?? ""
  const playerB   = c.req.query("playerB") ?? ""

  try {
    const [poolValues, matchMapValues] = await Promise.all([
      getSheetValuesSafe(c.env, "mappool!A1:Z"),
      getSheetValuesSafe(c.env, "match_maps!A1:Z"),
    ])

    const poolRecords     = sheetRowsToRecords(poolValues)
    const matchMapRecords = sheetRowsToRecords(matchMapValues)

    const roundMaps = mappoolId
      ? poolRecords.filter((r) => r["round"]?.trim().toLowerCase() === mappoolId.trim().toLowerCase())
      : poolRecords

    const overrides = new Map<string, SheetRecord>()
    matchMapRecords
      .filter((r) => r["match_id"]?.trim() === matchId)
      .forEach((r) => { overrides.set(r["slot"]?.trim() ?? "", r) })

    const mappool: ApiPoolMap[] = roundMaps.map((r) => {
      const slot = r["map_id"]?.trim() ?? ""
      const ov   = overrides.get(slot)
      const beatmapId = r["beatmap_id"]?.trim() || undefined
      return {
        slot,
        pool:      r["mod_pool"]?.trim().toUpperCase() ?? "",
        map:       r["title"]?.trim() ?? "",
        beatmapId,
        status:    ov?.["status"]?.trim() || "available",
        pickedBy:  ov?.["picked_by"]?.trim() || undefined,
        bannedBy:  ov?.["banned_by"]?.trim() || undefined,
        winner:    ov?.["winner"]?.trim() || undefined,
      }
    })

    const matchMaps = matchMapRecords.filter((r) => r["match_id"]?.trim() === matchId)
    const scoreA = matchMaps.filter((r) => r["winner"]?.trim() === playerA).length
    const scoreB = matchMaps.filter((r) => r["winner"]?.trim() === playerB).length

    return c.json({ mappool, scoreA, scoreB })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to load mappool" }, 500)
  }
})

app.get("/api/match/:matchId/inventory", async (c) => {
  const matchId = c.req.param("matchId")
  const playerA = c.req.query("playerA") ?? ""
  const playerB = c.req.query("playerB") ?? ""
  const INGREDIENT_KEYS = ["egg", "sugar", "butter", "flour", "milk"] as const

  try {
    const inventoryValues = await getSheetValuesSafe(c.env, "inventory!A1:Z")
    const records = sheetRowsToRecords(inventoryValues).filter(
      (r) => r["match_id"]?.trim() === matchId
    )

    function parsePlayer(player: string): Record<string, number> {
      const row = records.find(
        (r) => r["player"]?.trim().toLowerCase() === player.trim().toLowerCase()
      )
      return Object.fromEntries(
        INGREDIENT_KEYS.map((k) => [k, Number(row?.[k] ?? 0) || 0])
      )
    }

    return c.json({ a: parsePlayer(playerA), b: parsePlayer(playerB) })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to load inventory" }, 500)
  }
})

app.put("/api/match/:matchId/inventory", async (c) => {
  const matchId = c.req.param("matchId")
  const INGREDIENT_KEYS = ["egg", "sugar", "butter", "flour", "milk"] as const

  let body: Record<string, unknown>
  try {
    body = await c.req.json() as Record<string, unknown>
  } catch {
    return c.json({ error: "Invalid JSON" }, 400)
  }

  const player = typeof body.player === "string" ? body.player.trim() : ""
  if (!player) return c.json({ error: "player required" }, 400)

  try {
    const sheetId = mustEnv(c.env, "GOOGLE_SHEETS_TOURNAMENT_ID")
    const inventoryValues = await getSheetValuesSafe(c.env, "inventory!A1:Z")
    const [rawHeaders, ...rows] = inventoryValues
    if (!rawHeaders) return c.json({ error: "Inventory sheet empty" }, 500)

    const headers = rawHeaders.map(normalizeHeader)
    const matchIdIdx = headers.indexOf("match_id")
    const playerIdx = headers.indexOf("player")
    if (matchIdIdx < 0 || playerIdx < 0) {
      return c.json({ error: "Inventory sheet missing required columns" }, 500)
    }

    const ingValues = INGREDIENT_KEYS.map((k) => String(Math.max(0, Number(body[k]) || 0)))
    const ingAfter = Object.fromEntries(INGREDIENT_KEYS.map((k, i) => [k, ingValues[i]]))

    const rowIdx = rows.findIndex(
      (r) => r[matchIdIdx]?.trim() === matchId && r[playerIdx]?.trim().toLowerCase() === player.toLowerCase()
    )

    if (rowIdx >= 0) {
      const sheetRowNum = rowIdx + 2
      const data: { range: string; values: string[][] }[] = []
      INGREDIENT_KEYS.forEach((k, i) => {
        const colIdx = headers.indexOf(k)
        if (colIdx >= 0) data.push({ range: `inventory!${colLetter(colIdx)}${sheetRowNum}`, values: [[ingValues[i]]] })
      })
      if (data.length > 0) {
        const accessToken = await getGoogleAccessToken(c.env)
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ valueInputOption: "RAW", data }),
        })
        if (!res.ok) {
          const reason = await res.text()
          throw new Error(`Sheets batch write failed: ${res.status} ${reason}`)
        }
      }
    } else {
      const newRow = rawHeaders.map((_, i) => {
        const h = headers[i]
        if (h === "match_id") return matchId
        if (h === "player") return player
        const ing = INGREDIENT_KEYS.find((k) => k === h)
        if (ing) return String(Math.max(0, Number(body[ing]) || 0))
        return ""
      })
      await appendSheetRow(c.env, "inventory", newRow)
    }

    await appendAuditLog(c.env, "ref", "inventory_update", "inventory", `${matchId}:${player}`, "{}", JSON.stringify(ingAfter))

    return c.json({ ok: true })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to update inventory" }, 500)
  }
})

app.get("/api/match/:matchId/state", async (c) => {
  const matchId = c.req.param("matchId")

  try {
    const match = await getMatchById(c.env, matchId)
    const state = await getMatchFlowState(c.env, matchId, Boolean(match?.lobbyUrl))
    return c.json({ state })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to load match state" }, 500)
  }
})

app.post("/api/match/:matchId/state", async (c) => {
  const matchId = c.req.param("matchId")
  const sessionUser = await readSessionUser(c)

  let body: Record<string, unknown>
  try {
    body = await c.req.json() as Record<string, unknown>
  } catch {
    return c.json({ error: "Invalid JSON" }, 400)
  }

  const action = typeof body.action === "string" ? body.action : ""

  try {
    const match = await getMatchById(c.env, matchId)
    if (!match) return c.json({ error: "Match not found" }, 404)
    const state = await getMatchFlowState(c.env, matchId, Boolean(match.lobbyUrl))
    let nextState: MatchFlowState = state

    if (action === "record_rolls") {
      const rollA = Number(body.rollA)
      const rollB = Number(body.rollB)
      if (!Number.isFinite(rollA) || !Number.isFinite(rollB)) {
        return c.json({ error: "rollA and rollB required" }, 400)
      }
      if (rollA === rollB) {
        nextState = { ...state, phase: "roll", rollA, rollB, rollWinner: undefined, turnPlayer: undefined }
      } else {
        const rollWinner = rollA > rollB ? match.playerA : match.playerB
        nextState = { ...state, phase: "order", rollA, rollB, rollWinner, turnPlayer: rollWinner }
      }
    } else if (action === "choose_order") {
      const choice = typeof body.choice === "string" ? body.choice : ""
      const chooser = state.rollWinner
      if (!chooser) return c.json({ error: "Roll winner is required before choosing order" }, 400)
      if (choice !== "pick_first" && choice !== "ban_first") {
        return c.json({ error: "choice must be pick_first or ban_first" }, 400)
      }
      const other = opponentOf(chooser, match.playerA, match.playerB)
      const firstPicker = choice === "pick_first" ? chooser : other
      const firstBanner = choice === "ban_first" ? chooser : other
      nextState = { ...state, phase: "home_mod", firstPicker, firstBanner, turnPlayer: firstPicker }
    } else if (action === "set_home_mod") {
      const player = typeof body.player === "string" ? body.player.trim() : ""
      const homeMod = normalizeHomeMod(body.homeMod)
      if (!player || !homeMod) return c.json({ error: "player and valid homeMod required" }, 400)
      if (state.phase !== "home_mod") return c.json({ error: "Home mods are not open right now" }, 409)
      if (state.turnPlayer && state.turnPlayer.toLowerCase() !== player.toLowerCase()) {
        return c.json({ error: `${state.turnPlayer} must choose home mod next` }, 409)
      }
      const isA = player.toLowerCase() === match.playerA.toLowerCase()
      const updated: MatchFlowState = { ...state, ...(isA ? { homeModA: homeMod } : { homeModB: homeMod }) }
      const other = opponentOf(player, match.playerA, match.playerB)
      const otherHasHomeMod = other.toLowerCase() === match.playerA.toLowerCase() ? updated.homeModA : updated.homeModB
      if (!otherHasHomeMod) {
        nextState = { ...updated, phase: "home_mod", turnPlayer: other }
      } else {
        nextState = { ...updated, phase: "ban", turnPlayer: updated.firstBanner }
      }
    } else {
      return c.json({ error: "Unknown state action" }, 400)
    }

    const saved = await writeMatchFlowState(c.env, nextState)
    await appendAuditLog(
      c.env,
      sessionUser?.username ?? "unknown",
      `match_state_${action}`,
      "match_state",
      matchId,
      JSON.stringify(state),
      JSON.stringify(saved),
    ).catch(() => {})
    return c.json({ ok: true, state: saved })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to update match state" }, 500)
  }
})

app.post("/api/match/:matchId/score", async (c) => {
  const matchId = c.req.param("matchId")
  const sessionUser = await readSessionUser(c)

  let body: Record<string, unknown>
  try {
    body = await c.req.json() as Record<string, unknown>
  } catch {
    return c.json({ error: "Invalid JSON" }, 400)
  }

  const slot = typeof body.slot === "string" ? body.slot.trim() : ""
  const playerA = typeof body.playerA === "string" ? body.playerA.trim() : ""
  const playerB = typeof body.playerB === "string" ? body.playerB.trim() : ""
  const rawScoreA = Number(body.scoreA)
  const rawScoreB = Number(body.scoreB)
  if (!slot || !playerA || !playerB || !Number.isFinite(rawScoreA) || !Number.isFinite(rawScoreB)) {
    return c.json({ error: "slot, playerA, playerB, scoreA, and scoreB required" }, 400)
  }

  try {
    const match = await getMatchById(c.env, matchId)
    if (!match) return c.json({ error: "Match not found" }, 404)
    if (!samePlayer(playerA, match.playerA) || !samePlayer(playerB, match.playerB)) {
      return c.json({ error: "Score players must match player A and player B for this match" }, 400)
    }
    if (rawScoreA < 0 || rawScoreB < 0) {
      return c.json({ error: "Scores cannot be negative" }, 400)
    }
    const matchMapsValues = await getSheetValues(c.env, "match_maps!A1:Z")
    const [headers, ...rows] = matchMapsValues
    if (!headers) return c.json({ error: "match_maps sheet empty" }, 500)
    const norm = headers.map(normalizeHeader)
    const idx = (name: string) => norm.indexOf(name)
    const matchIdIdx = idx("match_id")
    const slotIdx = idx("slot")
    const mapIdIdx = idx("map_id")
    const scoreAIdx = idx("score_a")
    const scoreBIdx = idx("score_b")
    const winnerIdx = idx("winner")
    const statusIdx = idx("status")
    const existingRowIdx = rows.findIndex((row) => row[matchIdIdx]?.trim() === matchId && row[slotIdx]?.trim() === slot)
    const beforeRow = existingRowIdx >= 0 ? rows[existingRowIdx] : undefined
    const beforeJson = beforeRow ? JSON.stringify(beforeRow) : "{}"
    const wasCompleted = beforeRow?.[statusIdx]?.trim().toLowerCase() === "completed"
    if (wasCompleted) return c.json({ error: "This map result is already completed" }, 409)

    const [recipeEvents, items, poolValues, configMap, flowBefore] = await Promise.all([
      getRecipeEvents(c.env, matchId),
      getItemRecords(c.env),
      getSheetValuesSafe(c.env, "mappool!A1:Z"),
      getConfigMap(c.env),
      getMatchFlowState(c.env, matchId, Boolean(match.lobbyUrl)),
    ])
    const activeEvents = recipeEvents.filter((event) =>
      event.status === "active" && samePlayer(event.target, slot)
    )
    const effect = (event: RecipeEventRecord): string => effectTypeForEvent(items, event)
    const payloadFor = (event: RecipeEventRecord): Record<string, unknown> => ({
      ...itemPayload(itemForEvent(items, event) ?? {}),
      ...event.payload,
    })

    const applyScoreEffects = (inputA: number, inputB: number): { scoreA: number; scoreB: number } => {
      let scoreA = inputA
      let scoreB = inputB
      for (const event of activeEvents) {
        if (effect(event) !== "score_add") continue
        const amount = Number(payloadFor(event).amount) || 0
        if (samePlayer(event.player, playerA)) scoreA += amount
        if (samePlayer(event.player, playerB)) scoreB += amount
      }
      for (const event of activeEvents) {
        if (effect(event) !== "score_multiply") continue
        const multiplier = Number(payloadFor(event).multiplier) || 1
        if (samePlayer(event.player, playerA)) scoreA = Math.round(scoreA * multiplier)
        if (samePlayer(event.player, playerB)) scoreB = Math.round(scoreB * multiplier)
      }
      return { scoreA, scoreB }
    }

    const currentAdjusted = applyScoreEffects(rawScoreA, rawScoreB)
    const replayEvents = activeEvents.filter((event) =>
      effect(event) === "replay_top_score" || effect(event) === "conditional_replay"
    )
    const storedReplay = replayEvents
      .map((event) => toRecord(event.resolution.firstRun))
      .find((run) => run && Number.isFinite(Number(run.scoreA)) && Number.isFinite(Number(run.scoreB)))
    const bananaBreadActive = replayEvents.some((event) => effect(event) === "replay_top_score")
    const bubbleTeaEligible = replayEvents.some((event) => {
      if (effect(event) !== "conditional_replay") return false
      const maxGap = Number(payloadFor(event).max_gap ?? payloadFor(event).maxGap ?? 10_000) || 10_000
      return Math.abs(currentAdjusted.scoreA - currentAdjusted.scoreB) <= maxGap
    })

    if (!storedReplay && (bananaBreadActive || bubbleTeaEligible)) {
      const now = new Date().toISOString()
      for (const event of replayEvents) {
        if (effect(event) === "replay_top_score" || bubbleTeaEligible) {
          await updateRecipeEvent(c.env, event.id, {
            activated_at: event.activatedAt || now,
            resolution: JSON.stringify({
              ...event.resolution,
              firstRun: { scoreA: rawScoreA, scoreB: rawScoreB },
              replayReason: effect(event),
            }),
          })
        }
      }
      return c.json({
        ok: true,
        replayRequired: true,
        slot,
        rawScores: { scoreA: rawScoreA, scoreB: rawScoreB },
        adjustedScores: currentAdjusted,
        state: flowBefore,
        notices: ["Replay this map. Active map recipes remain applied for the replay."],
      })
    }

    let scoreA = currentAdjusted.scoreA
    let scoreB = currentAdjusted.scoreB
    if (storedReplay && bananaBreadActive) {
      const firstAdjusted = applyScoreEffects(Number(storedReplay.scoreA), Number(storedReplay.scoreB))
      scoreA = Math.max(firstAdjusted.scoreA, currentAdjusted.scoreA)
      scoreB = Math.max(firstAdjusted.scoreB, currentAdjusted.scoreB)
    }
    if (scoreA === scoreB) return c.json({ error: "Adjusted scores are tied; resolve the tie before submitting" }, 409)
    const winner = scoreA > scoreB ? playerA : playerB
    const loser = samePlayer(winner, playerA) ? playerB : playerA
    const margin = Math.abs(scoreA - scoreB)

    if (existingRowIdx >= 0) {
      const rowNum = existingRowIdx + 2
      await batchUpdateValues(c.env, [
        scoreAIdx >= 0 ? { range: `match_maps!${colLetter(scoreAIdx)}${rowNum}`, values: [[String(scoreA)]] } : null,
        scoreBIdx >= 0 ? { range: `match_maps!${colLetter(scoreBIdx)}${rowNum}`, values: [[String(scoreB)]] } : null,
        winnerIdx >= 0 ? { range: `match_maps!${colLetter(winnerIdx)}${rowNum}`, values: [[winner]] } : null,
        statusIdx >= 0 ? { range: `match_maps!${colLetter(statusIdx)}${rowNum}`, values: [["completed"]] } : null,
      ].filter((write): write is { range: string; values: string[][] } => write !== null))
    } else {
      const newRow = new Array(Math.max(norm.length, 9)).fill("")
      if (matchIdIdx >= 0) newRow[matchIdIdx] = matchId
      if (slotIdx >= 0) newRow[slotIdx] = slot
      if (mapIdIdx >= 0) newRow[mapIdIdx] = slot
      if (scoreAIdx >= 0) newRow[scoreAIdx] = String(scoreA)
      if (scoreBIdx >= 0) newRow[scoreBIdx] = String(scoreB)
      if (winnerIdx >= 0) newRow[winnerIdx] = winner
      if (statusIdx >= 0) newRow[statusIdx] = "completed"
      await appendSheetRow(c.env, "match_maps", newRow)
    }

    const matchMapRecordsBefore = sheetRowsToRecords(matchMapsValues)
    const totals = {
      scoreA: countCompletedWins(matchMapRecordsBefore, matchId, playerA) + (!wasCompleted && winner === playerA ? 1 : 0),
      scoreB: countCompletedWins(matchMapRecordsBefore, matchId, playerB) + (!wasCompleted && winner === playerB ? 1 : 0),
    }

    const poolRecords = sheetRowsToRecords(poolValues)
    const pool = getMapPoolForSlot(poolRecords, slot)
    const ingredient = POOL_TO_INGREDIENT[pool]
    if (ingredient) {
      await applyInventoryDelta(c.env, matchId, winner, { [ingredient]: 1 }, sessionUser?.username ?? "unknown", "map_win_ingredient")
    }

    const now = new Date().toISOString()
    const restoreCommands: string[] = []
    const teamMode = teamModeToInt(configMap.get("team mode") ?? "")
    const scoringMode = scoringModeToInt(configMap.get("scoring") ?? "")
    const lobbySize = formatToLobbySize(configMap.get("format") ?? "1v1")

    for (const event of activeEvents) {
      const effectType = effect(event)
      const payload = payloadFor(event)
      const resolution: Record<string, unknown> = {
        ...event.resolution,
        slot,
        rawScores: { scoreA: rawScoreA, scoreB: rawScoreB },
        finalScores: { scoreA, scoreB },
        winner,
      }

      if (effectType === "win_bonus_steal") {
        const selected = String(payload.ingredient ?? "") as IngredientKey
        const threshold = Number(payload.threshold) || 200_000
        if (samePlayer(event.player, winner) && margin > threshold && INVENTORY_KEYS.includes(selected)) {
          await applyInventoryDelta(c.env, matchId, loser, { [selected]: -1 }, sessionUser?.username ?? "unknown", "dough_steal")
          resolution.stolenIngredient = selected
        } else {
          resolution.triggered = false
        }
      } else if (effectType === "home_base_ingredient") {
        const homeMod = samePlayer(event.player, match.playerA) ? flowBefore.homeModA : flowBefore.homeModB
        const homeIngredient = homeMod ? POOL_TO_INGREDIENT[homeMod] : undefined
        if (homeIngredient && homeMod !== pool.toUpperCase()) {
          await applyInventoryDelta(c.env, matchId, event.player, { [homeIngredient]: 1 }, sessionUser?.username ?? "unknown", "hot_chocolate_bonus")
          resolution.bonusIngredient = homeIngredient
        } else {
          resolution.triggered = false
        }
      } else if (effectType === "comeback_bonus") {
        if (ingredient && samePlayer(event.player, winner)) {
          await applyInventoryDelta(c.env, matchId, event.player, { [ingredient]: 1 }, sessionUser?.username ?? "unknown", "shortbread_bonus")
          resolution.bonusIngredient = ingredient
        } else {
          resolution.triggered = false
        }
      } else if (effectType === "wildcard_slot") {
        const rewards = Array.isArray(payload.rewardIngredients) ? payload.rewardIngredients : []
        const delta: Partial<InventoryMap> = {}
        for (const raw of rewards) {
          const reward = String(raw) as IngredientKey
          if (INVENTORY_KEYS.includes(reward)) delta[reward] = (delta[reward] ?? 0) + 1
        }
        if (Object.keys(delta).length > 0) {
          await applyInventoryDelta(c.env, matchId, winner, delta, sessionUser?.username ?? "unknown", "caramel_reward")
          resolution.rewardIngredients = rewards
        }
      }

      if (effectType === "accuracy_mode" || effectType === "scoring_mode") {
        const restore = `!mp set ${teamMode} ${scoringMode} ${lobbySize}`
        if (!restoreCommands.includes(restore)) restoreCommands.push(restore)
      }

      await updateRecipeEvent(c.env, event.id, {
        status: "resolved",
        resolved_at: now,
        resolution: JSON.stringify(resolution),
      })
    }

    const inventoryRecords = sheetRowsToRecords(await getSheetValuesSafe(c.env, "inventory!A1:Z"))
    const inventories = {
      a: parseInventoryRecord(inventoryRecords.find((record) =>
        firstValue(record, ["match_id"]) === matchId &&
        samePlayer(firstValue(record, ["player", "player_id"]), playerA)
      )),
      b: parseInventoryRecord(inventoryRecords.find((record) =>
        firstValue(record, ["match_id"]) === matchId &&
        samePlayer(firstValue(record, ["player", "player_id"]), playerB)
      )),
    }

    const winsNeeded = Math.ceil((match.bestOf ?? 5) / 2)
    const matchOver = totals.scoreA >= winsNeeded || totals.scoreB >= winsNeeded
    const flowState = await writeMatchFlowState(c.env, {
      ...(await getMatchFlowState(c.env, matchId, Boolean(match?.lobbyUrl))),
      phase: matchOver ? "ready_result" : "craft",
      turnPlayer: matchOver ? undefined : opponentOf(winner, playerA, playerB),
      currentSlot: undefined,
    })

    await appendAuditLog(
      c.env,
      sessionUser?.username ?? "unknown",
      "score",
      "match_map",
      `${matchId}:${slot}`,
      beforeJson,
      JSON.stringify({ slot, rawScoreA, rawScoreB, scoreA, scoreB, winner, status: "completed", pool, ingredient }),
    ).catch(() => {})

    return c.json({
      ok: true,
      slot,
      scoreA,
      scoreB,
      winner,
      totals,
      pool,
      ingredient,
      inventories,
      state: flowState,
      restoreCommands,
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Score update failed" }, 500)
  }
})

async function buildAndPostResultEmbed(
  env: Bindings,
  matchId: string,
  playerA: string,
  playerB: string,
  scoreA: number,
  scoreB: number,
  winner: string,
): Promise<void> {
  const configMap = await getConfigMap(env)
  const resultWebhook = configMap.get("result webhook")?.trim()
  if (!resultWebhook) return

  const abbreviation = configMap.get("abbreviation") ?? "MWS"
  const match        = await getMatchById(env, matchId)
  const round        = match?.round ?? ""
  const lobbyUrl     = match?.lobbyUrl ?? ""
  const mpId         = lobbyUrl.match(/\/mp\/(\d+)/)?.[1] ?? (/^\d+$/.test(lobbyUrl.trim()) ? lobbyUrl.trim() : undefined)

  const [matchMapValues, itemEventValues, itemRecords] = await Promise.all([
    getSheetValuesSafe(env, "match_maps!A1:Z"),
    getSheetValuesSafe(env, "item_events!A1:ZZ"),
    getItemRecords(env),
  ])
  const matchMaps   = sheetRowsToRecords(matchMapValues)
    .filter((r) => firstValue(r, ["match_id"]) === matchId)
  const itemEvents  = sheetRowsToRecords(itemEventValues)
    .filter((r) =>
      firstValue(r, ["match_id"]) === matchId &&
      firstValue(r, ["action"]) === "use" &&
      !firstValue(r, ["reverted_at"]) &&
      firstValue(r, ["status"]).toLowerCase() !== "reverted"
    )
  const itemNameMap = new Map<string, string>()
  for (const r of itemRecords) {
    const id   = firstValue(r, ["item_id", "id"])
    const name = firstValue(r, ["name"])
    if (id && name) itemNameMap.set(id, name)
  }

  const bans  = matchMaps.filter((r) => firstValue(r, ["status"]) === "banned")
  const picks = matchMaps.filter((r) => firstValue(r, ["status"]) === "completed")

  // osu! API — match duration (best-effort)
  let durationStr = ""
  if (mpId) {
    try {
      const clientId     = env.OSU_CLIENT_ID?.trim()
      const clientSecret = env.OSU_CLIENT_SECRET?.trim()
      if (clientId && clientSecret) {
        const tokenRes = await fetchOsu(env, "/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials", scope: "public" }),
        })
        if (tokenRes.ok) {
          const tokenJson = await tokenRes.json() as { access_token?: string }
          const token = tokenJson.access_token
          if (token) {
            const mpRes = await fetchOsu(env, `/api/v2/matches/${mpId}`, {
              headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            })
            if (mpRes.ok) {
              const mpData = await mpRes.json() as { match?: { start_time?: string; end_time?: string } }
              const start = mpData.match?.start_time
              const end   = mpData.match?.end_time
              if (start && end) {
                const totalMin = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
                const h = Math.floor(totalMin / 60)
                const m = totalMin % 60
                durationStr = h > 0 ? `${h}h ${m}m` : `${m}m`
              }
            }
          }
        }
      }
    } catch { /* best-effort */ }
  }

  const eA = "🔴"
  const eB = "🔵"
  const pEmoji = (name: string) => name.toLowerCase() === playerA.toLowerCase() ? eA : eB
  const winnerIsA = winner.toLowerCase() === playerA.toLowerCase()

  const bansGrouped = new Map<string, string[]>()
  for (const r of bans) {
    const slot = firstValue(r, ["slot"])
    const by   = firstValue(r, ["banned_by"])
    const key  = pEmoji(by)
    bansGrouped.set(key, [...(bansGrouped.get(key) ?? []), `\`${slot}\``])
  }
  const bansValue = bansGrouped.size > 0
    ? [...bansGrouped.entries()].map(([emoji, slots]) => `${emoji} ${slots.join(", ")}`).join("\n")
    : "None"

  const picksValue = picks.length > 0
    ? picks.map((r) => {
        const slot     = firstValue(r, ["slot"])
        const pickedBy = firstValue(r, ["picked_by"])
        const mapWon   = firstValue(r, ["winner"])
        return `${pEmoji(pickedBy)} \`${slot}\` - ${pEmoji(mapWon)}`
      }).join("\n")
    : "None"

  // Recipes used grouped by player
  const recipesA = itemEvents
    .filter((r) => firstValue(r, ["player_id", "player"]).toLowerCase() === playerA.toLowerCase())
    .map((r) => itemNameMap.get(firstValue(r, ["item_id"])) ?? firstValue(r, ["item_id"]))
    .filter(Boolean)
  const recipesB = itemEvents
    .filter((r) => firstValue(r, ["player_id", "player"]).toLowerCase() === playerB.toLowerCase())
    .map((r) => itemNameMap.get(firstValue(r, ["item_id"])) ?? firstValue(r, ["item_id"]))
    .filter(Boolean)
  const recipesValue = [
    ...(recipesA.length > 0 ? [`${eA} ${recipesA.join(", ")}`] : []),
    ...(recipesB.length > 0 ? [`${eB} ${recipesB.join(", ")}`] : []),
  ].join("\n") || "None"

  const embedColor = winnerIsA ? 0xa4564e : 0x6f8ea5
  const scoreLine = winnerIsA
    ? `### 🏆 ${eA} **${playerA}**  \`${scoreA}\` - \`${scoreB}\`  **${playerB}** ${eB}`
    : `### ${eA} **${playerA}**  \`${scoreA}\` - \`${scoreB}\`  **${playerB}** ${eB} 🏆`
  const mpLine     = mpId ? `https://osu.ppy.sh/mp/${mpId}` : null
  const scoreStr   = [scoreLine, mpLine].filter(Boolean).join("\n")
  const footerParts: string[] = []
  if (durationStr) footerParts.push(`Duration: ${durationStr}`)

  const roundPart = round ? `${round} - ` : ""
  const title     = `${abbreviation} ${roundPart}Match ${matchId}`

  const fields = [
    { name: "Bans",            value: bansValue,    inline: true },
    { name: "Picks - Winner",  value: picksValue,   inline: true },
    ...(recipesValue !== "None" ? [{ name: "Recipes used", value: recipesValue, inline: false }] : []),
  ]

  await fetch(resultWebhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title,
        color:       embedColor,
        description: scoreStr,
        fields,
        footer:      footerParts.length > 0 ? { text: footerParts.join(" · ") } : undefined,
        timestamp:   new Date().toISOString(),
      }],
    }),
  }).catch(() => {})
}

app.post("/api/match/:matchId/post-result", async (c) => {
  const matchId = c.req.param("matchId")
  const sessionUser = await readSessionUser(c)

  let body: Record<string, unknown>
  try {
    body = await c.req.json() as Record<string, unknown>
  } catch {
    return c.json({ error: "Invalid JSON" }, 400)
  }

  const playerA = typeof body.playerA === "string" ? body.playerA.trim() : ""
  const playerB = typeof body.playerB === "string" ? body.playerB.trim() : ""
  if (!playerA || !playerB) return c.json({ error: "playerA and playerB required" }, 400)


  try {
    const matchMapRecords = sheetRowsToRecords(await getSheetValuesSafe(c.env, "match_maps!A1:Z"))
    const scoreA = Number(body.scoreA ?? countCompletedWins(matchMapRecords, matchId, playerA))
    const scoreB = Number(body.scoreB ?? countCompletedWins(matchMapRecords, matchId, playerB))
    const winner = typeof body.winner === "string" && body.winner.trim()
      ? body.winner.trim()
      : scoreA > scoreB ? playerA : playerB
    if (winner !== playerA && winner !== playerB) return c.json({ error: "winner must be one of the match players" }, 400)

    const before = await getMatchById(c.env, matchId)
    await updateMatchFields(c.env, matchId, {
      status: "completed",
      winner,
      score_a: String(scoreA),
      score_b: String(scoreB),
    })
    const state = await writeMatchFlowState(c.env, {
      ...(await getMatchFlowState(c.env, matchId, Boolean(before?.lobbyUrl))),
      phase: "completed",
      turnPlayer: undefined,
      currentSlot: undefined,
    })
    await appendAuditLog(
      c.env,
      sessionUser?.username ?? "unknown",
      "post_result",
      "match",
      matchId,
      JSON.stringify(before ?? {}),
      JSON.stringify({ status: "completed", winner, scoreA, scoreB }),
    ).catch(() => {})
    await buildAndPostResultEmbed(c.env, matchId, playerA, playerB, scoreA, scoreB, winner)
    return c.json({ ok: true, winner, scoreA, scoreB, state })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Post result failed" }, 500)
  }
})

app.get("/api/match/:matchId/recipes", async (c) => {
  const matchId = c.req.param("matchId")
  try {
    const events = await getRecipeEvents(c.env, matchId)
    return c.json({ events: events.map(publicRecipeEvent) })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to load recipe events" }, 500)
  }
})

app.post("/api/match/:matchId/recipe", async (c) => {
  const matchId = c.req.param("matchId")
  const sessionUser = await readSessionUser(c)

  let body: Record<string, unknown>
  try {
    body = await c.req.json() as Record<string, unknown>
  } catch {
    return c.json({ error: "Invalid JSON" }, 400)
  }

  const player = typeof body.player === "string" ? body.player.trim() : ""
  const recipeIdRaw = String(body.recipeId ?? "").trim()
  if (!player || !recipeIdRaw) return c.json({ error: "player and recipeId required" }, 400)

  try {
    const match = await getMatchById(c.env, matchId)
    if (!match) return c.json({ error: "Match not found" }, 404)
    if (!samePlayer(player, match.playerA) && !samePlayer(player, match.playerB)) {
      return c.json({ error: "Player must belong to this match" }, 400)
    }
    const opponent = opponentOf(player, match.playerA, match.playerB)
    const itemRecords = await getItemRecords(c.env)
    const recipeId = recipeIdRaw.startsWith("item_") ? recipeIdRaw : `item_${recipeIdRaw}`
    const item = itemRecords.find((record) => firstValue(record, ["item_id", "id"]) === recipeId)
    if (!item) return c.json({ error: "Recipe not found" }, 404)
    if (firstValue(item, ["enabled"]).toLowerCase() === "false") return c.json({ error: "Recipe disabled" }, 409)
    const timing = firstValue(item, ["timing"]).toLowerCase().replace(/[\s-]+/g, "_")
    const flowState = await getMatchFlowState(c.env, matchId, true)
    const timingOpen =
      timing === "any" ||
      (timing === "ban_phase" && flowState.phase === "ban") ||
      (timing === "pick_phase" && flowState.phase === "craft") ||
      (timing === "before_map" && flowState.phase === "craft") ||
      (timing === "after_score" && flowState.phase === "play")
    if (!timingOpen) {
      return c.json({ error: `${firstValue(item, ["name"]) || "Recipe"} cannot be used during ${flowState.phase}` }, 409)
    }

    const events = await getRecipeEvents(c.env, matchId)
    if (events.some((event) =>
      event.status === "active" &&
      event.itemId === recipeId &&
      samePlayer(event.player, player)
    )) {
      return c.json({ error: "This recipe already has an active effect for the player" }, 409)
    }

    const baseEffectType = firstValue(item, ["effect_type"])
    let effectType = baseEffectType
    let effectPayload = itemPayload(item)
    let target = typeof body.targetSlot === "string" ? body.targetSlot.trim() : ""
    const activationPayload: Record<string, unknown> = {}

    if (baseEffectType === "copy_last_opponent") {
      const sourceEvent = [...events].reverse().find((event) =>
        event.status !== "reverted" &&
        samePlayer(event.player, opponent) &&
        event.itemId !== "item_18"
      )
      if (!sourceEvent) return c.json({ error: "Opponent has no recipe effect to copy" }, 409)
      const sourceItem = itemForEvent(itemRecords, sourceEvent)
      if (!sourceItem) return c.json({ error: "Opponent recipe definition is missing" }, 409)
      effectType = effectTypeForEvent(itemRecords, sourceEvent)
      if (!MAP_BOUND_EFFECTS.has(effectType) && effectType !== "wildcard_slot") {
        return c.json({ error: "Opponent's last recipe effect cannot be copied in the current flow" }, 409)
      }
      effectPayload = { ...itemPayload(sourceItem), ...sourceEvent.payload }
      activationPayload.copiedEffectType = effectType
      activationPayload.copiedFromEventId = sourceEvent.id
      activationPayload.copiedFromItemId = sourceEvent.itemId
    }

    const mod = typeof body.mod === "string"
      ? body.mod.trim().toUpperCase()
      : String(effectPayload.mod ?? "").toUpperCase()
    if (effectType === "mod_add_self") {
      if (!RECIPE_MOD_CHOICES.includes(mod as typeof RECIPE_MOD_CHOICES[number])) {
        return c.json({ error: `mod must be one of ${RECIPE_MOD_CHOICES.join(", ")}` }, 400)
      }
      activationPayload.mod = mod
    }
    if (effectType === "mod_add_both") {
      const modA = typeof body.modA === "string" ? body.modA.trim().toUpperCase() : String(effectPayload.modA ?? "").toUpperCase()
      const modB = typeof body.modB === "string" ? body.modB.trim().toUpperCase() : String(effectPayload.modB ?? "").toUpperCase()
      if (
        !RECIPE_MOD_CHOICES.includes(modA as typeof RECIPE_MOD_CHOICES[number]) ||
        !RECIPE_MOD_CHOICES.includes(modB as typeof RECIPE_MOD_CHOICES[number])
      ) {
        return c.json({ error: `Both player mods must be one of ${RECIPE_MOD_CHOICES.join(", ")}` }, 400)
      }
      activationPayload.modA = modA
      activationPayload.modB = modB
    }

    if (timing === "after_score") {
      target = flowState.currentSlot ?? ""
      if (!target) return c.json({ error: "No map is currently awaiting a score" }, 409)
    }

    const ingredientRaw = typeof body.ingredient === "string"
      ? body.ingredient.trim().toLowerCase()
      : String(effectPayload.ingredient ?? "").toLowerCase()
    const ingredient = INVENTORY_KEYS.find((key) => key === ingredientRaw)
    if (effectType === "steal_ingredient" || effectType === "win_bonus_steal") {
      if (!ingredient) return c.json({ error: "A valid ingredient selection is required" }, 400)
      activationPayload.ingredient = ingredient
    }

    const matchMapRecords = sheetRowsToRecords(await getSheetValuesSafe(c.env, "match_maps!A1:Z"))
    const poolRecords = sheetRowsToRecords(await getSheetValuesSafe(c.env, "mappool!A1:Z"))
    const matchPoolRecords = match.mappool
      ? poolRecords.filter((record) => firstValue(record, ["round"]).toLowerCase() === match.mappool?.toLowerCase())
      : poolRecords
    const validSlots = new Set(matchPoolRecords.map((record) => firstValue(record, ["map_id", "slot"]).toLowerCase()))
    const mapStatus = (slot: string): string => {
      const record = matchMapRecords.find((candidate) =>
        firstValue(candidate, ["match_id"]) === matchId &&
        firstValue(candidate, ["slot", "map_id"]).toLowerCase() === slot.toLowerCase()
      )
      return firstValue(record ?? {}, ["status"]).toLowerCase() || "available"
    }

    if (effectType === "protect_map") {
      if (!target || !validSlots.has(target.toLowerCase())) return c.json({ error: "Select a valid map to protect" }, 400)
      if (mapStatus(target) !== "available") return c.json({ error: "Only an available map can be protected" }, 409)
    }
    if (effectType === "unban_map") {
      if (!target || !validSlots.has(target.toLowerCase())) return c.json({ error: "Select a valid banned map" }, 400)
      if (mapStatus(target) !== "banned") return c.json({ error: "Only a banned map can be unbanned" }, 409)
    }

    if (effectType === "wildcard_slot") {
      const rewardSource = Array.isArray(body.rewardIngredients)
        ? body.rewardIngredients.map((value) => String(value).trim().toLowerCase())
        : Array.isArray(effectPayload.rewardIngredients)
          ? effectPayload.rewardIngredients.map((value) => String(value).trim().toLowerCase())
          : []
      const rewards = rewardSource
      if (rewards.length !== 2 || rewards.some((value) => !INVENTORY_KEYS.includes(value as IngredientKey))) {
        return c.json({ error: "Choose exactly two wildcard reward ingredients" }, 400)
      }
      const wildcard = matchPoolRecords.find((record) => {
        const slot = firstValue(record, ["map_id", "slot"])
        return firstValue(record, ["mod_pool", "pool"]).toUpperCase() === "TB" && mapStatus(slot) === "available"
      })
      target = firstValue(wildcard ?? {}, ["map_id", "slot"])
      if (!target) return c.json({ error: "No available wildcard/TB slot exists in this mappool" }, 409)
      activationPayload.rewardIngredients = rewards
      activationPayload.wildcardSlot = target
    }

    if (effectType === "comeback_bonus") {
      const scoreA = countCompletedWins(matchMapRecords, matchId, match.playerA)
      const scoreB = countCompletedWins(matchMapRecords, matchId, match.playerB)
      const playerScore = samePlayer(player, match.playerA) ? scoreA : scoreB
      const opponentScore = samePlayer(player, match.playerA) ? scoreB : scoreA
      const minDeficit = Number(effectPayload.min_deficit ?? effectPayload.minDeficit ?? 2) || 2
      if (opponentScore - playerScore < minDeficit) {
        return c.json({ error: `Shortbread requires the player to be at least ${minDeficit} points behind` }, 409)
      }
      activationPayload.activatedAtScore = { player: playerScore, opponent: opponentScore }
    }

    const cost = recipeCost(item)
    const inventoryRecords = sheetRowsToRecords(await getSheetValuesSafe(c.env, "inventory!A1:Z"))
    const current = parseInventoryRecord(inventoryRecords.find((record) =>
      firstValue(record, ["match_id"]) === matchId &&
      samePlayer(firstValue(record, ["player", "player_id"]), player)
    ))
    const missing = INVENTORY_KEYS.filter((key) => current[key] < cost[key])
    if (missing.length > 0) return c.json({ error: "Not enough ingredients", missing }, 409)

    if (effectType === "steal_ingredient" && ingredient) {
      const opponentInventory = parseInventoryRecord(inventoryRecords.find((record) =>
        firstValue(record, ["match_id"]) === matchId &&
        samePlayer(firstValue(record, ["player", "player_id"]), opponent)
      ))
      if (opponentInventory[ingredient] < 1) {
        return c.json({ error: `${opponent} has no ${ingredient} to steal` }, 409)
      }
    }

    const next = { ...current }
    for (const key of INVENTORY_KEYS) next[key] -= cost[key]
    let inventory = await writeInventoryAbsolute(c.env, matchId, player, next, sessionUser?.username ?? "unknown", "recipe_cost")
    const eventId = randomHex(8)
    const now = new Date().toISOString()
    const immediate = ["none", "protect_map", "unban_map", "steal_ingredient"].includes(effectType)
    const payload = { ...effectPayload, ...activationPayload }
    const resolution: Record<string, unknown> = {}

    if (effectType === "protect_map") {
      await setMatchMapStatus(c.env, matchId, target, "protected", player)
      resolution.protectedSlot = target
    } else if (effectType === "unban_map") {
      await setMatchMapStatus(c.env, matchId, target, "available", player)
      resolution.unbannedSlot = target
    } else if (effectType === "steal_ingredient" && ingredient) {
      await applyInventoryDelta(c.env, matchId, opponent, { [ingredient]: -1 }, sessionUser?.username ?? "unknown", "recipe_steal_loss")
      inventory = await applyInventoryDelta(c.env, matchId, player, { [ingredient]: 1 }, sessionUser?.username ?? "unknown", "recipe_steal_gain")
      resolution.stolenIngredient = ingredient
      resolution.from = opponent
    }

    await appendSheetRecord(c.env, "item_events", ITEM_EVENT_HEADERS, {
      event_id: eventId,
      match_id: matchId,
      player_id: player,
      item_id: recipeId,
      action: "use",
      target,
      payload: JSON.stringify(payload),
      created_by: sessionUser?.username ?? "unknown",
      created_at: now,
      reverted_at: "",
      status: immediate ? "resolved" : "active",
      activated_at: immediate ? now : "",
      resolved_at: immediate ? now : "",
      resolution: JSON.stringify(resolution),
    })
    await appendAuditLog(
      c.env,
      sessionUser?.username ?? "unknown",
      "recipe_use",
      "item_event",
      eventId,
      JSON.stringify({ inventory: current }),
      JSON.stringify({ recipeId, player, target, effectType, payload, status: immediate ? "resolved" : "active", inventory }),
    ).catch(() => {})
    return c.json({
      ok: true,
      event: {
        id: eventId,
        player,
        recipeId: recipeIdNumber(recipeId),
        target: target || undefined,
        payload,
        status: immediate ? "resolved" : "active",
        createdAt: now,
        activatedAt: immediate ? now : undefined,
        resolvedAt: immediate ? now : undefined,
        resolution,
      },
      inventory,
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Recipe use failed" }, 500)
  }
})

app.delete("/api/match/:matchId/recipe/:eventId", async (c) => {
  const matchId = c.req.param("matchId")
  const eventId = c.req.param("eventId")
  const sessionUser = await readSessionUser(c)
  try {
    const [events, items] = await Promise.all([
      getRecipeEvents(c.env, matchId),
      getItemRecords(c.env),
    ])
    const event = events.find((candidate) => candidate.id === eventId)
    if (!event) return c.json({ error: "Recipe event not found" }, 404)
    if (event.status !== "active") return c.json({ error: "Only active recipe effects can be reverted" }, 409)
    if (event.activatedAt) return c.json({ error: "An activated map effect cannot be reverted" }, 409)
    const item = itemForEvent(items, event)
    if (!item) return c.json({ error: "Recipe definition not found" }, 404)

    const refund = recipeCost(item)
    const inventory = await applyInventoryDelta(
      c.env,
      matchId,
      event.player,
      refund,
      sessionUser?.username ?? "unknown",
      "recipe_refund",
    )
    const now = new Date().toISOString()
    await updateRecipeEvent(c.env, event.id, {
      status: "reverted",
      reverted_at: now,
      resolved_at: now,
      resolution: JSON.stringify({ reverted: true, refunded: refund }),
    })
    await appendAuditLog(
      c.env,
      sessionUser?.username ?? "unknown",
      "recipe_revert",
      "item_event",
      event.id,
      JSON.stringify(publicRecipeEvent(event)),
      JSON.stringify({ status: "reverted", refunded: refund }),
    ).catch(() => {})
    return c.json({ ok: true, inventory })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Recipe revert failed" }, 500)
  }
})

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    service: "mws-ref-portal",
    runtime: "cloudflare-pages",
    timestamp: new Date().toISOString(),
  })
})

app.get("/api/public/state", (c) => {
  return c.json({
    tournament: {
      name: "osu! Referee Web Portal",
      activeRound: "Round of 16",
      source: "Google Sheets",
    },
    itemsEnabled: true,
    hasSheetCredentials:
      Boolean(c.env.GOOGLE_APPLICATION_CREDENTIALS) &&
      Boolean(c.env.GOOGLE_SHEETS_TOURNAMENT_ID),
    updatedAt: new Date().toISOString(),
  })
})

app.get("/api/public/match/:matchId/snapshot", async (c) => {
  c.header("Access-Control-Allow-Origin", "*")
  c.header("Cache-Control", "public, max-age=2, stale-while-revalidate=3")
  c.header("X-Content-Type-Options", "nosniff")

  const matchId = c.req.param("matchId").trim()
  if (!matchId) return c.json({ error: "matchId required" }, 400)

  try {
    const match = await getMatchById(c.env, matchId)
    if (!match) return c.json({ error: "Match not found" }, 404)

    const [matchMapValues, inventoryValues, recipeEvents, items, poolValues] = await Promise.all([
      getSheetValuesSafe(c.env, "match_maps!A1:Z"),
      getSheetValuesSafe(c.env, "inventory!A1:Z"),
      getRecipeEvents(c.env, matchId, false),
      getItemRecords(c.env),
      getSheetValuesSafe(c.env, "mappool!A1:Z"),
    ])
    const matchMaps = sheetRowsToRecords(matchMapValues)
      .filter((record) => firstValue(record, ["match_id"]) === matchId)
    const inventories = sheetRowsToRecords(inventoryValues)
      .filter((record) => firstValue(record, ["match_id"]) === matchId)
    const poolRecords = sheetRowsToRecords(poolValues)
      .filter((record) =>
        !match.mappool ||
        firstValue(record, ["round"]).toLowerCase() === match.mappool.toLowerCase()
      )
    const mapsBySlot = new Map(poolRecords.map((record) => [
      firstValue(record, ["map_id", "slot"]).toLowerCase(),
      record,
    ]))

    const sideForPlayer = (player: string): "red" | "blue" | null => {
      if (samePlayer(player, match.playerA)) return "red"
      if (samePlayer(player, match.playerB)) return "blue"
      return null
    }
    const numberOrNull = (value: string): number | null => {
      if (!value.trim()) return null
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    const publicMap = (record: SheetRecord): Record<string, unknown> => {
      const slot = firstValue(record, ["slot", "map_id"])
      const poolRecord = mapsBySlot.get(slot.toLowerCase()) ?? {}
      const pickedBy = firstValue(record, ["picked_by"])
      const bannedBy = firstValue(record, ["banned_by"])
      const winner = firstValue(record, ["winner"])
      return {
        slot,
        pool: firstValue(poolRecord, ["mod_pool", "pool"]).toUpperCase() || null,
        title: firstValue(poolRecord, ["title", "map"]) || null,
        beatmapId: firstValue(poolRecord, ["beatmap_id"]) || null,
        status: firstValue(record, ["status"]).toLowerCase() || "available",
        by: sideForPlayer(pickedBy || bannedBy),
        player: pickedBy || bannedBy || null,
        winner: sideForPlayer(winner),
        winnerPlayer: winner || null,
        score: {
          red: numberOrNull(firstValue(record, ["score_a"])),
          blue: numberOrNull(firstValue(record, ["score_b"])),
        },
      }
    }
    const inventoryFor = (player: string): InventoryMap => parseInventoryRecord(
      inventories.find((record) =>
        samePlayer(firstValue(record, ["player", "player_id"]), player)
      )
    )
    const stars = {
      red: countCompletedWins(matchMaps, matchId, match.playerA),
      blue: countCompletedWins(matchMaps, matchId, match.playerB),
    }

    return c.json({
      matchId: match.id,
      round: match.round,
      status: match.status,
      bestOf: match.bestOf ?? null,
      players: {
        red: { name: match.playerA, osuId: match.playerAOsuId ?? null },
        blue: { name: match.playerB, osuId: match.playerBOsuId ?? null },
      },
      maps: {
        picked: matchMaps
          .filter((record) => ["picked", "in-progress", "completed"].includes(
            firstValue(record, ["status"]).toLowerCase()
          ))
          .map(publicMap),
        banned: matchMaps
          .filter((record) => firstValue(record, ["status"]).toLowerCase() === "banned")
          .map(publicMap),
      },
      score: stars,
      stars,
      ingredients: {
        red: inventoryFor(match.playerA),
        blue: inventoryFor(match.playerB),
      },
      recipes: {
        red: publicSnapshotRecipesForPlayer(recipeEvents, items, match.playerA),
        blue: publicSnapshotRecipesForPlayer(recipeEvents, items, match.playerB),
      },
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : "Failed to load public match snapshot",
    }, 500)
  }
})

app.get("/api/public/config", async (c) => {
  try {
    const configMap = await getConfigMap(c.env)
    return c.json({
      restrictAccess:  isRestrictAccess(configMap),
      testMode:        isTestMode(configMap),
      tournamentName:  configMap.get("tournament name") ?? "",
      abbreviation:    configMap.get("abbreviation") ?? "",
      scoring:         configMap.get("scoring") ?? "",
      teamMode:        configMap.get("team mode") ?? "",
      gameMode:        configMap.get("game mode") ?? "",
      format:          configMap.get("format") ?? "",
      enforceNF:       configMap.get("enforce nf?")?.toLowerCase() === "true",
      banOrder:        configMap.get("ban order") ?? "",
      protectOrder:    configMap.get("protect order") ?? "",
      strikeOrder:     configMap.get("strike order") ?? "",
      qualifiersPool:  configMap.get("qualifiers pool") ?? "",
      multipliers: {
        ez:   configMap.get("multiplier ez") ?? "",
        ezhd: configMap.get("multiplier ezhd") ?? "",
        ezdt: configMap.get("multiplier ezdt") ?? "",
      },
      rules: {
        late:       configMap.get("late rules") ?? "",
        roll:       configMap.get("roll rules") ?? "",
        picksBans:  configMap.get("picks/bans") ?? "",
        fm:         configMap.get("fm rules") ?? "",
        warmups:    configMap.get("warmups") ?? "",
        timeout:    configMap.get("timeout rules") ?? "",
        disconnect: configMap.get("disconnect rules") ?? "",
        tb:         configMap.get("tb rules") ?? "",
      },
    })
  } catch {
    return c.json({ restrictAccess: true, tournamentName: "", abbreviation: "", rules: {} })
  }
})

app.post("/api/irc/send", async (c) => {
  const relayUrl = c.env.IRC_RELAY_URL?.trim()
  const relaySecret = c.env.IRC_RELAY_SECRET?.trim()
  if (!relayUrl || !relaySecret) {
    return c.json({ error: "IRC relay not configured" }, 503)
  }

  let body: { channel?: string; message?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: "Invalid JSON" }, 400)
  }

  const { channel, message } = body
  if (!channel || !message) {
    return c.json({ error: "channel and message required" }, 400)
  }

  // #TEST-MODE-START
  const ircCfgMap = await getConfigMap(c.env)
  if (isTestMode(ircCfgMap)) {
    return c.json({ ok: true, simulated: true })
  }
  // #TEST-MODE-END

  const res = await fetch(`${relayUrl}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Relay-Secret": relaySecret,
    },
    body: JSON.stringify({ channel, message }),
  })

  const data = await res.json()
  return c.json(data, res.status as 200 | 400 | 401 | 503)
})

app.get("/api/irc/stream", async (c) => {
  const relayUrl = c.env.IRC_RELAY_URL?.trim()
  const relaySecret = c.env.IRC_RELAY_SECRET?.trim()
  if (!relayUrl || !relaySecret) {
    return c.json({ error: "IRC relay not configured" }, 503)
  }

  const channel = c.req.query("channel")
  const streamUrl = new URL(`${relayUrl}/stream`)
  if (channel) streamUrl.searchParams.set("channel", channel)

  const relayRes = await fetch(streamUrl.toString(), {
    headers: {
      "X-Relay-Secret": relaySecret,
      Accept: "text/event-stream",
    },
  })

  if (!relayRes.ok || !relayRes.body) {
    return c.json({ error: "Relay stream unavailable" }, 503)
  }

  return new Response(relayRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
})

app.post("/api/match/:matchId/create-lobby", async (c) => {
  const matchId = c.req.param("matchId")
  const relayUrl = c.env.IRC_RELAY_URL?.trim()
  const relaySecret = c.env.IRC_RELAY_SECRET?.trim()
  if (!relayUrl || !relaySecret) {
    return c.json({ error: "IRC relay not configured" }, 503)
  }

  let body: { playerA?: string; playerB?: string; refUsername?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: "Invalid JSON" }, 400)
  }

  const { playerA = "", playerB = "", refUsername = "" } = body

  // Read config for lobby settings
  const configMap = await getConfigMap(c.env)
  const abbreviation = configMap.get("abbreviation") ?? "MWS"
  const teamMode = teamModeToInt(configMap.get("team mode") ?? "")
  const scoringMode = scoringModeToInt(configMap.get("scoring") ?? "")
  const lobbySize = formatToLobbySize(configMap.get("format") ?? "1v1")
  const enforceNF = configMap.get("enforce nf?")?.toLowerCase() === "true"
  const staffWebhook = configMap.get("staff webhook")?.trim()

  const title = `${abbreviation}: ${playerA} vs ${playerB}`

  // #TEST-MODE-START
  if (isTestMode(configMap)) {
    const fakeId = "9" + (Math.floor(Math.random() * 9000000) + 1000000).toString()
    const fakeLobbyUrl = `https://osu.ppy.sh/mp/${fakeId}`
    const fakeChannel = `#mp_${fakeId}`
    const fakeFollowUpCmds: string[] = [`!mp set ${teamMode} ${scoringMode} ${lobbySize}`]
    if (enforceNF) fakeFollowUpCmds.push("!mp mods NF")
    if (refUsername) fakeFollowUpCmds.push(`!mp addref ${refUsername}`)
    try {
      await updateMatchField(c.env, matchId, "lobby_url", fakeLobbyUrl)
    } catch {
      // Test-mode lobby creation remains usable when the Sheet write is unavailable.
    }
    if (staffWebhook) {
      await fetch(staffWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: `Lobby Created — Match ${matchId}`,
            description: `**${title}**\n\n\`\`\`\n${fakeChannel}\n\`\`\``,
            color: 0x5f7f63,
            fields: [
              { name: "Channel", value: `\`${fakeChannel}\``, inline: true },
              { name: "MP Link", value: fakeLobbyUrl, inline: false },
            ],
          }],
        }),
      }).catch(() => {})
    }
    return c.json({ ok: true, lobbyUrl: fakeLobbyUrl, channel: fakeChannel, mpId: fakeId, followUpCmds: fakeFollowUpCmds })
  }
  // #TEST-MODE-END

  // Open SSE stream BEFORE sending !mp make to avoid race with BanchoBot response
  const streamRes = await fetch(`${relayUrl}/stream`, {
    headers: { "X-Relay-Secret": relaySecret, Accept: "text/event-stream" },
  })
  if (!streamRes.ok || !streamRes.body) {
    return c.json({ error: "Relay stream unavailable" }, 503)
  }

  // Send !mp make to BanchoBot (PM)
  await fetch(`${relayUrl}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Relay-Secret": relaySecret },
    body: JSON.stringify({ channel: "BanchoBot", message: `!mp make ${title}` }),
  })

  // Read SSE until BanchoBot confirms lobby created
  const reader = streamRes.body.getReader()
  const decoder = new TextDecoder()
  let lobbyUrl: string | null = null
  const deadline = Date.now() + 12000
  let buf = ""

  while (Date.now() < deadline && !lobbyUrl) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      try {
        const ev = JSON.parse(line.slice(6)) as { from?: string; message?: string }
        if (ev.from === "BanchoBot" && ev.message?.includes("osu.ppy.sh/mp/")) {
          const m = ev.message.match(/https:\/\/osu\.ppy\.sh\/mp\/(\d+)/)
          if (m) lobbyUrl = `https://osu.ppy.sh/mp/${m[1]}`
        }
      } catch {
        // Ignore malformed relay events while waiting for BanchoBot.
      }
      if (lobbyUrl) break
    }
  }
  reader.cancel()

  if (!lobbyUrl) {
    return c.json({ error: "Timed out waiting for BanchoBot" }, 408)
  }

  const mpId = lobbyUrl.match(/\/mp\/(\d+)/)?.[1] ?? ""
  const channel = `#mp_${mpId}`

  // Build !mp set and optional follow-up commands
  const mpSetCmd = `!mp set ${teamMode} ${scoringMode} ${lobbySize}`
  const followUpCmds: string[] = [mpSetCmd]
  if (enforceNF) followUpCmds.push("!mp mods NF")
  if (refUsername) followUpCmds.push(`!mp addref ${refUsername}`)

  // Write lobby URL to Sheets (best-effort)
  try {
    await updateMatchField(c.env, matchId, "lobby_url", lobbyUrl)
  } catch {
    // non-fatal — ref can see it in UI
  }

  // Post Discord staff webhook (best-effort)
  if (staffWebhook) {
    await fetch(staffWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: `Lobby Created — Match ${matchId}`,
          description: `**${title}**\n\n\`\`\`\n${channel}\n\`\`\``,
          color: 0x5f7f63,
          fields: [
            { name: "Channel", value: `\`${channel}\``, inline: true },
            { name: "MP Link", value: lobbyUrl, inline: false },
          ],
        }],
      }),
    }).catch(() => {})
  }

  return c.json({ ok: true, lobbyUrl, channel, mpId, followUpCmds })
})

app.post("/api/match/:matchId/close-lobby", async (c) => {
  const matchId = c.req.param("matchId")

  let body: { channel?: string; messages?: { ts: string; from: string; message: string; local?: boolean }[] }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: "Invalid JSON" }, 400)
  }

  const { channel, messages = [] } = body

  const closeCfgMap = await getConfigMap(c.env)

  // #TEST-MODE-START
  if (isTestMode(closeCfgMap)) {
    const logLines = messages.map((m) => {
      const time = new Date(m.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      return `[${time}] ${m.local ? "(sent) " : ""}${m.from}: ${m.message}`
    })
    const logText = logLines.length > 0 ? logLines.join("\n") : "(no messages recorded)"
    const staffWebhook = closeCfgMap.get("staff webhook")?.trim()
    if (staffWebhook) {
      const form = new FormData()
      form.append("payload_json", JSON.stringify({
        embeds: [{
          title: `Lobby Closed — Match ${matchId}`,
          description: channel ? `Channel: \`${channel}\`` : "No channel recorded",
          color: 0x8d3f38,
          footer: { text: `${messages.length} messages · ${new Date().toUTCString()}` },
        }],
      }))
      form.append("files[0]", new Blob([logText], { type: "text/plain" }), `match_${matchId}_chat.txt`)
      await fetch(staffWebhook, { method: "POST", body: form }).catch(() => {})
    }
    return c.json({ ok: true, messageCount: messages.length })
  }
  // #TEST-MODE-END

  // Send !mp close via relay (best-effort — lobby may already be closed)
  const relayUrl = c.env.IRC_RELAY_URL?.trim()
  const relaySecret = c.env.IRC_RELAY_SECRET?.trim()
  if (relayUrl && relaySecret && channel) {
    await fetch(`${relayUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Secret": relaySecret },
      body: JSON.stringify({ channel, message: "!mp close" }),
    }).catch(() => {})
  }

  // Build chat log text
  const logLines = messages.map((m) => {
    const time = new Date(m.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    return `[${time}] ${m.local ? "(sent) " : ""}${m.from}: ${m.message}`
  })
  const logText = logLines.length > 0
    ? logLines.join("\n")
    : "(no messages recorded)"

  // Post to staff webhook with chat log as file attachment
  const configMap = await getConfigMap(c.env)
  const staffWebhook = configMap.get("staff webhook")?.trim()
  if (staffWebhook) {
    const filename = `match_${matchId}_chat.txt`
    const form = new FormData()
    form.append("payload_json", JSON.stringify({
      embeds: [{
        title: `Lobby Closed — Match ${matchId}`,
        description: channel ? `Channel: \`${channel}\`` : "No channel recorded",
        color: 0x8d3f38,
        footer: { text: `${messages.length} messages · ${new Date().toUTCString()}` },
      }],
    }))
    form.append("files[0]", new Blob([logText], { type: "text/plain" }), filename)
    await fetch(staffWebhook, { method: "POST", body: form }).catch(() => {})
  }

  return c.json({ ok: true, messageCount: messages.length })
})

app.post("/api/match/:matchId/remind", async (c) => {
  const matchId = c.req.param("matchId")

  const [configMap, matchValues, playerValues] = await Promise.all([
    getConfigMap(c.env),
    getSheetValuesSafe(c.env, "matches!A1:Z"),
    getSheetValuesSafe(c.env, "players!A1:Z"),
  ])

  const reminderWebhook = configMap.get("reminder webhook")?.trim()

  if (!reminderWebhook) {
    return c.json({ error: "Reminder webhook not configured in config sheet" }, 503)
  }

  const matchRecords = sheetRowsToRecords(matchValues)
  const matchRecord = matchRecords.find((r) => r["match_id"]?.trim() === matchId)
  if (!matchRecord) {
    return c.json({ error: "Match not found" }, 404)
  }

  // Build player lookup: player_id | osu_id | lowercase name → discord ping or name
  const playerRecords = sheetRowsToRecords(playerValues)
  const playerPingMap = new Map<string, string>()
  for (const p of playerRecords) {
    const pid      = firstValue(p, ["player_id", "id"])
    const osuId    = firstValue(p, ["osu_id"])
    const name     = firstValue(p, ["name", "username"])
    const discordId = firstValue(p, ["discord_id"]).trim()
    const ping = /^\d{15,20}$/.test(discordId) ? `<@${discordId}>` : name
    if (pid)  playerPingMap.set(pid, ping)
    if (osuId) playerPingMap.set(osuId, ping)
    if (name)  playerPingMap.set(name.toLowerCase(), ping)
  }

  function resolvePing(raw: string): string {
    return playerPingMap.get(raw) ?? playerPingMap.get(raw.toLowerCase()) ?? raw
  }

  const rawA  = firstValue(matchRecord, ["player_a", "playera"])
  const rawB  = firstValue(matchRecord, ["player_b", "playerb"])
  const dateStr = firstValue(matchRecord, ["date", "match_date"])
  const timeStr = firstValue(matchRecord, ["time", "match_time", "start_time"])

  let timeDisplay = "soon"
  let unixTs: number | null = null
  if (dateStr && timeStr) {
    try {
      const matchTime = new Date(`${dateStr}T${timeStr}`)
      if (!isNaN(matchTime.getTime())) {
        unixTs = Math.floor(matchTime.getTime() / 1000)
        timeDisplay = `<t:${unixTs}:R>`
      }
    } catch { /* leave "soon" */ }
  }

  const pingA = resolvePing(rawA)
  const pingB = resolvePing(rawB)
  const content = `${pingA} ${pingB} Your match is starting ${timeDisplay}. Invites will be sent shortly. Good luck, have fun!`

  const res = await fetch(reminderWebhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })

  if (!res.ok) {
    const reason = await res.text()
    return c.json({ error: `Webhook failed: ${res.status} ${reason}` }, 502)
  }

  return c.json({ ok: true, unixTs, content })
})

app.post("/api/match/:matchId/join-lobby", async (c) => {
  const matchId = c.req.param("matchId")
  let body: { mpId?: string }
  try { body = await c.req.json() } catch { return c.json({ error: "Invalid JSON" }, 400) }

  const mpId = body.mpId?.trim().replace(/^#?mp_?/i, "")
  if (!mpId || !/^\d+$/.test(mpId)) {
    return c.json({ error: "Invalid mp ID" }, 400)
  }

  const channel = `#mp_${mpId}`
  const lobbyUrl = `https://osu.ppy.sh/mp/${mpId}`

  const joinCfgMap = await getConfigMap(c.env)
  const relayUrl = c.env.IRC_RELAY_URL?.trim()
  const relaySecret = c.env.IRC_RELAY_SECRET?.trim()

  // #TEST-MODE-START — skip IRC alive check, sheet write still runs below
  if (isTestMode(joinCfgMap)) {
    try {
      await updateMatchField(c.env, matchId, "lobby_url", lobbyUrl)
    } catch {
      // Test-mode lobby joining remains usable when the Sheet write is unavailable.
    }
    return c.json({ ok: true, alive: true, lobbyUrl, channel })
  }
  // #TEST-MODE-END

  let alive = false
  if (relayUrl && relaySecret) {
    // Open SSE before sending command to avoid race
    const streamRes = await fetch(`${relayUrl}/stream?channel=${encodeURIComponent(channel)}`, {
      headers: { "X-Relay-Secret": relaySecret, Accept: "text/event-stream" },
    })

    if (streamRes.ok && streamRes.body) {
      await fetch(`${relayUrl}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Relay-Secret": relaySecret },
        body: JSON.stringify({ channel, message: "!mp settings" }),
      })

      const reader = streamRes.body.getReader()
      const decoder = new TextDecoder()
      const deadline = Date.now() + 6000
      let buf = ""

      outer: while (Date.now() < deadline) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const ev = JSON.parse(line.slice(6)) as { from?: string; message?: string }
            if (ev.from === "BanchoBot") { alive = true; break outer }
          } catch {
            // Ignore malformed relay events during the liveness probe.
          }
        }
      }
      reader.cancel()
    }
  }

  // Write lobby_url to Sheets regardless (best-effort)
  try {
    await updateMatchField(c.env, matchId, "lobby_url", lobbyUrl)
  } catch {
    // Best-effort Sheet write; the caller still gets the lobby validation result.
  }

  return c.json({ ok: true, alive, lobbyUrl, channel })
})

app.post("/api/match/:matchId/action", async (c) => {
  const matchId = c.req.param("matchId")
  const sessionUser = await readSessionUser(c)

  let body: { action?: string; player?: string; slot?: string; manualOrder?: boolean }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: "Invalid JSON" }, 400)
  }

  const { action, player, slot } = body
  const manualOrder = body.manualOrder === true
  if (!action || !slot || (action !== "unpick" && !player)) {
    return c.json({ error: action === "unpick" ? "action and slot required" : "action, player, and slot required" }, 400)
  }
  if (!["pick", "ban", "protect", "unpick"].includes(action)) {
    return c.json({ error: "Invalid action" }, 400)
  }

  const actionPlayer = player ?? ""
  const status = action === "pick" ? "picked" : action === "ban" ? "banned" : action === "protect" ? "protected" : "available"
  const actionCfgMap = await getConfigMap(c.env)

  try {
    const match = await getMatchById(c.env, matchId)
    if (!match) return c.json({ error: "Match not found" }, 404)
    if (
      action !== "unpick" &&
      !samePlayer(actionPlayer, match.playerA) &&
      !samePlayer(actionPlayer, match.playerB)
    ) {
      return c.json({ error: "Player must belong to this match" }, 400)
    }
    const flowState = await getMatchFlowState(c.env, matchId, Boolean(match.lobbyUrl))

    if (!manualOrder && flowState && action === "ban") {
      if (flowState.phase !== "ban") {
        return c.json({ error: `Ban phase is not open (${flowState.phase})` }, 409)
      }
      if (!samePlayer(flowState.turnPlayer, actionPlayer)) {
        return c.json({ error: `${flowState.turnPlayer ?? "Next player"} must ban next` }, 409)
      }
    }

    if (!manualOrder && flowState && action === "pick") {
      if (flowState.phase !== "craft") {
        return c.json({ error: `Pick phase is not open (${flowState.phase})` }, 409)
      }
      if (!samePlayer(flowState.turnPlayer, actionPlayer)) {
        return c.json({ error: `${flowState.turnPlayer ?? "Next player"} must pick next` }, 409)
      }
    }

    const matchMapsValues = await getSheetValues(c.env, "match_maps!A1:Z")
    const [headers, ...rows] = matchMapsValues
    if (!headers) return c.json({ error: "match_maps sheet empty" }, 500)

    const norm = headers.map(normalizeHeader)
    const idx = (name: string) => norm.indexOf(name)
    const matchIdIdx  = idx("match_id")
    const slotIdx     = idx("slot")
    const mapIdIdx    = idx("map_id")
    const pickedByIdx = idx("picked_by")
    const bannedByIdx = idx("banned_by")
    const statusIdx   = idx("status")
    const scoreAIdx   = idx("score_a")
    const scoreBIdx   = idx("score_b")
    const winnerIdx   = idx("winner")

    const existingRowIdx = rows.findIndex(
      (r) => r[matchIdIdx]?.trim() === matchId && r[slotIdx]?.trim() === slot
    )

    const existingRow = existingRowIdx >= 0 ? rows[existingRowIdx] : undefined
    const beforeJson = existingRow ? JSON.stringify(existingRow) : "{}"
    const beforePickedBy = existingRow?.[pickedByIdx]?.trim() || undefined
    const existingStatus = existingRow?.[statusIdx]?.trim().toLowerCase() || "available"
    if (action === "ban" && existingStatus === "protected") {
      return c.json({ error: `${slot} is protected and cannot be banned` }, 409)
    }
    if (action === "ban" && ["banned", "picked", "in-progress", "completed"].includes(existingStatus)) {
      return c.json({ error: `${slot} is not available to ban` }, 409)
    }
    if (action === "pick" && ["banned", "picked", "in-progress", "completed"].includes(existingStatus)) {
      return c.json({ error: `${slot} is not available to pick` }, 409)
    }
    if (action === "protect" && existingStatus !== "available") {
      return c.json({ error: `${slot} is not available to protect` }, 409)
    }

    if (existingRowIdx >= 0) {
      const sheetRow = existingRowIdx + 2
      const writes: Promise<void>[] = []
      if (action === "unpick") {
        if (pickedByIdx >= 0) writes.push(writeSheetCell(c.env, `match_maps!${colLetter(pickedByIdx)}${sheetRow}`, ""))
        if (scoreAIdx >= 0) writes.push(writeSheetCell(c.env, `match_maps!${colLetter(scoreAIdx)}${sheetRow}`, ""))
        if (scoreBIdx >= 0) writes.push(writeSheetCell(c.env, `match_maps!${colLetter(scoreBIdx)}${sheetRow}`, ""))
        if (winnerIdx >= 0) writes.push(writeSheetCell(c.env, `match_maps!${colLetter(winnerIdx)}${sheetRow}`, ""))
      } else if (action === "pick" && pickedByIdx >= 0) {
        writes.push(writeSheetCell(c.env, `match_maps!${colLetter(pickedByIdx)}${sheetRow}`, actionPlayer))
      } else if (action === "ban" && bannedByIdx >= 0) {
        writes.push(writeSheetCell(c.env, `match_maps!${colLetter(bannedByIdx)}${sheetRow}`, actionPlayer))
      }
      if (statusIdx >= 0) {
        writes.push(writeSheetCell(c.env, `match_maps!${colLetter(statusIdx)}${sheetRow}`, status))
      }
      await Promise.all(writes)
    } else if (action !== "unpick") {
      const newRow = new Array(Math.max(norm.length, 9)).fill("")
      if (matchIdIdx >= 0) newRow[matchIdIdx] = matchId
      if (slotIdx >= 0)    newRow[slotIdx] = slot
      if (mapIdIdx >= 0)   newRow[mapIdIdx] = slot
      if (statusIdx >= 0)  newRow[statusIdx] = status
      if (action === "pick" && pickedByIdx >= 0)  newRow[pickedByIdx] = actionPlayer
      if (action === "ban" && bannedByIdx >= 0)    newRow[bannedByIdx] = actionPlayer
      await appendSheetRow(c.env, "match_maps", newRow)
    }

    let nextFlowState: MatchFlowState | undefined
    let recipeSetup: RecipePickSetup | undefined
    if (!manualOrder && flowState && action === "ban") {
      const [recipeEvents, recipeItems] = await Promise.all([
        getRecipeEvents(c.env, matchId),
        getItemRecords(c.env),
      ])
      const extraBan = recipeEvents.find((event) =>
        event.status === "active" &&
        samePlayer(event.player, actionPlayer) &&
        effectTypeForEvent(recipeItems, event) === "extra_ban"
      )
      if (extraBan) {
        const now = new Date().toISOString()
        await updateRecipeEvent(c.env, extraBan.id, {
          status: "resolved",
          target: slot,
          activated_at: extraBan.activatedAt || now,
          resolved_at: now,
          resolution: JSON.stringify({ extraBanAfter: slot }),
        })
        nextFlowState = await writeMatchFlowState(c.env, {
          ...flowState,
          phase: "ban",
          turnPlayer: actionPlayer,
          currentSlot: undefined,
        })
      }
      const mapRecords = sheetRowsToRecords(matchMapsValues)
      const completedBans = mapRecords.filter((r) =>
        firstValue(r, ["match_id"]) === matchId &&
        firstValue(r, ["status"]).toLowerCase() === "banned"
      ).length + 1
      const firstBanner = flowState.firstBanner ?? actionPlayer
      const secondBanner = opponentOf(firstBanner, match.playerA, match.playerB)
      const banOrder = orderedPlayersFromPattern(actionCfgMap.get("ban order") ?? DEFAULT_BAN_ORDER, firstBanner, secondBanner)
      if (extraBan) {
        // Beignets grants the acting player one immediate additional ban.
      } else if (completedBans < banOrder.length) {
        nextFlowState = await writeMatchFlowState(c.env, {
          ...flowState,
          phase: "ban",
          turnPlayer: banOrder[completedBans],
          currentSlot: undefined,
        })
      } else {
        nextFlowState = await writeMatchFlowState(c.env, {
          ...flowState,
          phase: "craft",
          turnPlayer: flowState.firstPicker ?? opponentOf(firstBanner, match.playerA, match.playerB),
          currentSlot: undefined,
        })
      }
    } else if (action === "pick") {
      const poolRecords = sheetRowsToRecords(await getSheetValuesSafe(c.env, "mappool!A1:Z"))
      const pool = getMapPoolForSlot(poolRecords, slot)
      recipeSetup = await activateRecipesForPick(c.env, matchId, actionPlayer, slot, pool)
      if (flowState) {
        nextFlowState = await writeMatchFlowState(c.env, {
          ...flowState,
          phase: "play",
          turnPlayer: actionPlayer,
          currentSlot: slot,
        })
      }
    } else if (flowState && action === "unpick" && flowState.currentSlot === slot) {
      nextFlowState = await writeMatchFlowState(c.env, {
        ...flowState,
        phase: "craft",
        turnPlayer: beforePickedBy ?? flowState.turnPlayer,
        currentSlot: undefined,
      })
    }

    const afterState = { matchId, slot, action, player: player ?? beforePickedBy, status, manualOrder }
    await appendAuditLog(
      c.env,
      sessionUser?.username ?? "unknown",
      action,
      "match_map",
      `${matchId}:${slot}`,
      beforeJson,
      JSON.stringify(afterState),
    ).catch(() => {})

    return c.json({ ok: true, slot, action, player, status, state: nextFlowState, manualOrder, recipeSetup })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Action failed" }, 500)
  }
})

app.post("/api/match/:matchId/forfeit", async (c) => {
  const matchId = c.req.param("matchId")
  const sessionUser = await readSessionUser(c)

  let body: { winner?: string; playerA?: string; playerB?: string }
  try { body = await c.req.json() } catch { return c.json({ error: "Invalid JSON" }, 400) }

  const { winner, playerA, playerB } = body
  if (!winner || !playerA || !playerB) {
    return c.json({ error: "winner, playerA, playerB required" }, 400)
  }

  const loserIsA = winner === playerB
  const fields: Record<string, string> = {
    status: "forfeit",
    winner,
    score_a: loserIsA ? "-1" : "0",
    score_b: loserIsA ? "0" : "-1",
  }


  try {
    await updateMatchFields(c.env, matchId, fields)
    await appendAuditLog(
      c.env,
      sessionUser?.username ?? "unknown",
      "forfeit",
      "match",
      matchId,
      "{}",
      JSON.stringify({ winner, loser: loserIsA ? playerA : playerB }),
    ).catch(() => {})
    return c.json({ ok: true, winner, loser: loserIsA ? playerA : playerB })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Forfeit failed" }, 500)
  }
})

app.get("/api/auth/bypass", async (c) => {
  try {
    const configMap = await getConfigMap(c.env)
    if (isRestrictAccess(configMap)) {
      return c.json({ error: "Access is restricted" }, 403)
    }
    const sessionSecret = mustEnv(c.env, "SESSION_SECRET")
    const sessionToken = await issueSessionToken(sessionSecret, { username: "Referee", osuId: 0 })
    setCookie(c, SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions(c.req.url))
    return c.redirect("/", 302)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Bypass failed" }, 500)
  }
})

export const onRequest = handle(app)
