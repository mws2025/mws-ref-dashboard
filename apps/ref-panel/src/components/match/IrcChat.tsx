import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { IRC_BOT } from "@/data/mock"

export interface LiveMsg {
  ts: string
  from: string
  message: string
  local?: boolean
}

export interface IrcChatHandle {
  send: (msg: string) => void
}

interface Props {
  channel?: string
  refName: string
  playerA?: string
  playerB?: string
  playerAOsuId?: string
  playerBOsuId?: string
  isDemo?: boolean
  isTestMode?: boolean
  nextActionHint?: string
  simulatedMessages?: LiveMsg[]
  onMessagesChange?: (msgs: LiveMsg[]) => void
  onNewMessage?: (msg: LiveMsg) => void
}

export const IrcChat = forwardRef<IrcChatHandle, Props>(function IrcChat(
  { channel, refName, playerA, playerB, playerAOsuId, playerBOsuId, isDemo = false, isTestMode = false, nextActionHint, simulatedMessages, onMessagesChange, onNewMessage },
  ref
) {
  const [messages, setMessages] = useState<LiveMsg[]>([])
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [connected, setConnected] = useState(false)
  const [timerEndsAt, setTimerEndsAt] = useState<number | null>(null)
  const [timerTotal, setTimerTotal] = useState(0)
  const [timerRemaining, setTimerRemaining] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!channel) return
    // #TEST-MODE-START
    if (isTestMode) {
      setConnected(true)
      return () => setConnected(false)
    }
    // #TEST-MODE-END
    const url = `/api/irc/stream?channel=${encodeURIComponent(channel)}`
    const es = new EventSource(url, { withCredentials: true })
    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as LiveMsg
        setMessages((prev) => [...prev, msg])
        onNewMessage?.(msg)
      } catch {
        // Ignore malformed SSE payloads without dropping the stream.
      }
    }
    return () => {
      es.close()
      setConnected(false)
    }
  }, [channel, isTestMode, onNewMessage])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    onMessagesChange?.(messages)
  }, [messages, onMessagesChange])

  // Timer tick
  useEffect(() => {
    if (!timerEndsAt) return
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000))
      setTimerRemaining(remaining)
      if (remaining === 0) {
        setTimerEndsAt(null)
        clearInterval(interval)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [timerEndsAt])

async function send(override?: string) {
    const msg = override ?? draft.trim()
    if (!msg || !channel || sending) return
    setSending(true)
    try {
      await fetch("/api/irc/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, message: msg }),
      })
      setMessages((prev) => [
        ...prev,
        { ts: new Date().toISOString(), from: IRC_BOT, message: `<${refName}>: ${msg}`, local: true },
      ])
      if (!override) setDraft("")

      // Timer detection
      const timerMatch = msg.match(/^!mp\s+timer\s+(\d+)/i)
      if (timerMatch) {
        const secs = parseInt(timerMatch[1], 10)
        setTimerTotal(secs)
        setTimerEndsAt(Date.now() + secs * 1000)
        setTimerRemaining(secs)
      }
      if (/^!mp\s+aborttimer/i.test(msg) || /^!mp\s+start/i.test(msg)) {
        setTimerEndsAt(null)
      }
    } finally {
      setSending(false)
    }
  }

  useImperativeHandle(ref, () => ({ send: (msg: string) => { void send(msg) } }))

  function fmtTime(ts: string): string {
    try {
      return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    } catch {
      return ts
    }
  }

  function fmtCountdown(secs: number): string {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Status bar */}
      <div className="flex-shrink-0 flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span
          className={`h-2 w-2 flex-shrink-0 rounded-full ${channel ? (connected ? "bg-[#5f7f63]" : "bg-destructive") : "bg-muted-foreground/40"}`}
        />
        <span className="flex-1 truncate text-xs text-muted-foreground">
          {channel
            ? isTestMode
              ? `${channel} - test mode (simulated)`
              : connected ? channel : `${channel} - reconnecting…`
            : "No lobby - create one first"}
        </span>
        {timerEndsAt && (
          <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-primary">
            Timer active: {fmtCountdown(timerRemaining)}
          </span>
        )}
      </div>

      {nextActionHint && (
        <div className="flex-shrink-0 border-b border-border bg-primary/5 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Next action</p>
          <p className="mt-0.5 text-xs text-foreground">{nextActionHint}</p>
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 text-xs font-mono">
        {(() => {
          const allMessages = [...messages, ...(simulatedMessages ?? [])].sort((a, b) => a.ts.localeCompare(b.ts))
          if (allMessages.length === 0) return (
            <p className="text-muted-foreground/40 text-center pt-4">
              {channel ? "Waiting for messages…" : "Connect a lobby to see IRC messages."}
            </p>
          )
          return allMessages.map((e, i) => (
          <div key={i} className="leading-relaxed">
            <span className="text-muted-foreground/60">[{fmtTime(e.ts)}]</span>{" "}
            {e.local ? (
              <>
                <span className="text-primary font-semibold">{e.from}:</span>{" "}
                <span className="text-foreground/80">{e.message}</span>
              </>
            ) : e.from === "BanchoBot" ? (
              <>
                <span className="text-accent font-semibold">{e.from}:</span>{" "}
                <span className="text-foreground/80">{e.message}</span>
              </>
            ) : (
              <>
                <span className="text-[#5f7f63] font-semibold">{e.from}:</span>{" "}
                <span className="text-foreground/80">{e.message}</span>
              </>
            )}
          </div>
        ))
        })()}
        <div ref={bottomRef} />
      </div>

      {/* Quick commands */}
      <div className="relative flex-shrink-0 border-t border-border px-3 py-2">
        {timerEndsAt && (
          <div
            className="pointer-events-none absolute top-0 left-0 h-px bg-primary transition-[width] duration-500 ease-linear"
            style={{ width: `${timerTotal > 0 ? (timerRemaining / timerTotal) * 100 : 0}%` }}
          />
        )}
        <p className="mb-1.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">Quick commands</p>
        <div className="flex flex-wrap gap-1.5">
          {([
            ...(playerA ? [{ label: `Invite ${playerA}`, cmd: `!mp invite #${playerAOsuId ?? playerA}`, immediate: true }] : []),
            ...(playerB ? [{ label: `Invite ${playerB}`, cmd: `!mp invite #${playerBOsuId ?? playerB}`, immediate: true }] : []),
            { label: "Settings",    cmd: "!mp settings",  immediate: true  },
            { label: "Move player", cmd: "!mp move ",     immediate: false },
            { label: "Timer",       cmd: "!mp timer 120", immediate: true  },
            { label: "Start",       cmd: "!mp start 10",  immediate: true  },
            { label: "Abort",       cmd: "!mp abort",     immediate: true  },
          ] as { label: string; cmd: string; immediate: boolean }[]).map((c) => (
            <button
              key={c.label}
              disabled={!channel || isDemo}
              onClick={() => c.immediate ? void send(c.cmd) : setDraft(c.cmd)}
              className="cursor-pointer rounded border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-border p-2 space-y-1.5">
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={isDemo ? "Demo mode - send disabled" : channel ? "Send message" : "Create lobby first"}
            disabled={!channel || isDemo}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40"
            onKeyDown={(e) => { if (e.key === "Enter") void send() }}
          />
          <Button size="sm" className="flex-shrink-0 text-xs" onClick={() => void send()} disabled={!channel || sending || isDemo}>
            Send
          </Button>
        </div>
      </div>
    </div>
  )
})
