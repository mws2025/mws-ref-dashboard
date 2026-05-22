import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AUDIT_LOG, INVENTORY_A, INVENTORY_B } from "@/data/mock"
import type { IngKey, Inventory, Match, PoolMap } from "@/types"
import { IrcChat } from "./IrcChat"
import { MapActionModal } from "./MapActionModal"
import { MappoolTable } from "./MappoolTable"
import { PlayerColumn } from "./PlayerColumn"
import { RecipePanel } from "./RecipePanel"

interface Props {
  match: Match
  onBack: () => void
}

export function MatchPanel({ match, onBack }: Props) {
  const [poolWidth, setPoolWidth] = useState(770)
  const [selectedMap, setSelectedMap] = useState<PoolMap | null>(null)
  const [liveMappool, setLiveMappool] = useState<PoolMap[] | null>(null)
  const [liveInventory, setLiveInventory] = useState<{ a: Inventory; b: Inventory } | null>(null)
  const [liveScoreA, setLiveScoreA] = useState<number>(match.scoreA ?? 0)
  const [liveScoreB, setLiveScoreB] = useState<number>(match.scoreB ?? 0)
  const [matchRules, setMatchRules] = useState<Record<string, string>>({})
  const [rulesOpen, setRulesOpen] = useState(false)
  const dragState = useRef<{ startX: number; startW: number } | null>(null)

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
        const cfg = await cfgRes.json() as { rules?: Record<string, string> }
        if (cfg.rules) setMatchRules(cfg.rules)
      }
    }
    void load()
  }, [match.id])

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
          {match.playerA} <span className="text-muted-foreground">vs</span> {match.playerB}
        </span>
        <Badge className="self-center border-0 bg-secondary text-secondary-foreground text-xs">{match.round}</Badge>
        <Badge variant="default" className="self-center text-xs">Live</Badge>
        <span className="ml-auto self-center font-mono text-xs text-muted-foreground">{match.lobbyUrl}</span>
        {Object.values(matchRules).some(Boolean) && (
          <button
            onClick={() => setRulesOpen(true)}
            className="self-center rounded border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            Rules
          </button>
        )}
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
          refName={match.referee ?? "—"}
          streamer={match.streamer}
          onInvAChange={(key: IngKey, delta: number) => setLiveInventory((prev) => prev ? { ...prev, a: { ...prev.a, [key]: Math.max(0, (prev.a[key] ?? 0) + delta) } } : prev)}
          onInvBChange={(key: IngKey, delta: number) => setLiveInventory((prev) => prev ? { ...prev, b: { ...prev.b, [key]: Math.max(0, (prev.b[key] ?? 0) + delta) } } : prev)}
          onCreateLobby={() => console.log("create lobby")}
          onJoinLobby={(mpId) => console.log("join lobby", mpId)}
          onCloseLobby={() => console.log("close lobby")}
          onPostResult={() => console.log("post result")}
        />

        <div style={{ width: poolWidth, flexShrink: 0 }} className="flex flex-col overflow-hidden">
          <MappoolTable mappool={liveMappool ?? undefined} onRowClick={setSelectedMap} />

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
              {AUDIT_LOG.slice().reverse().map((e, i) => (
                <div key={i} className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-xs">
                  <span className="font-mono text-muted-foreground">{e.time}</span>
                  {" · "}
                  <span className="font-semibold">{e.actor}</span>
                  {" — "}
                  {e.msg}
                </div>
              ))}
            </TabsContent>

            <TabsContent value="irc" className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <IrcChat />
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <MapActionModal
        map={selectedMap}
        playerA={match.playerA}
        playerB={match.playerB}
        onClose={() => setSelectedMap(null)}
        onAction={(action, player) => {
          // TODO: dispatch pick/ban/protect to server
          console.log(action, player, selectedMap?.slot)
        }}
      />
    </div>
  )
}
