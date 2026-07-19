import "server-only"
import { getEnv, requireEnv } from "./env"

// --- base64url helpers (Workers has atob/btoa) ---
function b64urlFromString(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64urlFromBytes(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return b64urlFromString(binary)
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, "\n") // env vars often escape newlines
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "")
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

// isolate-level token cache — JWT mint is cheap and only runs on a miss
let cachedToken: { value: string; expiresAt: number } | null = null

async function mintAssertion(email: string, pem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: "RS256", typ: "JWT" }
  const claim = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }
  const unsigned = `${b64urlFromString(JSON.stringify(header))}.${b64urlFromString(
    JSON.stringify(claim),
  )}`

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  )
  return `${unsigned}.${b64urlFromBytes(new Uint8Array(signature))}`
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }

  const env = await getEnv()
  const email = requireEnv(env, "GOOGLE_SA_EMAIL")
  const pem = requireEnv(env, "GOOGLE_SA_PRIVATE_KEY")

  const assertion = await mintAssertion(email, pem)
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  })
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`)
  }
  const json = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
  return cachedToken.value
}

/**
 * Read a range from a spreadsheet and return the raw cell grid.
 * `range` is A1 notation, optionally tab-qualified (e.g. "Sheet1!A2:Z").
 */
export async function readSheetValues(
  spreadsheetId: string,
  range?: string,
): Promise<string[][]> {
  const token = await getAccessToken()
  const path = range
    ? `${spreadsheetId}/values/${encodeURIComponent(range)}`
    : `${spreadsheetId}/values/A:ZZ`
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    headers: { authorization: `Bearer ${token}` },
    // We cache the shaped result upstream via unstable_cache, so skip Next's
    // fetch cache here (rotating bearer token would fragment its cache key).
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`Sheets read failed (${spreadsheetId}): ${res.status} ${await res.text()}`)
  }
  const json = (await res.json()) as { values?: string[][] }
  return json.values ?? []
}
