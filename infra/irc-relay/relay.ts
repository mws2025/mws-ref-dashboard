import { Client } from "irc-framework"

const IRC_HOST = "irc.ppy.sh"
const IRC_PORT = 6667
const IRC_BOT_USERNAME = process.env.IRC_BOT_USERNAME ?? ""
const IRC_BOT_PASSWORD = process.env.IRC_BOT_PASSWORD ?? ""
const IRC_RELAY_SECRET = process.env.IRC_RELAY_SECRET ?? ""
const RELAY_PORT = parseInt(process.env.RELAY_PORT ?? "7000", 10)

if (!IRC_BOT_USERNAME || !IRC_BOT_PASSWORD || !IRC_RELAY_SECRET) {
  console.error("[FATAL] Missing env: IRC_BOT_USERNAME, IRC_BOT_PASSWORD, IRC_RELAY_SECRET")
  process.exit(1)
}

type RelayEvent = { ts: string; from: string; channel: string; message: string }
type SseClient = { controller: ReadableStreamDefaultController<Uint8Array>; channel: string }

const encoder = new TextEncoder()
const sseClients = new Set<SseClient>()
const joinedChannels = new Set<string>()
const irc = new Client()
let ircConnected = false
let makeQueue: Promise<void> = Promise.resolve()

function isLobbyChannel(value: string): boolean {
  return /^#mp_\d+$/.test(value)
}

function antiSpam(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, "0").slice(0, 8)
}

const ANTI_SPAM_SUBCMDS = ["map", "mods", "timer", "start"]

function applyAntiSpam(message: string): string {
  const trimmed = message.trimEnd()
  const subcommand = trimmed.match(/^!mp\s+(\w+)/i)?.[1]?.toLowerCase()
  return subcommand && ANTI_SPAM_SUBCMDS.includes(subcommand) ? `${trimmed} ${antiSpam()}` : trimmed
}

function createdLobbyId(message: string, expectedTitle: string): string | null {
  const match = message.match(/^Created the tournament match https:\/\/osu\.ppy\.sh\/mp\/(\d+)\s+(.+)$/)
  return match?.[2]?.trim() === expectedTitle.trim() ? match[1] ?? null : null
}

function broadcast(event: RelayEvent): void {
  const data = encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
  for (const client of sseClients) {
    if (client.channel !== event.channel) continue
    try {
      client.controller.enqueue(data)
    } catch {
      sseClients.delete(client)
    }
  }
}

irc.connect({
  host: IRC_HOST,
  port: IRC_PORT,
  nick: IRC_BOT_USERNAME,
  password: IRC_BOT_PASSWORD,
  auto_reconnect: true,
  auto_reconnect_wait: 5000,
  auto_reconnect_max_retries: 999,
  ping_interval: 30,
  ping_timeout: 120,
})

irc.on("registered", () => {
  console.log(`[IRC] Connected as ${IRC_BOT_USERNAME}`)
  ircConnected = true
  for (const channel of joinedChannels) irc.join(channel)
})

irc.on("close", () => {
  console.log("[IRC] Connection closed")
  ircConnected = false
})

irc.on("reconnecting", () => {
  console.log("[IRC] Reconnecting...")
  ircConnected = false
})

irc.on("message", (event: { nick: string; target: string; message: string }) => {
  const relayEvent = {
    ts: new Date().toISOString(),
    from: event.nick,
    channel: event.target,
    message: event.message,
  }
  console.log(`[MSG] ${relayEvent.channel} <${relayEvent.from}> ${relayEvent.message}`)
  broadcast(relayEvent)
})

function ensureJoined(channel: string): Promise<void> {
  if (joinedChannels.has(channel)) return Promise.resolve()
  return new Promise((resolve) => {
    joinedChannels.add(channel)
    irc.join(channel)
    const onJoin = (event: { nick: string; channel: string }) => {
      if (event.channel !== channel || event.nick !== IRC_BOT_USERNAME) return
      clearTimeout(timeout)
      irc.removeListener("join", onJoin)
      resolve()
    }
    const timeout = setTimeout(() => {
      irc.removeListener("join", onJoin)
      resolve()
    }, 3000)
    irc.on("join", onJoin)
  })
}

