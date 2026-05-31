import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { INVENTORY_A, INVENTORY_B } from "@/data/mock"
import { RECIPES } from "@/data/recipes"
import { canAfford } from "@/lib/mappool"
import type { HomeMod, IngKey, Inventory, Match, MatchFlowState, PoolMap } from "@/types"
import { LiveBadge } from "../LiveBadge"
import { FlowPanel } from "./FlowPanel"
import { IrcChat, type IrcChatHandle, type LiveMsg } from "./IrcChat"
import { MapActionModal } from "./MapActionModal"
import { MappoolTable } from "./MappoolTable"
import { PlayerColumn } from "./PlayerColumn"
import { RecipePanel } from "./RecipePanel"
import { TestSimPanel } from "./TestSimPanel"

interface UsedRecipe {
  id: string
  player: string
  recipeId: number
  snapshot: Inventory
}

type EventKind = "join" | "leave" | "roll" | "abort" | "other_join" | "other_roll" | "info"

interface MatchEvent {
  id: string
  ts: string
  kind: EventKind
  text: string
  player?: string
  value?: number
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
    return { id, ts, kind, text, player: who, value: Number(val) }
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

function defaultFlowState(match: Match, lobbyUrl?: string): MatchFlowState {
  return {
    matchId: match.id,
    phase: lobbyUrl || match.lobbyUrl ? "roll" : "lobby",
    updatedAt: new Date().toISOString(),
  }
}

function opponentOf(player: string, playerA: string, playerB: string) {
  return player.toLowerCase() === playerA.toLowerCase() ? playerB : playerA
}

function orderedPlayersFromPattern(patternRaw: string, firstPlayer: string, secondPlayer: string): string[] {
  const pattern = (patternRaw || "ABAB").toUpperCase().replace(/[^AB12]/g, "") || "ABAB"
  return Array.from(pattern).map((token) => token === "A" || token === "1" ? firstPlayer : secondPlayer)
}

function normalizeInventory(raw: unknown): Inventory | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  return {
    egg: Number(record.egg ?? 0) || 0,
    sugar: Number(record.sugar ?? 0) || 0,
    butter: Number(record.butter ?? 0) || 0,
    flour: Number(record.flour ?? 0) || 0,
    milk: Number(record.milk ?? 0) || 0,
  }
}

