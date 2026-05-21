import { useState } from "react"
import { Button } from "@/components/ui/button"
import { MOCK_USER } from "@/data/constants"
import { BANCHO_COMMANDS, IRC_BOT, IRC_LOG } from "@/data/mock"
import { withAntiSpam } from "@/lib/irc"

export function IrcChat() {
  const [draft, setDraft] = useState("")
  const isMp = draft.trimEnd().startsWith("!mp")
  const previewCmd = isMp ? `${draft.trimEnd()} ········` : draft

  function send() {
    if (!draft.trim()) return
    const _payload = withAntiSpam(draft)
    // TODO: transmit _payload via IRC client
    void _payload
    setDraft("")
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 text-xs font-mono">
        {IRC_LOG.map((e, i) => (
          <div key={i} className="leading-relaxed">
            <span className="text-muted-foreground/60">[{e.time}]</span>{" "}
            {e.type === "ref" ? (
              <>
                <span className="text-primary font-semibold">{e.sender}:</span>
                {" "}
                <span className="text-muted-foreground">&lt;{e.ref}&gt;:</span>
                {" "}
                <span className="text-foreground/80">{e.msg}</span>
              </>
            ) : (
              <>
                <span className={e.type === "bancho" ? "text-accent font-semibold" : "text-[#5f7f63] font-semibold"}>
                  {e.sender}:
                </span>
                {" "}
                <span className="text-foreground/80">{e.msg}</span>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Quick commands */}
      <div className="flex-shrink-0 border-t border-border px-3 py-2">
        <p className="mb-1.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">Quick commands</p>
        <div className="flex flex-wrap gap-1.5">
          {BANCHO_COMMANDS.map((c) => (
            <button
              key={c.label}
              onClick={() => setDraft(c.cmd)}
              className="cursor-pointer rounded border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
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
            placeholder="!mp start 30"
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            onKeyDown={(e) => { if (e.key === "Enter") send() }}
          />
          <Button size="sm" className="flex-shrink-0 text-xs" onClick={send}>
            Send
          </Button>
        </div>
        <p className="font-mono text-xs text-muted-foreground/50 truncate">
          {draft
            ? <>
                <span className="text-primary/60">{IRC_BOT}:</span>
                {" "}
                <span className="text-muted-foreground/70">&lt;{MOCK_USER.name}&gt;:</span>
                {" "}
                {previewCmd}
                {isMp && <span className="text-muted-foreground/30"> ← anti-spam suffix</span>}
              </>
            : `sends as: ${IRC_BOT}: <${MOCK_USER.name}>: …`
          }
        </p>
      </div>
    </div>
  )
}
