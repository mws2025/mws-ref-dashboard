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

const OSU_AUTH_BASE = "https://osu.ppy.sh"

function osuApiBase(env: Bindings): string {
  return env.OSU_PROXY_BASE?.trim() || OSU_AUTH_BASE
}
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"
const SESSION_COOKIE_NAME = "mws_ref_session"
const OAUTH_STATE_COOKIE_NAME = "mws_osu_oauth_state"
const SESSION_TTL_SECONDS = 60 * 60 * 12

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

async function getSheetValuesSafe(env: Bindings, rangeA1: string): Promise<string[][]> {
  try {
    return await getSheetValues(env, rangeA1)
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
  return header.trim().toLowerCase()
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

  const tokenRes = await fetch(`${osuApiBase(env)}/oauth/token`, {
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
  const userRes = await fetch(`${osuApiBase(env)}/api/v2/me/osu`, {
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

    const tokenRes = await fetch(`${osuApiBase(c.env)}/oauth/token`, {
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

  // #TEST-MODE-START
  const configMap = await getConfigMap(c.env)
  if (isTestMode(configMap)) {
    return c.json({ ok: true, simulated: true })
  }
  // #TEST-MODE-END

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
      } catch {}
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

  // #TEST-MODE-START
  const closeCfgMap = await getConfigMap(c.env)
  if (isTestMode(closeCfgMap)) {
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

  // #TEST-MODE-START
  if (isTestMode(configMap)) {
    return c.json({ ok: true, simulated: true })
  }
  // #TEST-MODE-END

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

  // #TEST-MODE-START
  const joinCfgMap = await getConfigMap(c.env)
  if (isTestMode(joinCfgMap)) {
    return c.json({ ok: true, alive: true, simulated: true, lobbyUrl, channel })
  }
  // #TEST-MODE-END

  const relayUrl = c.env.IRC_RELAY_URL?.trim()
  const relaySecret = c.env.IRC_RELAY_SECRET?.trim()

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
          } catch {}
        }
      }
      reader.cancel()
    }
  }

  // Write lobby_url to Sheets regardless (best-effort)
  try {
    await updateMatchField(c.env, matchId, "lobby_url", lobbyUrl)
  } catch {}

  return c.json({ ok: true, alive, lobbyUrl, channel })
})

app.post("/api/match/:matchId/action", async (c) => {
  const matchId = c.req.param("matchId")
  const sessionUser = await readSessionUser(c)

  let body: { action?: string; player?: string; slot?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: "Invalid JSON" }, 400)
  }

  const { action, player, slot } = body
  if (!action || !player || !slot) {
    return c.json({ error: "action, player, and slot required" }, 400)
  }
  if (!["pick", "ban", "protect"].includes(action)) {
    return c.json({ error: "Invalid action" }, 400)
  }

  const status = action === "pick" ? "picked" : action === "ban" ? "banned" : "protected"

  // #TEST-MODE-START
  const actionCfgMap = await getConfigMap(c.env)
  if (isTestMode(actionCfgMap)) {
    return c.json({ ok: true, slot, action, player, status, simulated: true })
  }
  // #TEST-MODE-END

  try {
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

    const existingRowIdx = rows.findIndex(
      (r) => r[matchIdIdx]?.trim() === matchId && r[slotIdx]?.trim() === slot
    )

    const beforeJson = existingRowIdx >= 0 ? JSON.stringify(rows[existingRowIdx]) : "{}"

    if (existingRowIdx >= 0) {
      const sheetRow = existingRowIdx + 2
      const writes: Promise<void>[] = []
      if (action === "pick" && pickedByIdx >= 0) {
        writes.push(writeSheetCell(c.env, `match_maps!${colLetter(pickedByIdx)}${sheetRow}`, player))
      } else if (action === "ban" && bannedByIdx >= 0) {
        writes.push(writeSheetCell(c.env, `match_maps!${colLetter(bannedByIdx)}${sheetRow}`, player))
      }
      if (statusIdx >= 0) {
        writes.push(writeSheetCell(c.env, `match_maps!${colLetter(statusIdx)}${sheetRow}`, status))
      }
      await Promise.all(writes)
    } else {
      const newRow = new Array(Math.max(norm.length, 9)).fill("")
      if (matchIdIdx >= 0) newRow[matchIdIdx] = matchId
      if (slotIdx >= 0)    newRow[slotIdx] = slot
      if (mapIdIdx >= 0)   newRow[mapIdIdx] = slot
      if (statusIdx >= 0)  newRow[statusIdx] = status
      if (action === "pick" && pickedByIdx >= 0)  newRow[pickedByIdx] = player
      if (action === "ban" && bannedByIdx >= 0)    newRow[bannedByIdx] = player
      await appendSheetRow(c.env, "match_maps", newRow)
    }

    const afterState = { matchId, slot, action, player, status }
    await appendAuditLog(
      c.env,
      sessionUser?.username ?? "unknown",
      action,
      "match_map",
      `${matchId}:${slot}`,
      beforeJson,
      JSON.stringify(afterState),
    ).catch(() => {})

    return c.json({ ok: true, slot, action, player, status })
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

  // #TEST-MODE-START
  const forfeitCfgMap = await getConfigMap(c.env)
  if (isTestMode(forfeitCfgMap)) {
    return c.json({ ok: true, winner, loser: loserIsA ? playerA : playerB, simulated: true })
  }
  // #TEST-MODE-END

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