function nextActionHint(state: MatchFlowState | null, mappool: PoolMap[] | null): string {
  if (!state) return "Load match flow state."
  const currentMap = state.currentSlot
    ? mappool?.find((map) => map.slot === state.currentSlot)
    : mappool?.find((map) => map.status === "picked")
  switch (state.phase) {
    case "lobby":
      return "Create or join the lobby."
    case "roll":
      return "Wait for both players to roll, then save the rolls in Match Control."
    case "order":
      return `${state.rollWinner ?? "Roll winner"} chooses pick-first or ban-first in Match Control.`
    case "home_mod":
      return `${state.turnPlayer ?? "Next player"} chooses home mod in the left player column.`
    case "ban":
      return `${state.turnPlayer ?? "Next player"} bans an available map.`
    case "craft":
      return `${state.turnPlayer ?? "Next player"} picks a map. Craft first if needed (Recipes tab).`
    case "play":
      return currentMap
        ? `Play ${currentMap.slot}; record scores in Match Control after both finish.`
        : "Play the picked map; record scores in Match Control after both finish."
    case "ready_result":
      return "Post the final result from the left panel."
    case "completed":
      return "Match flow is complete."
  }
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
  const [banOrder, setBanOrder] = useState("ABAB")
  const [rulesOpen, setRulesOpen] = useState(false)
  const [liveLobbyUrl, setLiveLobbyUrl] = useState<string | undefined>(undefined)
  const [liveEvents, setLiveEvents] = useState<MatchEvent[]>([])
  const [flowState, setFlowState] = useState<MatchFlowState | null>(null)
  const [latestRolls, setLatestRolls] = useState<{ a?: number; b?: number }>({})
  const [manualMapActions, setManualMapActions] = useState(true)
  const [simulatedIrcMessages, setSimulatedIrcMessages] = useState<LiveMsg[]>([])
  const [testResultUnlocked, setTestResultUnlocked] = useState(false)
  const [usedRecipes, setUsedRecipes] = useState<UsedRecipe[]>([])
  const [lobbyNameMismatch, setLobbyNameMismatch] = useState<{ found: string; expected: string } | null>(null)
  const dragState = useRef<{ startX: number; startW: number } | null>(null)
  const ircMessagesRef = useRef<LiveMsg[]>([])
  const ircRef = useRef<IrcChatHandle>(null)
  const invSaveTimers = useRef<{ a: ReturnType<typeof setTimeout> | null; b: ReturnType<typeof setTimeout> | null }>({ a: null, b: null })
  const pendingRoomCheck = useRef(false)
  const abbreviationRef = useRef("MWS")

  function scheduleInvSave(player: "a" | "b", playerName: string, inv: Inventory) {
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

    // Room name check after join
    if (pendingRoomCheck.current) {
      const roomNameM = msg.message.match(/^Room name: (.+), History:/)
      if (roomNameM) {
        pendingRoomCheck.current = false
        const roomName = roomNameM[1]
        const hasA = roomName.toLowerCase().includes(match.playerA.toLowerCase())
        const hasB = roomName.toLowerCase().includes(match.playerB.toLowerCase())
        if (!hasA || !hasB) {
          setLobbyNameMismatch({
            found: roomName,
            expected: `${abbreviationRef.current}: ${match.playerA} vs ${match.playerB}`,
          })
        }
      }
    }

    const event = parseBanchoEvent(msg.message, msg.ts, match.playerA, match.playerB)
    if (event) {
      setLiveEvents((prev) => [...prev, event])
      if (event.kind === "roll" && event.player && typeof event.value === "number") {
        setLatestRolls((prev) => {
          if (event.player?.toLowerCase() === match.playerA.toLowerCase()) return { ...prev, a: event.value }
          if (event.player?.toLowerCase() === match.playerB.toLowerCase()) return { ...prev, b: event.value }
          return prev
        })
      }
    }
  }, [match.playerA, match.playerB])

  useEffect(() => {
    async function load() {
      const params = new URLSearchParams({ mappool: match.mappool ?? "", playerA: match.playerA, playerB: match.playerB })
      const [mpRes, invRes, cfgRes, stateRes] = await Promise.all([
        fetch(`/api/match/${match.id}/mappool?${params}`, { credentials: "include" }),
        fetch(`/api/match/${match.id}/inventory?${params}`, { credentials: "include" }),
        fetch("/api/public/config"),
        fetch(`/api/match/${match.id}/state`, { credentials: "include" }),
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
        const cfg = await cfgRes.json() as { rules?: Record<string, string>; enforceNF?: boolean; banOrder?: string; abbreviation?: string }
        if (cfg.rules) setMatchRules(cfg.rules)
        if (typeof cfg.enforceNF === "boolean") setEnforceNF(cfg.enforceNF)
        if (cfg.banOrder) setBanOrder(cfg.banOrder)
        if (cfg.abbreviation) abbreviationRef.current = cfg.abbreviation
      }
      if (stateRes.ok) {
        const data = await stateRes.json() as { state?: MatchFlowState }
        setFlowState(data.state ?? defaultFlowState(match, liveLobbyUrl))
      } else {
        setFlowState(defaultFlowState(match, liveLobbyUrl))
      }
    }
    void load()
  }, [match.id])

  function injectIrcMsg(from: string, message: string, local = false) {
    const msg: LiveMsg = { ts: new Date().toISOString(), from, message, ...(local ? { local: true } : {}) }
    setSimulatedIrcMessages(prev => [...prev, msg])
    handleNewIrcMessage(msg)
  }

  async function postStateAction(body: Record<string, unknown>, localState: MatchFlowState) {
    setFlowState(localState)

    const res = await fetch(`/api/match/${match.id}/state`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json() as { error?: string }
      toast.error(err.error ?? "Failed to update match flow")
      return
    }
    const data = await res.json() as { state?: MatchFlowState }
    if (data.state) setFlowState(data.state)
  }

  function saveRolls(rollA: number, rollB: number) {
    const rollWinner = rollA === rollB ? undefined : rollA > rollB ? match.playerA : match.playerB
    const nextState: MatchFlowState = {
      ...(flowState ?? defaultFlowState(match, liveLobbyUrl)),
      phase: rollWinner ? "order" : "roll",
      rollA,
      rollB,
      rollWinner,
      turnPlayer: rollWinner,
      updatedAt: new Date().toISOString(),
    }
    void postStateAction({ action: "record_rolls", rollA, rollB }, nextState)
  }

  function chooseOrder(choice: "pick_first" | "ban_first") {
    const current = flowState ?? defaultFlowState(match, liveLobbyUrl)
    const chooser = current.rollWinner
    if (!chooser) return
    const other = opponentOf(chooser, match.playerA, match.playerB)
    const firstPicker = choice === "pick_first" ? chooser : other
    const firstBanner = choice === "ban_first" ? chooser : other
    const nextState: MatchFlowState = {
      ...current,
      phase: "home_mod",
      firstPicker,
      firstBanner,
      turnPlayer: firstPicker,
      updatedAt: new Date().toISOString(),
    }
    void postStateAction({ action: "choose_order", choice }, nextState)
  }

  function setHomeMod(player: string, homeMod: HomeMod) {
    const current = flowState ?? defaultFlowState(match, liveLobbyUrl)
    const isA = player.toLowerCase() === match.playerA.toLowerCase()
    const next: MatchFlowState = {
      ...current,
      ...(isA ? { homeModA: homeMod } : { homeModB: homeMod }),
      updatedAt: new Date().toISOString(),
    }
    const other = opponentOf(player, match.playerA, match.playerB)
    const otherHasHomeMod = other.toLowerCase() === match.playerA.toLowerCase() ? next.homeModA : next.homeModB
    const nextState: MatchFlowState = otherHasHomeMod
      ? { ...next, phase: "ban", turnPlayer: next.firstBanner }
      : { ...next, phase: "home_mod", turnPlayer: other }
    void postStateAction({ action: "set_home_mod", player, homeMod }, nextState)
  }

  function advanceLocalAfterMapAction(action: "pick" | "ban" | "protect", player: string, slot: string) {
    if (!testMode || !flowState) return
    if (action === "ban") {
      const firstBanner = flowState.firstBanner ?? player
      const secondBanner = opponentOf(firstBanner, match.playerA, match.playerB)
      const order = orderedPlayersFromPattern(banOrder, firstBanner, secondBanner)
      const completedBans = (liveMappool?.filter((map) => map.status === "banned").length ?? 0) + 1
      setFlowState({
        ...flowState,
        phase: completedBans < order.length ? "ban" : "craft",
        turnPlayer: completedBans < order.length ? order[completedBans] : flowState.firstPicker,
        currentSlot: undefined,
        updatedAt: new Date().toISOString(),
      })
    }
    if (action === "pick") {
      setFlowState({
        ...flowState,
        phase: "play",
        turnPlayer: player,
        currentSlot: slot,
        updatedAt: new Date().toISOString(),
      })
    }
  }

  function simulateGameResult(slot: string, winner: string, scoreA: number, scoreB: number) {
    submitScore(slot, scoreA, scoreB, winner)
  }

  function applyCompletedMap(slot: string, winner: string) {
    setLiveMappool(prev => prev ? prev.map(m =>
      m.slot === slot ? { ...m, status: "completed", winner } : m
    ) : prev)
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

  function submitScore(slot: string, scoreA: number, scoreB: number, winner: string) {
    const map = liveMappool?.find((m) => m.slot === slot)
    const wasCompleted = map?.status === "completed"
    const winnerIsA = winner === match.playerA
    const nextScoreA = liveScoreA + (!wasCompleted && winnerIsA ? 1 : 0)
    const nextScoreB = liveScoreB + (!wasCompleted && !winnerIsA ? 1 : 0)
    applyCompletedMap(slot, winner)
    setLiveScoreA(nextScoreA)
    setLiveScoreB(nextScoreB)

    const nextPicker = opponentOf(winner, match.playerA, match.playerB)

    void fetch(`/api/match/${match.id}/score`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, scoreA, scoreB, winner, playerA: match.playerA, playerB: match.playerB }),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        toast.error(err.error ?? "Failed to save score")
        return
      }
      const data = await res.json() as {
        totals?: { scoreA: number; scoreB: number }
        inventory?: Inventory
        state?: MatchFlowState
      }
      if (data.totals) {
        setLiveScoreA(data.totals.scoreA)
        setLiveScoreB(data.totals.scoreB)
      }
      if (data.inventory) {
        setLiveInventory((prev) => {
          if (!prev) return prev
          return winnerIsA ? { ...prev, a: data.inventory! } : { ...prev, b: data.inventory! }
        })
      }
      if (data.state) setFlowState(data.state)
      announceGameResult(data.totals?.scoreA ?? nextScoreA, data.totals?.scoreB ?? nextScoreB, nextPicker)
    })
  }

  function handleRecipeUse(player: string, recipeId: number) {
    const recipe = RECIPES.find((r) => r.id === recipeId)
    if (!recipe || !liveInventory) return
    const side = player.toLowerCase() === match.playerA.toLowerCase() ? "a" : "b"
    const currentInv = liveInventory[side]
    if (!canAfford(recipe, currentInv)) {
      toast.error("Not enough ingredients")
      return
    }
    const nextInv = { ...currentInv }
    for (const [key, amount] of Object.entries(recipe.cost) as [IngKey, number][]) {
      nextInv[key] = Math.max(0, nextInv[key] - amount)
    }
    setLiveInventory((prev) => prev ? { ...prev, [side]: nextInv } : prev)
    const usedId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setUsedRecipes((prev) => [...prev, { id: usedId, player, recipeId, snapshot: currentInv }])

    void fetch(`/api/match/${match.id}/recipe`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player, recipeId }),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        toast.error(err.error ?? "Failed to use recipe")
        setLiveInventory((prev) => prev ? { ...prev, [side]: currentInv } : prev)
        return
      }
      const data = await res.json() as { inventory?: unknown }
      const savedInventory = normalizeInventory(data.inventory)
      if (savedInventory) setLiveInventory((prev) => prev ? { ...prev, [side]: savedInventory } : prev)
      toast.success(`${recipe.name} crafted`)
    })
  }

  function handleUndoRecipe(id: string) {
    const entry = usedRecipes.find((r) => r.id === id)
    if (!entry || !liveInventory) return
    const side = entry.player.toLowerCase() === match.playerA.toLowerCase() ? "a" : "b"
    setLiveInventory((prev) => prev ? { ...prev, [side]: entry.snapshot } : prev)
    setUsedRecipes((prev) => prev.filter((r) => r.id !== id))
  }

  function clearHomeMod(player: string) {
    const current = flowState ?? defaultFlowState(match, liveLobbyUrl)
    const isA = player.toLowerCase() === match.playerA.toLowerCase()
    const next: MatchFlowState = {
      ...current,
      ...(isA ? { homeModA: undefined } : { homeModB: undefined }),
      phase: "home_mod",
      turnPlayer: player,
      updatedAt: new Date().toISOString(),
    }
    void postStateAction({ action: "set_home_mod", player, homeMod: null }, next)
  }

  function postMatchResult() {
    const winner = liveScoreA > liveScoreB ? match.playerA : match.playerB

    void fetch(`/api/match/${match.id}/post-result`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerA: match.playerA, playerB: match.playerB, scoreA: liveScoreA, scoreB: liveScoreB, winner }),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        toast.error(err.error ?? "Failed to post result")
        return
      }
      const data = await res.json() as { state?: MatchFlowState }
      setLiveMatchStatus("completed")
      if (data.state) setFlowState(data.state)
      toast.success("Match result posted")
    })
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
    if (p === "PS") return nf ? "PSNF" : "None"
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
    setFlowState((prev) => prev && prev.phase === "lobby" ? { ...prev, phase: "roll", updatedAt: new Date().toISOString() } : prev)
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
            const url = `https://osu.ppy.sh/mp/${mpId}`
            const channel = `#mp_${mpId}`
            setLiveLobbyUrl(url)
            setFlowState((prev) => prev && prev.phase === "lobby" ? { ...prev, phase: "roll", updatedAt: new Date().toISOString() } : prev)
            if (!testMode) {
              pendingRoomCheck.current = true
              setTimeout(() => void sendIrc(channel, "!mp settings"), 1500)
            }
            void fetch(`/api/match/${match.id}/join-lobby`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ mpId }),
            }).then(async (res) => {
              if (!res.ok) return
              const data = await res.json() as { alive?: boolean }
              if (!data.alive) {
                pendingRoomCheck.current = false
                toast.error("Lobby not found", {
                  description: `#mp_${mpId} did not respond. Check the ID or create a new lobby.`,
                })
              }
            })
          }}
          onRetryJoin={() => {
            setLobbyNameMismatch(null)
            setLiveLobbyUrl(undefined)
            setFlowState((prev) => prev ? { ...prev, phase: "lobby", updatedAt: new Date().toISOString() } : prev)
          }}
          onClearLobbyMismatch={() => setLobbyNameMismatch(null)}
          lobbyNameMismatch={lobbyNameMismatch ?? undefined}
          onCloseLobby={() => void closeLobby()}
          onPostResult={postMatchResult}
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
          homeModA={flowState?.homeModA}
          homeModB={flowState?.homeModB}
          homeModTurnPlayer={flowState?.phase === "home_mod" ? flowState.turnPlayer : undefined}
          onHomeModSelect={setHomeMod}
          onClearHomeMod={clearHomeMod}
          matchStatus={liveMatchStatus}
          hasLobby={liveLobbyUrl !== undefined}
          isDemo={isDemo}
          postResultReady={flowState?.phase === "ready_result"}
          testResultUnlocked={testResultUnlocked}
          onScoreAEdit={(val) => setLiveScoreA(val)}
          onScoreBEdit={(val) => setLiveScoreB(val)}
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
                <TabsTrigger value="control" className="flex-1 text-xs">Match Control</TabsTrigger>
                <TabsTrigger value="irc"     className="flex-1 text-xs">IRC</TabsTrigger>
                <TabsTrigger value="recipes" className="flex-1 text-xs">Recipes</TabsTrigger>
                {testMode && <TabsTrigger value="sim" className="flex-1 text-xs text-amber-700 dark:text-amber-400">Sim</TabsTrigger>}
              </TabsList>
            </div>

            <TabsContent value="recipes" className="flex-1 overflow-y-auto p-4">
              <RecipePanel
                invA={liveInventory?.a ?? INVENTORY_A}
                invB={liveInventory?.b ?? INVENTORY_B}
                labelA={match.playerA}
                labelB={match.playerB}
                phase={flowState?.phase}
                onUseRecipe={handleRecipeUse}
                usedRecipes={usedRecipes}
                onUndoRecipe={handleUndoRecipe}
              />
            </TabsContent>

            <TabsContent value="control" className="flex-1 overflow-y-auto p-4">
              <FlowPanel
                state={flowState}
                playerA={match.playerA}
                playerB={match.playerB}
                scoreA={liveScoreA}
                scoreB={liveScoreB}
                bestOf={match.bestOf ?? 9}
                mappool={liveMappool}
                latestRolls={latestRolls}
                manualMapActions={manualMapActions}
                onManualMapActionsChange={setManualMapActions}
                onSaveRolls={saveRolls}
                onChooseOrder={chooseOrder}
                onSubmitScore={submitScore}
              />
              <Separator className="my-4" />
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
                nextActionHint={nextActionHint(flowState, liveMappool)}
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
        allowedActions={
          selectedMap?.status === "picked"
            ? ["unpick"]
            : selectedMap?.status !== "available"
            ? []
            : manualMapActions
              ? undefined
              : flowState?.phase === "ban"
              ? ["ban"]
              : flowState?.phase === "craft"
                ? ["pick"]
                : []
        }
        expectedPlayer={selectedMap?.status === "available" && !manualMapActions ? flowState?.turnPlayer : undefined}
        helperText={
          selectedMap?.status === "picked"
            ? "Remove this pick and return the map to available."
            : selectedMap?.status !== "available"
            ? "This map is already locked."
            : manualMapActions
              ? "Manual order is on. Either player can pick, ban, or protect."
              : flowState?.phase === "ban" && flowState.turnPlayer
              ? `${flowState.turnPlayer} must ban next.`
              : flowState?.phase === "craft" && flowState.turnPlayer
                ? `${flowState.turnPlayer} to pick. Craft is optional.`
                : "Finish the current flow phase before choosing a map."
        }
        onClose={() => setSelectedMap(null)}
        onAction={(action, player) => {
          const map = selectedMap
          if (!map) return
          if (action !== "unpick" && !player) return
          setSelectedMap(null)

          // optimistic update
          setLiveMappool((prev) => prev ? prev.map((m) => {
            if (m.slot !== map.slot) return m
            if (action === "unpick") {
              return { ...m, status: "available", pickedBy: undefined, winner: undefined }
            }
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
            body: JSON.stringify({ action, player, slot: map.slot, manualOrder: manualMapActions }),
          }).then(async (res) => {
            if (!res.ok) {
              // revert optimistic update on failure
              setLiveMappool((prev) => prev ? prev.map((m) => m.slot === map.slot ? map : m) : prev)
              const err = await res.json() as { error?: string }
              toast.error(err.error ?? "Action failed")
              return
            }
            const data = await res.json() as { state?: MatchFlowState }
            if (data.state) setFlowState(data.state)
            else if (action === "unpick") {
              setFlowState((prev) => prev?.currentSlot === map.slot
                ? { ...prev, phase: "craft", turnPlayer: map.pickedBy ?? prev.turnPlayer, currentSlot: undefined, updatedAt: new Date().toISOString() }
                : prev)
            }
            else if (!manualMapActions && player) advanceLocalAfterMapAction(action, player, map.slot)
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
