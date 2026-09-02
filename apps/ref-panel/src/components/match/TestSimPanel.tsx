import { useState } from "react"
import { CheckCircle2, ExternalLink, Link2, RefreshCw, SkipForward, Unlink, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import type { MatchFlowState, ScoreSubmissionDetails, TestMpBinding, TestMpProbe, TestMpResult } from "@/types"

interface ScoreSubmitOutcome {
  replayRequired: boolean
  alreadyCompleted: boolean
}

interface Props {
  matchId: string
  playerA: string
  playerB: string
  playerAOsuId?: string
  playerBOsuId?: string
  binding?: TestMpBinding
  phase?: MatchFlowState["phase"]
  currentSlot?: string
  scoreSubmitting: boolean
  onBindingChange: (binding: TestMpBinding | undefined) => void
  onLobbyChange: (lobbyUrl: string) => void
  onApplyScore: (slot: string, scoreA: number, scoreB: number, details: ScoreSubmissionDetails) => Promise<ScoreSubmitOutcome | null>
}

function apiError(value: unknown, fallback: string): string {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string"
    ? value.error
    : fallback
}

function nextIntegrationAction(
  binding: TestMpBinding | undefined,
  phase: MatchFlowState["phase"] | undefined,
  currentSlot: string | undefined,
): string {
  if (binding?.expected) return `Ready: map ${binding.expected.beatmapId}`
  if (phase === "roll") return "Save both rolls in Match Control"
  if (phase === "order") return "Choose the pick/ban order in Match Control"
  if (phase === "home_mod") return "Choose both home mods"
  if (phase === "ban") return "Complete the map bans"
  if (phase === "craft" && currentSlot) return `Set up picked map ${currentSlot} in Match Control`
  if (phase === "craft") return "Pick the next map"
  if (phase === "play") return `Set up ${currentSlot ?? "the picked map"} again to record verification data`
  if (phase === "ready_result" || phase === "completed") return "No map is awaiting a result"
  return "Complete lobby setup in Match Control"
}

export function TestSimPanel({
  matchId,
  playerA,
  playerB,
  playerAOsuId,
  playerBOsuId,
  binding,
  phase,
  currentSlot,
  scoreSubmitting,
  onBindingChange,
  onLobbyChange,
  onApplyScore,
}: Props) {
  const [mpInput, setMpInput] = useState(binding ? String(binding.mpId) : "")
  const [mode, setMode] = useState<"replay" | "live">(binding?.mode ?? "replay")
  const [probe, setProbe] = useState<TestMpProbe | null>(null)
  const [playerAId, setPlayerAId] = useState("")
  const [playerBId, setPlayerBId] = useState("")
  const [result, setResult] = useState<TestMpResult | null>(null)
  const [busy, setBusy] = useState<"probe" | "bind" | "check" | "apply" | "skip" | "detach" | null>(null)
  const nextAction = nextIntegrationAction(binding, phase, currentSlot)

  async function inspectLobby() {
    setBusy("probe")
    setResult(null)
    try {
      const response = await fetch(`/api/match/${matchId}/test/mp-probe`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mp: mpInput }),
      })
      const data = await response.json() as TestMpProbe | { error?: string }
      if (!response.ok || !("users" in data)) {
        toast.error(apiError(data, "Could not inspect osu! lobby"))
        return
      }
      setProbe(data)
      const configuredA = Number(playerAOsuId)
      const configuredB = Number(playerBOsuId)
      setPlayerAId(String(data.users.some((user) => user.id === configuredA) ? configuredA : data.users[0]?.id ?? ""))
      setPlayerBId(String(data.users.some((user) => user.id === configuredB) ? configuredB : data.users.find((user) => user.id !== configuredA)?.id ?? data.users[1]?.id ?? ""))
    } catch {
      toast.error("Could not inspect osu! lobby")
    } finally {
      setBusy(null)
    }
  }

  async function bindLobby() {
    if (!probe || !playerAId || !playerBId) return
    setBusy("bind")
    try {
      const response = await fetch(`/api/match/${matchId}/test/mp-binding`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mpId: probe.mpId,
          mode,
          playerAOsuId: Number(playerAId),
          playerBOsuId: Number(playerBId),
        }),
      })
      const data = await response.json() as { binding?: TestMpBinding; lobbyUrl?: string; error?: string }
      if (!response.ok || !data.binding) {
        toast.error(data.error ?? "Could not bind osu! lobby")
        return
      }
      onBindingChange(data.binding)
      onLobbyChange(data.lobbyUrl ?? `https://osu.ppy.sh/mp/${data.binding.mpId}`)
      setResult(null)
      toast.success(`Bound mp#${data.binding.mpId}`)
    } catch {
      toast.error("Could not bind osu! lobby")
    } finally {
      setBusy(null)
    }
  }

  async function checkNextGame() {
    setBusy("check")
    try {
      const response = await fetch(`/api/match/${matchId}/test/mp-result`, { credentials: "include" })
      const data = await response.json() as TestMpResult | { error?: string }
      if (!response.ok || !("pending" in data)) {
        toast.error(apiError(data, "Could not verify osu! game"))
        return
      }
      setResult(data)
      if (data.pending) toast.info(data.message ?? "No new osu! game is available yet")
    } catch {
      toast.error("Could not verify osu! game")
    } finally {
      setBusy(null)
    }
  }

  async function consumeGame(keepExpected: boolean): Promise<boolean> {
    if (!result?.game) return false
    const response = await fetch(`/api/match/${matchId}/test/mp-result/consume`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: result.game.id, keepExpected }),
    })
    const data = await response.json() as { state?: MatchFlowState; error?: string }
    if (!response.ok || !data.state?.testBinding) {
      toast.error(data.error ?? "Could not advance osu! game cursor")
      return false
    }
    onBindingChange(data.state.testBinding)
    setResult(null)
    return true
  }

  async function applyVerifiedResult() {
    const slot = result?.slot
    const scoreA = result?.values?.scoreA
    const scoreB = result?.values?.scoreB
    if (!result?.canApply || !slot || scoreA == null || scoreB == null) return
    setBusy("apply")
    try {
      const outcome = await onApplyScore(slot, scoreA, scoreB, {
        usesHdA: result.values?.usesHdA ?? false,
        usesHdB: result.values?.usesHdB ?? false,
        ...(result.values?.missCountMode && result.values.missCountA !== null && result.values.missCountB !== null
          ? { missCountA: result.values.missCountA, missCountB: result.values.missCountB }
          : {}),
      })
      if (!outcome) return
      if (await consumeGame(outcome.replayRequired)) {
        toast.success(outcome.replayRequired ? "Verified run applied; replay remains open" : "Verified osu! result applied")
      }
    } finally {
      setBusy(null)
    }
  }

  async function skipGame() {
    setBusy("skip")
    try {
      if (await consumeGame(true)) toast.success("Recorded game skipped")
    } finally {
      setBusy(null)
    }
  }

  async function detachLobby() {
    setBusy("detach")
    try {
      const response = await fetch(`/api/match/${matchId}/test/mp-binding`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await response.json() as { error?: string }
      if (!response.ok) {
        toast.error(data.error ?? "Could not detach osu! lobby")
        return
      }
      onBindingChange(undefined)
      setProbe(null)
      setResult(null)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-heading text-xs uppercase tracking-[0.16em] text-muted-foreground">osu! integration test</p>
        {binding && (
          <a href={`https://osu.ppy.sh/mp/${binding.mpId}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-mono text-[10px] text-primary hover:underline">
            mp#{binding.mpId}<ExternalLink className="size-3" />
          </a>
        )}
      </div>

      {!binding ? (
        <div className="space-y-3">
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">MP link or ID</span>
            <div className="flex gap-2">
              <Input value={mpInput} onChange={(event) => setMpInput(event.target.value)} placeholder="https://osu.ppy.sh/mp/123456" />
              <Button size="icon" variant="outline" onClick={() => void inspectLobby()} disabled={!mpInput.trim() || busy !== null} title="Inspect osu! lobby">
                <RefreshCw className={`size-4 ${busy === "probe" ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </label>

          {probe && (
            <div className="space-y-3 rounded-md border border-border/70 bg-card/30 p-3">
              <div>
                <p className="truncate text-xs font-medium" title={probe.name}>{probe.name}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{probe.games.length} games in API window, {probe.users.length} lobby users</p>
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] text-muted-foreground">{playerA}</span>
                <select className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-xs" value={playerAId} onChange={(event) => setPlayerAId(event.target.value)}>
                  <option value="">Select osu! user</option>
                  {probe.users.map((user) => <option key={user.id} value={user.id}>{user.username} ({user.id})</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] text-muted-foreground">{playerB}</span>
                <select className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-xs" value={playerBId} onChange={(event) => setPlayerBId(event.target.value)}>
                  <option value="">Select osu! user</option>
                  {probe.users.map((user) => <option key={user.id} value={user.id}>{user.username} ({user.id})</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] text-muted-foreground">Game cursor</span>
                <select className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-xs" value={mode} onChange={(event) => setMode(event.target.value === "live" ? "live" : "replay")}>
                  <option value="replay">Replay from first recorded game</option>
                  <option value="live">Follow games created after binding</option>
                </select>
              </label>
              <Button className="w-full text-xs" size="sm" disabled={!playerAId || !playerBId || playerAId === playerBId || busy !== null} onClick={() => void bindLobby()}>
                <Link2 className="size-4" />{busy === "bind" ? "Binding..." : "Bind recorded lobby"}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-md border border-border/70 bg-card/30 px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Cursor</span><span className="font-mono">{binding.lastGameId || "start"}</span></div>
            <div className="mt-1 flex items-center justify-between gap-3"><span className="text-muted-foreground">Current pick</span><span className="font-mono">{currentSlot ?? "none"}</span></div>
            <div className="mt-1 flex items-start justify-between gap-3"><span className="shrink-0 text-muted-foreground">Next action</span><span className="text-right text-[11px]">{nextAction}</span></div>
          </div>

          <Button className="w-full text-xs" size="sm" onClick={() => void checkNextGame()} disabled={!binding.expected || busy !== null}>
            <RefreshCw className={`size-4 ${busy === "check" ? "animate-spin" : ""}`} />Check next osu! game
          </Button>

          {result && !result.pending && result.game && (
            <div className="space-y-3 rounded-md border border-border/70 bg-card/30 p-3">
              <div className="flex items-center justify-between gap-3"><p className="font-mono text-xs">game #{result.game.id}</p><span className="font-mono text-[10px] text-muted-foreground">map {result.game.beatmapId}</span></div>
              <div className="space-y-1.5">
                {result.checks?.map((check) => (
                  <div key={check.key} className="flex items-start gap-2 text-xs">
                    {check.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#5f7f63]" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />}
                    <div className="min-w-0"><p>{check.label}</p>{!check.ok && <p className="break-words font-mono text-[10px] text-muted-foreground">expected {check.expected}; got {check.actual}</p>}</div>
                  </div>
                ))}
              </div>
              {result.values && (
                <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-2 text-xs">
                  <div>
                    <p className="text-[10px] text-muted-foreground">{playerA}</p>
                    <p className="font-mono">{result.values.scoreA ?? "missing"}{result.values.accuracyMode ? "%" : ""}{result.values.usesHdA ? " HD" : ""}</p>
                    {result.values.missCountMode && <p className="font-mono text-[10px] text-muted-foreground">{result.values.missCountA ?? "missing"} misses</p>}
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">{playerB}</p>
                    <p className="font-mono">{result.values.scoreB ?? "missing"}{result.values.accuracyMode ? "%" : ""}{result.values.usesHdB ? " HD" : ""}</p>
                    {result.values.missCountMode && <p className="font-mono text-[10px] text-muted-foreground">{result.values.missCountB ?? "missing"} misses</p>}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Button size="sm" className="text-xs" disabled={!result.canApply || busy !== null || scoreSubmitting} onClick={() => void applyVerifiedResult()}>
                  <CheckCircle2 className="size-4" />{busy === "apply" ? "Applying..." : "Apply verified result"}
                </Button>
                <Button size="icon" variant="outline" disabled={busy !== null} onClick={() => void skipGame()} title="Skip this recorded game"><SkipForward className="size-4" /></Button>
              </div>
            </div>
          )}

          <Separator />
          <Button size="sm" variant="outline" className="w-full text-xs" disabled={busy !== null} onClick={() => void detachLobby()}><Unlink className="size-4" />Detach recorded lobby</Button>
        </div>
      )}
    </div>
  )
}
