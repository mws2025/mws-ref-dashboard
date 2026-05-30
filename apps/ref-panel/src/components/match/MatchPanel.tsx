import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { INVENTORY_A, INVENTORY_B } from "@/data/mock"
import type { IngKey, Inventory, Match, PoolMap } from "@/types"
import { LiveBadge } from "../LiveBadge"
import { IrcChat, type IrcChatHandle, type LiveMsg } from "./IrcChat"
import { MapActionModal } from "./MapActionModal"
import { MappoolTable } from "./MappoolTable"
import { PlayerColumn } from "./PlayerColumn"
import { RecipePanel } from "./RecipePanel"
import { TestSimPanel } from "./TestSimPanel"

type EventKind = "join" | "leave" | "roll" | "abort" | "other_join" | "other_roll" | "info"

interface MatchEvent {
  id: string
  ts: string
  kind: EventKind
  text: string
}

function parseBanchoEvent(msg: string, ts: string, playerA: string, playerB: string): MatchEvent | null {
  const matchPlayers = new Set([playerA.toLowerCase(), playerB.toLowerCase()])
  const id = `${ts}-${Math.random().toString(36).slice(2, 7)}`

  const joinM = msg.match(/^(.+) joined in slot (\d+)\.$/)
  if (joinM) {
    const who = joinM[1]; const slot = joinM[2]
    const kind: EventKind = matchPlayers.has(who.toLowerCase()) ? "join" : "other_join"
    const text = kind === "join" ? `${who} joined slot ${slot}` : `${who} joined slot ${slot} (spectator/ref)`
    return { id, ts, kind, text }
  }

  const leaveM = msg.match(/^(.+) left the game\.$/)
  if (leaveM) return { id, ts, kind: "leave", text: `${leaveM[1]} left the game` }

  const rollM = msg.match(/^(.+) rolled (\d+) point\(s\)$/)
  if (rollM) {
    const who = rollM[1]; const val = rollM[2]
    const kind: EventKind = matchPlayers.has(who.toLowerCase()) ? "roll" : "other_roll"
    const text = `${who} rolled ${val}`
    return { id, ts, kind, text }
  }

  if (msg === "The match has been aborted.") {
    return { id, ts, kind: "abort", text: "Match aborted" }
  }

  return null
}

function lobbyUrlToChannel(url?: string): string | undefined {
  if (!url) return undefined
  if (url.startsWith("#")) return url
  const m = url.match(/\/mp\/(\d+)/)
  if (m) return `#mp_${m[1]}`
  if (/^\d+$/.test(url.trim())) return `#mp_${url.trim()}`
  return undefined
}

interface Props {
  match: Match
  onBack: () => void
  isDemo?: boolean
  testMode?: boolean
}