function createLobby(title: string): Promise<{ mpId: string; lobbyUrl: string }> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (result: { mpId: string; lobbyUrl: string } | Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      irc.removeListener("message", onMessage)
      if (result instanceof Error) reject(result)
      else resolve(result)
    }
    const onMessage = (event: { nick: string; target: string; message: string }) => {
      if (event.nick !== "BanchoBot") return
      const mpId = createdLobbyId(event.message, title)
      if (mpId) finish({ mpId, lobbyUrl: `https://osu.ppy.sh/mp/${mpId}` })
    }
    const timeout = setTimeout(() => finish(new Error("Timed out waiting for BanchoBot")), 12_000)
    irc.on("message", onMessage)
    irc.say("BanchoBot", `!mp make ${title}`)
    console.log(`[MAKE] ${title}`)
  })
}

async function enqueueLobbyCreation(title: string): Promise<{ mpId: string; lobbyUrl: string }> {
  const previous = makeQueue
  let release: () => void = () => {}
  makeQueue = new Promise<void>((resolve) => { release = resolve })
  await previous.catch(() => {})
  try {
    return await createLobby(title)
  } finally {
    release()
  }
}

function checkAuth(req: Request): boolean {
  return req.headers.get("x-relay-secret") === IRC_RELAY_SECRET
}

const server = Bun.serve({
  idleTimeout: 0,
  port: RELAY_PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok", connected: ircConnected, channelIsolation: true, atomicLobbyCreation: true })
    }

    if (!checkAuth(req)) return Response.json({ error: "Unauthorized" }, { status: 401 })

    if (req.method === "POST" && url.pathname === "/make") {
      let body: { title?: string }
      try { body = await req.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
      const title = body.title?.trim() ?? ""
      if (!title) return Response.json({ error: "title required" }, { status: 400 })
      if (!ircConnected) return Response.json({ error: "IRC not connected" }, { status: 503 })
      try {
        const lobby = await enqueueLobbyCreation(title)
        return Response.json({ ok: true, title, ...lobby })
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Lobby creation failed" }, { status: 504 })
      }
    }

    if (req.method === "POST" && url.pathname === "/send") {
      let body: { channel?: string; message?: string }
      try { body = await req.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
      const channel = body.channel?.trim() ?? ""
      const message = body.message?.trim() ?? ""
      if (!isLobbyChannel(channel) || !message) {
        return Response.json({ error: "valid lobby channel and message required" }, { status: 400 })
      }
      if (!ircConnected) return Response.json({ error: "IRC not connected" }, { status: 503 })
      await ensureJoined(channel)
      const outgoing = applyAntiSpam(message)
      irc.say(channel, outgoing)
      console.log(`[SEND] ${channel} > ${outgoing}`)
      return Response.json({ ok: true, channel })
    }

    if (req.method === "GET" && url.pathname === "/stream") {
      const channel = url.searchParams.get("channel")?.trim() ?? ""
      if (!isLobbyChannel(channel)) {
        return Response.json({ error: "valid lobby channel required" }, { status: 400 })
      }
      let clientRef: SseClient
      let heartbeat: ReturnType<typeof setInterval> | undefined
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          clientRef = { controller, channel }
          sseClients.add(clientRef)
          heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": heartbeat\n\n"))
            } catch {
              if (heartbeat) clearInterval(heartbeat)
              sseClients.delete(clientRef)
            }
          }, 8000)
        },
        cancel() {
          if (heartbeat) clearInterval(heartbeat)
          sseClients.delete(clientRef)
        },
      })
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      })
    }

    return Response.json({ error: "Not found" }, { status: 404 })
  },
})

console.log(`[Relay] Listening on port ${server.port}`)
