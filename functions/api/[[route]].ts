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
  playerA: string
  playerB: string
  date: string
  time: string
  status: ApiMatchStatus
  lobbyUrl?: string
  winner?: string
  currentMap?: string
  notes?: string
  referee?: string
}

const OSU_AUTH_BASE = "https://osu.ppy.sh"
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

  const tokenJson = await tokenRes.json<{ access_token?: string }>()
  if (!tokenJson.access_token) {
    throw new Error("Google OAuth token response missing access_token")
  }

  return tokenJson.access_token
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

  const payload = await res.json<{ values?: string[][] }>()
  return payload.values ?? []
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

function mapMatchRecord(record: SheetRecord, playersById: Map<string, string>): ApiMatch {
  const playerA = firstValue(record, ["player_a", "team_a", "playera", "team_a_id"])
  const playerB = firstValue(record, ["player_b", "team_b", "playerb", "team_b_id"])
  const referee = firstValue(record, ["referee", "ref"])
  const notes = firstValue(record, ["notes"])

  return {
    id: firstValue(record, ["match_id", "id"]),
    round: firstValue(record, ["round"]),
    playerA: getPlayerName(playerA, playersById),
    playerB: getPlayerName(playerB, playersById),
    date: firstValue(record, ["date", "match_date", "scheduled_date", "scheduled_at"]) || "TBD",
    time: firstValue(record, ["time", "match_time", "scheduled_time", "start_time"]) || "TBD",
    status: normalizeMatchStatus(firstValue(record, ["status"])),
    lobbyUrl: firstValue(record, ["lobby_url", "lobby", "mp_link"]) || undefined,
    winner: firstValue(record, ["winner"]) || undefined,
    currentMap: firstValue(record, ["current_map", "current_map_id"]) || undefined,
    notes: notes || undefined,
    referee: referee || undefined,
  }
}

async function getMatches(env: Bindings): Promise<ApiMatch[]> {
  const [matchValues, playerValues] = await Promise.all([
    getSheetValues(env, "matches!A1:Z"),
    getSheetValues(env, "players!A1:Z"),
  ])
  const playersById = mapPlayersById(sheetRowsToRecords(playerValues))

  return sheetRowsToRecords(matchValues)
    .map((record) => mapMatchRecord(record, playersById))
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

  const tokenRes = await fetch(`${OSU_AUTH_BASE}/oauth/token`, {
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

  const tokenJson = await tokenRes.json<{ access_token?: string }>()
  if (!tokenJson.access_token) {
    throw new Error("osu! token response missing access_token")
  }

  return tokenJson.access_token
}

async function fetchOsuUser(accessToken: string): Promise<OsuUser> {
  const userRes = await fetch(`${OSU_AUTH_BASE}/api/v2/me/osu`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  })

  if (!userRes.ok) {
    const reason = await userRes.text()
    throw new Error(`osu! user lookup failed: ${userRes.status} ${reason}`)
  }

  const user = await userRes.json<Partial<OsuUser>>()
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

app.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (path === "/api/health" || path === "/api/public/state" || path.startsWith("/api/auth/")) {
    return next()
  }

  const sessionUser = await readSessionUser(c)
  if (!sessionUser) {
    return c.json({ error: "Unauthorized" }, 401)
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

    const tokenRes = await fetch(`${OSU_AUTH_BASE}/oauth/token`, {
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

    const tokenJson = await tokenRes.json<{ expires_in?: number; token_type?: string }>()
    return c.json({
      ok: true,
      status: tokenRes.status,
      osuClientId: clientId,
      osuRedirectUri: c.env.OSU_REDIRECT_URI?.trim() ?? null,
      tokenType: tokenJson.token_type ?? null,
      expiresIn: tokenJson.expires_in ?? null,
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
    const osuUser = await fetchOsuUser(accessToken)
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

export const onRequest = handle(app)