export function MatchPanel({ match, onBack, isDemo = false, testMode = false }: Props) {
  const [poolWidth, setPoolWidth] = useState(770)
  const [selectedMap, setSelectedMap] = useState<PoolMap | null>(null)
  const [liveMappool, setLiveMappool] = useState<PoolMap[] | null>(null)
  const [liveInventory, setLiveInventory] = useState<{ a: Inventory; b: Inventory } | null>(null)
  const [liveScoreA, setLiveScoreA] = useState<number>(match.scoreA ?? 0)
  const [liveScoreB, setLiveScoreB] = useState<number>(match.scoreB ?? 0)
  const [liveMatchStatus, setLiveMatchStatus] = useState(match.status)
  const [matchRules, setMatchRules] = useState<Record<string, string>>({})
  const [enforceNF, setEnforceNF] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [liveLobbyUrl, setLiveLobbyUrl] = useState<string | undefined>(undefined)
  const [liveEvents, setLiveEvents] = useState<MatchEvent[]>([])
  const [simulatedIrcMessages, setSimulatedIrcMessages] = useState<LiveMsg[]>([])
  const [testResultUnlocked, setTestResultUnlocked] = useState(false)
  const dragState = useRef<{ startX: number; startW: number } | null>(null)
  const ircMessagesRef = useRef<LiveMsg[]>([])
  const ircRef = useRef<IrcChatHandle>(null)
  const invSaveTimers = useRef<{ a: ReturnType<typeof setTimeout> | null; b: ReturnType<typeof setTimeout> | null }>({ a: null, b: null })

  function scheduleInvSave(player: "a" | "b", playerName: string, inv: Inventory) {
    if (testMode) return
    const existing = invSaveTimers.current[player]
    if (existing) clearTimeout(existing)
    invSaveTimers.current[player] = setTimeout(async () => {
      invSaveTimers.current[player] = null
      try {
        const res = await fetch(`/api/match/${match.id}/inventory`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ player: playerName, ...inv }),
        })
        if (!res.ok) {
          const err = await res.json() as { error?: string }
          toast.error(err.error ?? "Failed to save inventory")
        }
      } catch {
        toast.error("Failed to save inventory")
      }
    }, 1500)
  }

  const handleNewIrcMessage = useCallback((msg: LiveMsg) => {
    if (msg.from !== "BanchoBot") return
    const event = parseBanchoEvent(msg.message, msg.ts, match.playerA, match.playerB)
    if (event) setLiveEvents((prev) => [...prev, event])
  }, [match.playerA, match.playerB])

  useEffect(() => {
    async function load() {
      const params = new URLSearchParams({ mappool: match.mappool ?? "", playerA: match.playerA, playerB: match.playerB })
      const [mpRes, invRes, cfgRes] = await Promise.all([
        fetch(`/api/match/${match.id}/mappool?${params}`, { credentials: "include" }),
        fetch(`/api/match/${match.id}/inventory?${params}`, { credentials: "include" }),
        fetch("/api/public/config"),
      ])
      if (mpRes.ok) {
        const data = await mpRes.json() as { mappool: PoolMap[]; scoreA: number; scoreB: number }
        setLiveMappool(data.mappool)
        setLiveScoreA(data.scoreA)
        setLiveScoreB(data.scoreB)
      }
      if (invRes.ok) {
        const data = await invRes.json() as { a: Inventory; b: Inventory }
        setLiveInventory(data)
      }
      if (cfgRes.ok) {
        const cfg = await cfgRes.json() as { rules?: Record<string, string>; enforceNF?: boolean }
        if (cfg.rules) setMatchRules(cfg.rules)
        if (typeof cfg.enforceNF === "boolean") setEnforceNF(cfg.enforceNF)
      }
    }
    void load()
  }, [match.id])

  function injectIrcMsg(from: string, message: string, local = false) {
    const msg: LiveMsg = { ts: new Date().toISOString(), from, message, ...(local ? { local: true } : {}) }
    setSimulatedIrcMessages(prev => [...prev, msg])
    handleNewIrcMessage(msg)
  }

  function simulateGameResult(slot: string, winner: string) {
    setLiveMappool(prev => prev ? prev.map(m =>
      m.slot === slot ? { ...m, status: "completed", winner } : m
    ) : prev)
    const isA = winner === match.playerA
    const newScoreA = liveScoreA + (isA ? 1 : 0)
    const newScoreB = liveScoreB + (!isA ? 1 : 0)
    if (isA) setLiveScoreA(s => s + 1)
    else setLiveScoreB(s => s + 1)
    announceGameResult(newScoreA, newScoreB, isA ? match.playerB : match.playerA)
  }

  function announceGameResult(scoreA: number, scoreB: number, nextPicker: string) {
    const winsNeeded = Math.ceil((match.bestOf ?? 5) / 2)
    const matchOver = scoreA >= winsNeeded || scoreB >= winsNeeded
    ircRef.current?.send(`${match.playerA} | ${scoreA} - ${scoreB} | ${match.playerB}`)
    if (!matchOver) {
      setTimeout(() => ircRef.current?.send(`Next to pick: ${nextPicker}`), 600)
      setTimeout(() => ircRef.current?.send(`!mp timer 120`), 1200)
    }
  }

  async function sendIrc(channel: string, message: string) {
    await fetch("/api/irc/send", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, message }),
    })
  }

  function getPickMods(pool: string, nf: boolean): string {
    const p = pool.toUpperCase()
    if (p === "FM" || p === "TB") return "Freemod"
    if (p === "HD") return nf ? "HDNF" : "HD"
    if (p === "HR") return nf ? "HRNF" : "HR"
    if (p === "DT") return nf ? "DTNF" : "DT"
    return nf ? "NF" : "None"
  }

  async function sendPickSequence(map: PoolMap, channel: string) {
    if (map.beatmapId) await sendIrc(channel, `!mp map ${map.beatmapId} 0`)
    await sendIrc(channel, `!mp mods ${getPickMods(map.pool, enforceNF)}`)
    await sendIrc(channel, "!mp timer 120")
  }

  async function createLobby() {
    const res = await fetch(`/api/match/${match.id}/create-lobby`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerA: match.playerA,
        playerB: match.playerB,
        refUsername: match.referee ?? "",
      }),
    })
    if (!res.ok) {
      console.error("create-lobby failed", await res.text())
      return
    }
    const data = await res.json() as { lobbyUrl: string; channel: string; followUpCmds: string[] }
    setLiveLobbyUrl(data.lobbyUrl)
    for (const cmd of data.followUpCmds) {
      await sendIrc(data.channel, cmd)
    }
  }

  async function closeLobby() {
    const channel = lobbyUrlToChannel(liveLobbyUrl)
    if (channel) await sendIrc(channel, "!mp close")
    await fetch(`/api/match/${match.id}/close-lobby`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, messages: ircMessagesRef.current }),
    })
  }

  function onDragStart(e: React.MouseEvent) {
    e.preventDefault()
    dragState.current = { startX: e.clientX, startW: poolWidth }

    function onMove(ev: MouseEvent) {
      if (!dragState.current) return
      const dx = ev.clientX - dragState.current.startX
      setPoolWidth(Math.max(200, Math.min(900, dragState.current.startW + dx)))
    }

    function onUp() {
      dragState.current = null
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      {testMode && (
        <div className="flex flex-shrink-0 items-center gap-2 bg-amber-100 px-4 py-2 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          <span className="font-semibold">TEST MODE</span>
          <span className="text-amber-700 dark:text-amber-400">IRC and sheet writes are simulated. Use the Sim tab to run the match flow.</span>
        </div>
      )}
      {/* Header */}
      <header className="flex flex-shrink-0 items-stretch gap-3 border-b border-border px-4">
        <img src="/assets/logo_light.png" alt="Whisked 2026" className="my-2 h-8 w-auto self-center object-contain" />
        <Separator orientation="vertical" className="h-auto" />
        <button
          onClick={onBack}
          className="cursor-pointer self-center text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Dashboard
        </button>
        <Separator orientation="vertical" className="h-auto" />
        <span className="self-center font-heading text-sm">
          {match.playerA} <span className="font-sans normal-case text-muted-foreground">vs</span> {match.playerB}
        </span>
        <div className="self-center"><LiveBadge /></div>
        <div className="ml-auto flex items-center gap-2 self-center">
          {liveLobbyUrl && (
            <span className="font-mono text-xs text-muted-foreground">
              {liveLobbyUrl.match(/\/mp\/(\d+)/)?.[1] ? `mp#${liveLobbyUrl.match(/\/mp\/(\d+)/)![1]}` : liveLobbyUrl}
            </span>
          )}
          {Object.values(matchRules).some(Boolean) && (
            <button
              onClick={() => setRulesOpen(true)}
              className="cursor-pointer rounded border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              Rules
            </button>
          )}
        </div>
      </header>

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Match Rules Reference</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {([
              ["Late",       matchRules.late],
              ["Roll",       matchRules.roll],
              ["Picks/Bans", matchRules.picksBans],
              ["FM",         matchRules.fm],
              ["Warmups",    matchRules.warmups],
              ["Timeout",    matchRules.timeout],
              ["Disconnect", matchRules.disconnect],
              ["Tiebreaker", matchRules.tb],
            ] as [string, string | undefined][]).filter(([, v]) => v).map(([label, value]) => (
              <div key={label}>
                <p className="font-heading text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                <p className="mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* 3-column body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <PlayerColumn
          playerA={match.playerA}
          playerB={match.playerB}
          scoreA={liveScoreA}
          scoreB={liveScoreB}
          bestOf={match.bestOf ?? 9}
          invLoading={liveInventory === null}
          invA={liveInventory?.a ?? INVENTORY_A}
          invB={liveInventory?.b ?? INVENTORY_B}
          round={match.round}
          refName={match.referee ?? "-"}
          streamer={match.streamer}
          onInvAChange={(key: IngKey, delta: number) => setLiveInventory((prev) => {
            if (!prev) return prev
            const next = { ...prev.a, [key]: Math.max(0, (prev.a[key] ?? 0) + delta) }
            scheduleInvSave("a", match.playerA, next)
            return { ...prev, a: next }
          })}
          onInvBChange={(key: IngKey, delta: number) => setLiveInventory((prev) => {
            if (!prev) return prev
            const next = { ...prev.b, [key]: Math.max(0, (prev.b[key] ?? 0) + delta) }
            scheduleInvSave("b", match.playerB, next)
            return { ...prev, b: next }
          })}
          onCreateLobby={() => void createLobby()}
          onJoinLobby={(mpId) => {
            setLiveLobbyUrl(`https://osu.ppy.sh/mp/${mpId}`)
            void fetch(`/api/match/${match.id}/join-lobby`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ mpId }),
            }).then(async (res) => {
              if (!res.ok) return
              const data = await res.json() as { alive?: boolean }
              if (!data.alive) {
                toast.error("Lobby not found", {
                  description: `#mp_${mpId} did not respond. Check the ID or create a new lobby.`,
                })
              }
            })
          }}
          onCloseLobby={() => void closeLobby()}
          onPostResult={() => console.log("post result")}
          onSendReminder={() => void fetch(`/api/match/${match.id}/remind`, { method: "POST", credentials: "include" })}
          onForfeit={(winner) => {
            void fetch(`/api/match/${match.id}/forfeit`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ winner, playerA: match.playerA, playerB: match.playerB }),
            }).then(async (res) => {
              if (!res.ok) { console.error("forfeit failed", await res.text()); return }
              setLiveMatchStatus("forfeit")
              if (winner === match.playerA) setLiveScoreB(-1)
              else setLiveScoreA(-1)
            })
          }}
          matchStatus={liveMatchStatus}
          hasLobby={liveLobbyUrl !== undefined}
          isDemo={isDemo}
          testResultUnlocked={testResultUnlocked}
        />

        <div style={{ width: poolWidth, flexShrink: 0 }} className="flex flex-col overflow-hidden">
          <MappoolTable mappool={liveMappool ?? undefined} playerA={match.playerA} playerB={match.playerB} onRowClick={setSelectedMap} />

        </div>

        {/* Resize handle */}
        <div
          className="w-1 flex-shrink-0 cursor-col-resize bg-border/40 transition-colors hover:bg-primary/40 active:bg-primary/60"
          onMouseDown={onDragStart}
        />

        {/* Right: tabbed panel */}
        <aside className="flex min-w-0 flex-1 flex-col overflow-hidden border-l border-border">
          <Tabs defaultValue="irc" className="flex min-h-0 flex-1 flex-col gap-0">
            <div className="flex-shrink-0 border-b border-border bg-card/40 px-3 py-2">
              <TabsList className="w-full">
                <TabsTrigger value="irc"     className="flex-1 text-xs">IRC</TabsTrigger>
                <TabsTrigger value="recipes" className="flex-1 text-xs">Recipes</TabsTrigger>
                <TabsTrigger value="logs"    className="flex-1 text-xs">Logs</TabsTrigger>
                {testMode && <TabsTrigger value="sim" className="flex-1 text-xs text-amber-700 dark:text-amber-400">Sim</TabsTrigger>}
              </TabsList>
            </div>

            <TabsContent value="recipes" className="flex-1 overflow-y-auto p-4">
              <RecipePanel
                invA={liveInventory?.a ?? INVENTORY_A}
                invB={liveInventory?.b ?? INVENTORY_B}
                labelA={match.playerA}
                labelB={match.playerB}
              />
            </TabsContent>

            <TabsContent value="logs" className="flex-1 overflow-y-auto p-4 space-y-1.5">
              <p className="font-heading text-xs uppercase tracking-[0.16em] text-muted-foreground mb-3">Event log</p>
              {liveEvents.length === 0 && (
                <p className="text-xs text-muted-foreground/40 text-center pt-4">No events yet - connect a lobby to see activity.</p>
              )}
              {liveEvents.slice().reverse().map((e) => (
                <div key={e.id} className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-xs flex items-start gap-2">
                  <span className="font-mono text-muted-foreground/60 flex-shrink-0">
                    {new Date(e.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <span className={
                    e.kind === "abort"      ? "text-destructive font-semibold" :
                    e.kind === "roll"       ? "text-[#9cb7c7]" :
                    e.kind === "other_roll" ? "text-muted-foreground" :
                    e.kind === "join"       ? "text-[#a8c29f]" :
                    e.kind === "leave"      ? "text-[#a4564e]" :
                    "text-foreground/70"
                  }>{e.text}</span>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="irc" forceMount className="flex-1 min-h-0 flex flex-col overflow-hidden data-[state=inactive]:hidden">
              <IrcChat
                ref={ircRef}
                channel={lobbyUrlToChannel(liveLobbyUrl)}
                refName={match.referee ?? "Referee"}
                playerA={match.playerA}
                playerB={match.playerB}
                playerAOsuId={match.playerAOsuId}
                playerBOsuId={match.playerBOsuId}
                isDemo={isDemo}
                isTestMode={testMode}
                simulatedMessages={simulatedIrcMessages}
                onMessagesChange={(msgs) => { ircMessagesRef.current = msgs }}
                onNewMessage={handleNewIrcMessage}
              />
            </TabsContent>

            {testMode && (
              <TabsContent value="sim" className="flex-1 overflow-y-auto p-4">
                <TestSimPanel
                  playerA={match.playerA}
                  playerB={match.playerB}
                  refName={match.referee ?? "Referee"}
                  mappool={liveMappool}
                  channel={lobbyUrlToChannel(liveLobbyUrl)}
                  onInjectMessage={injectIrcMsg}
                  onGameResult={simulateGameResult}
                  onUnlockPostResult={() => setTestResultUnlocked(true)}
                />
              </TabsContent>
            )}
          </Tabs>
        </aside>
      </div>

      <MapActionModal
        map={selectedMap}
        playerA={match.playerA}
        playerB={match.playerB}
        onClose={() => setSelectedMap(null)}
        onAction={(action, player) => {
          const map = selectedMap
          if (!map) return
          setSelectedMap(null)

          // optimistic update
          setLiveMappool((prev) => prev ? prev.map((m) => {
            if (m.slot !== map.slot) return m
            return {
              ...m,
              status: action === "pick" ? "picked" : action === "ban" ? "banned" : "protected",
              ...(action === "pick" ? { pickedBy: player } : {}),
              ...(action === "ban" ? { bannedBy: player } : {}),
            }
          }) : prev)

          void fetch(`/api/match/${match.id}/action`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, player, slot: map.slot }),
          }).then(async (res) => {
            if (!res.ok) {
              // revert optimistic update on failure
              setLiveMappool((prev) => prev ? prev.map((m) => m.slot === map.slot ? map : m) : prev)
              console.error("action failed", await res.text())
            }
          })

          if (action === "pick") {
            const channel = lobbyUrlToChannel(liveLobbyUrl)
            if (channel) void sendPickSequence(map, channel)
          }
        }}
      />
    </div>
  )
}
