import { afterEach, expect, test } from "bun:test"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createServer, type Server } from "node:net"

let child: ChildProcessWithoutNullStreams | undefined
let ircServer: Server | undefined

afterEach(async () => {
  child?.kill()
  if (ircServer) await new Promise<void>((resolve) => ircServer?.close(() => resolve()))
  child = undefined
  ircServer = undefined
})

test("unregistered IRC makes health fail and exits for PM2 recovery", async () => {
  ircServer = createServer()
  await new Promise<void>((resolve) => ircServer?.listen(0, "127.0.0.1", resolve))
  const address = ircServer.address()
  if (!address || typeof address === "string") throw new Error("Missing test IRC port")

  child = spawn(process.execPath, ["run", "relay.ts"], {
    cwd: import.meta.dir,
    env: {
      ...process.env,
      IRC_HOST: "127.0.0.1",
      IRC_PORT: String(address.port),
      IRC_BOT_USERNAME: "TestRelay",
      IRC_BOT_PASSWORD: "test-password",
      IRC_RELAY_SECRET: "test-secret",
      IRC_DISCONNECT_GRACE_MS: "1000",
      RELAY_PORT: "0",
    },
  })

  const stdout: string[] = []
  const stderr: string[] = []
  child.stdout.on("data", (data: Buffer) => stdout.push(data.toString()))
  child.stderr.on("data", (data: Buffer) => stderr.push(data.toString()))

  const deadline = Date.now() + 5_000
  let port: number | undefined
  while (Date.now() < deadline && !port) {
    port = Number(stdout.join("").match(/Listening on port (\d+)/)?.[1]) || undefined
    if (!port) await Bun.sleep(50)
  }
  if (!port) throw new Error(`Relay did not start: ${stderr.join("")}`)

  const health = await fetch(`http://127.0.0.1:${port}/health`)
  expect(health.status).toBe(503)
  expect((await health.json() as { connected: boolean }).connected).toBe(false)

  const exitCode = await new Promise<number | null>((resolve) => child?.once("exit", resolve))
  expect(exitCode).toBe(1)
  expect(stderr.join("")).toContain("Disconnected for 1000ms")
}, 15_000)
