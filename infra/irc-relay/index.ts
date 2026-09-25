type Webhook = { name: string; url: string }
type BridgeConfig = { irc: { channel: string }; webhooks: Webhook[] }
type RelayEvent = { ts: string; from: string; channel: string; message: string }

async function forward(event: RelayEvent, config: BridgeConfig): Promise<void> {
  if (event.channel !== config.irc.channel) return
  const time = new Date(event.ts).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
  })
  const message = event.message
    .replace(/<@([!&]?)(\d+)>/g, "<@$1\u200b$2>")
    .replace(/@everyone/g, "@\u200beveryone")
    .replace(/@here/g, "@\u200bhere")
  const body = JSON.stringify({
    content: `[${time}] \`${event.from}\`: ${message}`,
    flags: 4,
    allowed_mentions: { parse: [] },
  })
  console.log(`[MSG] <${event.from}> ${event.message}`)
  await Promise.all(config.webhooks.map(async (hook) => {
    try {
      const response = await fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      })
      if (!response.ok) console.error(`[Error] Failed to send to ${hook.name}: ${response.status}`)
    } catch (error) {
      console.error(`[Error] Failed to send to ${hook.name}:`, error)
    }
  }))
}

async function consumeStream(response: Response, config: BridgeConfig): Promise<void> {
  if (!response.body) throw new Error("Relay stream has no body")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let dataLines: string[] = []

  const processLine = async (line: string): Promise<void> => {
    if (!line) {
      if (dataLines.length) {
        try {
          await forward(JSON.parse(dataLines.join("\n")) as RelayEvent, config)
        } catch (error) {
          console.error("[Error] Invalid relay event:", error)
        }
        dataLines = []
      }
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) throw new Error("Relay stream closed")
    buffer += decoder.decode(value, { stream: true })
    let newline = buffer.indexOf("\n")
    while (newline !== -1) {
      await processLine(buffer.slice(0, newline).replace(/\r$/, ""))
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf("\n")
    }
  }
}

async function main(): Promise<void> {
  const config = await Bun.file("./config.json").json() as BridgeConfig
  const secret = process.env.IRC_RELAY_SECRET ?? ""
  const port = process.env.RELAY_PORT ?? "7000"
  if (!secret || !config.irc?.channel || !config.webhooks?.length) {
    throw new Error("Missing relay secret, IRC channel, or webhooks")
  }
  const streamUrl = new URL(`http://127.0.0.1:${port}/stream`)
  streamUrl.searchParams.set("channel", config.irc.channel)

  console.log(`[Relay] Following ${config.irc.channel} through the portal IRC connection`)
  while (true) {
    try {
      const response = await fetch(streamUrl, {
        headers: { "X-Relay-Secret": secret, Accept: "text/event-stream" },
      })
      if (!response.ok) throw new Error(`Relay stream returned ${response.status}`)
      console.log("[Relay] Stream connected")
      await consumeStream(response, config)
    } catch (error) {
      console.error("[Relay] Stream disconnected:", error)
    }
    await Bun.sleep(5000)
  }
}

main().catch((error) => {
  console.error("[FATAL] Webhook bridge failed:", error)
  process.exit(1)
})
