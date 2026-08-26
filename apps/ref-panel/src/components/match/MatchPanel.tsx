import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { INVENTORY_A, INVENTORY_B } from "@/data/mock"
import { RECIPES } from "@/data/recipes"
import { canAfford } from "@/lib/mappool"
import {
  formatLobbyTitle,
  isTiebreakerReady,
  lobbyModsForPool,
  parseFinishedScoreAnnouncement,
  parseRollAnnouncement,
} from "@/lib/match-rules"
import type {
  HomeMod,
  IngKey,
  Inventory,
  Match,
  MatchFlowState,
  PoolMap,
  RecipeActivation,
  RecipeEvent,
} from "@/types"
import { LiveBadge } from "../LiveBadge"
import { FlowPanel } from "./FlowPanel"
import { IrcChat, type IrcChatHandle, type LiveMsg } from "./IrcChat"
import { MapActionModal } from "./MapActionModal"
import { MappoolTable } from "./MappoolTable"
import { PlayerColumn } from "./PlayerColumn"
import { RecipePanel } from "./RecipePanel"
import { TestSimPanel } from "./TestSimPanel"

type EventKind = "join" | "leave" | "roll" | "score" | "map" | "start" | "abort" | "other_join" | "other_roll" | "info"

interface RecipePickSetup {
  eventIds: string[]
  mods: string
  commandsBefore: string[]
  notices: string[]
  beatmapId?: string
  mapTitle?: string
}

interface ScoreSubmitOutcome {
  replayRequired: boolean
  alreadyCompleted: boolean
}

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

  const roll = parseRollAnnouncement(msg)
  if (roll) {
    const { player: who, value } = roll
    const kind: EventKind = matchPlayers.has(who.toLowerCase()) ? "roll" : "other_roll"
    const text = `${who} rolled ${value}`
    return { id, ts, kind, text, player: who, value }
  }

  const finished = parseFinishedScoreAnnouncement(msg)
  if (finished) {
    return { id, ts, kind: "score", text: `${finished.player} finished with ${finished.score.toLocaleString()}`, player: finished.player, value: finished.score }
  }

  if (/^Beatmap changed to:/i.test(msg)) return { id, ts, kind: "map", text: msg }
  if (/^The match has started!?$/i.test(msg)) return { id, ts, kind: "start", text: "Match started" }

  if (msg === "The match has been aborted.") {
    return { id, ts, kind: "abort", text: "Match aborted" }
  }

  return { id, ts, kind: "info", text: msg }
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
      return `${state.rollWinner ?? "Roll winner"} chooses pick-first/ban-second or ban-first/pick-second in Match Control.`
    case "home_mod":
      return `${state.turnPlayer ?? "Next player"} chooses home mod in the left player column.`
    case "ban":
      return `${state.turnPlayer ?? "Next player"} bans an available map.`
    case "craft":
      return currentMap
        ? `Set up ${currentMap.slot} in Match Control.`
        : `Craft recipes, then ${state.turnPlayer ?? "the next player"} picks a map.`
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
  const [liveLobbyUrl, setLiveLobbyUrl] = useState<string | undefined>(match.lobbyUrl)
  const [liveEvents, setLiveEvents] = useState<MatchEvent[]>([])
  const [flowState, setFlowState] = useState<MatchFlowState | null>(null)
  const [latestRolls, setLatestRolls] = useState<{ a?: number; b?: number }>({})
  const [manualMapActions, setManualMapActions] = useState(false)
  const [recipeEvents, setRecipeEvents] = useState<RecipeEvent[]>([])
  const [scoreSubmitting, setScoreSubmitting] = useState(false)
  const [setupSubmitting, setSetupSubmitting] = useState(false)
  const [detectedScores, setDetectedScores] = useState<{ slot: string; run: number; a?: number; b?: number }>({ slot: "", run: 0 })
  const [lobbyNameMismatch, setLobbyNameMismatch] = useState<{ found: string; expected: string } | null>(null)
  const dragState = useRef<{ startX: number; startW: number } | null>(null)
  const ircMessagesRef = useRef<LiveMsg[]>([])
  const ircRef = useRef<IrcChatHandle>(null)
  const invSaveTimers = useRef<{ a: ReturnType<typeof setTimeout> | null; b: ReturnType<typeof setTimeout> | null }>({ a: null, b: null })
  const pendingRoomCheck = useRef(false)
  const abbreviationRef = useRef("MWS")
  const stateActionQueue = useRef<Promise<void>>(Promise.resolve())
  const stateActionVersion = useRef(0)
  const flowStateRef = useRef<MatchFlowState | null>(null)
  flowStateRef.current = flowState

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
            expected: formatLobbyTitle(abbreviationRef.current, match.playerA, match.playerB),
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
      if (event.kind === "score" && event.player && typeof event.value === "number") {
        const currentSlot = flowStateRef.current?.phase === "play" ? flowStateRef.current.currentSlot : undefined
        if (currentSlot) {
          setDetectedScores((current) => {
            const base = current.slot === currentSlot ? current : { slot: currentSlot, run: 0 }
            if (event.player?.toLowerCase() === match.playerA.toLowerCase()) return { ...base, a: event.value }
            if (event.player?.toLowerCase() === match.playerB.toLowerCase()) return { ...base, b: event.value }
            return current
          })
        }
      }
    }
  }, [match.playerA, match.playerB])

  useEffect(() => {
    async function load() {
      const params = new URLSearchParams({ mappool: match.mappool ?? "", playerA: match.playerA, playerB: match.playerB })
      const [mpRes, invRes, cfgRes, stateRes, recipeRes] = await Promise.all([
        fetch(`/api/match/${match.id}/mappool?${params}`, { credentials: "include" }),
        fetch(`/api/match/${match.id}/inventory?${params}`, { credentials: "include" }),
        fetch("/api/public/config"),
        fetch(`/api/match/${match.id}/state`, { credentials: "include" }),
        fetch(`/api/match/${match.id}/recipes`, { credentials: "include" }),
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
      if (recipeRes.ok) {
        const data = await recipeRes.json() as { events?: RecipeEvent[] }
        setRecipeEvents(data.events ?? [])
      }
    }
    void load()
  }, [liveLobbyUrl, match])

  function postStateAction(body: Record<string, unknown>, localState: MatchFlowState) {
    const version = ++stateActionVersion.current
    setFlowState(localState)
    const request = stateActionQueue.current.then(async () => {
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
      if (data.state && version === stateActionVersion.current) setFlowState(data.state)
    })
    stateActionQueue.current = request.catch(() => {
      toast.error("Failed to update match flow")
    })
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
    postStateAction({ action: "record_rolls", rollA, rollB }, nextState)
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
    postStateAction({ action: "choose_order", choice }, nextState)
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
    postStateAction({ action: "set_home_mod", player, homeMod }, nextState)
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

  function applyCompletedMap(slot: string, winner: string) {
    setLiveMappool(prev => prev ? prev.map(m =>
      m.slot === slot ? { ...m, status: "completed", winner } : m
    ) : prev)
  }

  function announceGameResult(scoreA: number, scoreB: number, nextPicker: string, inventories?: { a: Inventory; b: Inventory }) {
    const winsNeeded = Math.ceil((match.bestOf ?? 5) / 2)
    const matchOver = scoreA >= winsNeeded || scoreB >= winsNeeded
    ircRef.current?.send(`${match.playerA} | ${scoreA} - ${scoreB} | ${match.playerB}`)
    if (inventories) {
      const formatInventory = (inventory: Inventory) =>
        `Egg ${inventory.egg}, Sugar ${inventory.sugar}, Butter ${inventory.butter}, Flour ${inventory.flour}, Milk ${inventory.milk}`
      setTimeout(() => ircRef.current?.send(`${match.playerA}: ${formatInventory(inventories.a)} | ${match.playerB}: ${formatInventory(inventories.b)}`), 600)
    }
    if (!matchOver) {
      setTimeout(() => ircRef.current?.send(`Next to pick: ${nextPicker}`), inventories ? 1200 : 600)
      setTimeout(() => ircRef.current?.send(`!mp timer 120`), inventories ? 1800 : 1200)
    }
  }

  async function submitScore(slot: string, scoreA: number, scoreB: number): Promise<ScoreSubmitOutcome | null> {
    if (scoreSubmitting) return null
    setScoreSubmitting(true)
    try {
      const res = await fetch(`/api/match/${match.id}/score`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, scoreA, scoreB, playerA: match.playerA, playerB: match.playerB }),
      })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        toast.error(err.error ?? "Failed to save score")
        return null
      }
      const data = await res.json() as {
        replayRequired?: boolean
        alreadyCompleted?: boolean
        winner?: string
        totals?: { scoreA: number; scoreB: number }
        inventories?: { a: Inventory; b: Inventory }
        state?: MatchFlowState
        nextPicker?: string
        restoreCommands?: string[]
        notices?: string[]
      }
      if (data.replayRequired) {
        toast.info(data.notices?.[0] ?? "Replay required")
        for (const notice of data.notices ?? []) ircRef.current?.send(notice)
        const recipesRes = await fetch(`/api/match/${match.id}/recipes`, { credentials: "include" })
        if (recipesRes.ok) {
          const recipesData = await recipesRes.json() as { events?: RecipeEvent[] }
          setRecipeEvents(recipesData.events ?? [])
        }
        setDetectedScores((current) => ({ slot, run: current.slot === slot ? current.run + 1 : 1 }))
        return { replayRequired: true, alreadyCompleted: false }
      }
      const winner = data.winner
      if (!winner) return null
      applyCompletedMap(slot, winner)
      if (data.totals) {
        setLiveScoreA(data.totals.scoreA)
        setLiveScoreB(data.totals.scoreB)
      }
      if (data.inventories) setLiveInventory(data.inventories)
      if (data.state) setFlowState(data.state)
      setDetectedScores({ slot: "", run: 0 })
      for (const command of data.restoreCommands ?? []) ircRef.current?.send(command)
      const nextPicker = data.nextPicker ?? opponentOf(winner, match.playerA, match.playerB)
      if (data.alreadyCompleted) {
        toast.info("This map score was already saved; match state refreshed")
      } else {
        announceGameResult(data.totals?.scoreA ?? liveScoreA, data.totals?.scoreB ?? liveScoreB, nextPicker, data.inventories)
      }
      const recipesRes = await fetch(`/api/match/${match.id}/recipes`, { credentials: "include" })
      if (recipesRes.ok) {
        const recipesData = await recipesRes.json() as { events?: RecipeEvent[] }
        setRecipeEvents(recipesData.events ?? [])
      }
      return { replayRequired: false, alreadyCompleted: Boolean(data.alreadyCompleted) }
    } catch {
      toast.error("Failed to save score")
      return null
    } finally {
      setScoreSubmitting(false)
    }
  }

  async function refreshRecipeSurfaces() {
    const params = new URLSearchParams({ mappool: match.mappool ?? "", playerA: match.playerA, playerB: match.playerB })
    const [inventoryRes, recipesRes, mappoolRes] = await Promise.all([
      fetch(`/api/match/${match.id}/inventory?${params}`, { credentials: "include" }),
      fetch(`/api/match/${match.id}/recipes`, { credentials: "include" }),
      fetch(`/api/match/${match.id}/mappool?${params}`, { credentials: "include" }),
    ])
    if (inventoryRes.ok) setLiveInventory(await inventoryRes.json() as { a: Inventory; b: Inventory })
    if (recipesRes.ok) {
      const data = await recipesRes.json() as { events?: RecipeEvent[] }
      setRecipeEvents(data.events ?? [])
    }
    if (mappoolRes.ok) {
      const data = await mappoolRes.json() as { mappool?: PoolMap[]; scoreA?: number; scoreB?: number }
      if (data.mappool) setLiveMappool(data.mappool)
      if (typeof data.scoreA === "number") setLiveScoreA(data.scoreA)
      if (typeof data.scoreB === "number") setLiveScoreB(data.scoreB)
    }
  }

  function handleRecipeUse(player: string, recipeId: number, activation: RecipeActivation) {
    const recipe = RECIPES.find((r) => r.id === recipeId)
    if (!recipe || !liveInventory) return
    const side = player.toLowerCase() === match.playerA.toLowerCase() ? "a" : "b"
    if (!canAfford(recipe, liveInventory[side])) {
      toast.error("Not enough ingredients")
      return
    }

    void fetch(`/api/match/${match.id}/recipe`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player, recipeId, ...activation }),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        toast.error(err.error ?? "Failed to use recipe")
        return
      }
      const data = await res.json() as { state?: MatchFlowState }
      if (data.state) setFlowState(data.state)
      await refreshRecipeSurfaces()
      toast.success(`${recipe.name} crafted`)
    })
  }

  function handleUndoRecipe(eventId: string) {
    void fetch(`/api/match/${match.id}/recipe/${eventId}`, {
      method: "DELETE",
      credentials: "include",
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json() as { error?: string }
        toast.error(error.error ?? "Failed to revert recipe")
        return
      }
      await refreshRecipeSurfaces()
      toast.success("Recipe reverted")
    })
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
    postStateAction({ action: "set_home_mod", player, homeMod: null }, next)
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

  async function editMatchScore(scoreA: number, scoreB: number) {
    const res = await fetch(`/api/match/${match.id}/match-score`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scoreA, scoreB }),
    })
    if (!res.ok) {
      const error = await res.json() as { error?: string }
      toast.error(error.error ?? "Failed to update match score")
      return
    }
    const data = await res.json() as { scoreA: number; scoreB: number; state?: MatchFlowState }
    setLiveScoreA(data.scoreA)
    setLiveScoreB(data.scoreB)
    if (data.state) setFlowState(data.state)
    toast.success("Match score updated")
  }

  async function resetMatch() {
    const res = await fetch(`/api/match/${match.id}/reset`, {
      method: "POST",
      credentials: "include",
    })
    if (!res.ok) {
      const error = await res.json() as { error?: string }
      toast.error(error.error ?? "Failed to reset match")
      return
    }
    const data = await res.json() as {
      state?: MatchFlowState
      status?: Match["status"]
      totals?: { scoreA: number; scoreB: number }
      inventories?: { a: Inventory; b: Inventory }
    }
    setLiveScoreA(data.totals?.scoreA ?? 0)
    setLiveScoreB(data.totals?.scoreB ?? 0)
    if (data.inventories) setLiveInventory(data.inventories)
    if (data.state) setFlowState(data.state)
    if (data.status) setLiveMatchStatus(data.status)
    setLiveMappool((current) => current?.map((map) => ({
      ...map,
      status: "available",
      pickedBy: undefined,
      bannedBy: undefined,
      winner: undefined,
    })) ?? null)
    setRecipeEvents([])
    setLatestRolls({})
    setDetectedScores({ slot: "", run: 0 })
    setSelectedMap(null)
    toast.success("Match reset")
  }

  async function sendIrc(channel: string, message: string) {
    await fetch("/api/irc/send", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, message }),
    })
  }

  async function sendPickSequence(map: PoolMap, channel: string, recipeSetup?: RecipePickSetup) {
    const beatmapId = recipeSetup?.beatmapId ?? map.beatmapId
    if (beatmapId) {
      await sendIrc(channel, `!mp map ${beatmapId} 0`)
      await new Promise((resolve) => setTimeout(resolve, 350))
    }
    for (const command of recipeSetup?.commandsBefore ?? []) await sendIrc(channel, command)
    await sendIrc(channel, `!mp mods ${recipeSetup?.mods || lobbyModsForPool(map.pool, enforceNF)}`)
    for (const notice of recipeSetup?.notices ?? []) await sendIrc(channel, notice)
    await sendIrc(channel, "!mp timer 120")
  }

  async function setupPickedMap(map: PoolMap) {
    if (setupSubmitting) return
    setSetupSubmitting(true)
    try {
      const res = await fetch(`/api/match/${match.id}/setup-map`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: map.slot }),
      })
      if (!res.ok) {
        const error = await res.json() as { error?: string }
        toast.error(error.error ?? "Failed to set up map")
        return
      }
      const data = await res.json() as { state?: MatchFlowState; recipeSetup?: RecipePickSetup }
      if (data.state) setFlowState(data.state)
      setDetectedScores({ slot: map.slot, run: 0 })
      const channel = lobbyUrlToChannel(liveLobbyUrl)
      if (channel) await sendPickSequence(map, channel, data.recipeSetup)
      await refreshRecipeSurfaces()
    } catch {
      toast.error("Failed to set up map")
    } finally {
      setSetupSubmitting(false)
    }
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

  const tiebreakerReady = isTiebreakerReady(liveScoreA, liveScoreB, match.bestOf ?? 9)
  const activeSlot = flowState?.currentSlot
  const accuracyMode = Boolean(activeSlot && recipeEvents.some((event) =>
    event.status === "active" &&
    event.target?.toLowerCase() === activeSlot.toLowerCase() &&
    (event.recipeId === 12 || event.payload.copiedEffectType === "accuracy_mode")
  ))
  const caramelUnlockedSlots = new Set(recipeEvents
    .filter((event) => event.status === "active" && event.recipeId === 21 && event.target)
    .map((event) => event.target?.toLowerCase()))
  const selectedMapBlockedByTiebreaker = Boolean(selectedMap && (
    (selectedMap.pool === "TB" && !tiebreakerReady && !caramelUnlockedSlots.has(selectedMap.slot.toLowerCase())) ||
    (selectedMap.pool !== "TB" && tiebreakerReady)
  ))

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
          onResetMatch={() => void resetMatch()}
          onScoreEdit={(scoreA, scoreB) => void editMatchScore(scoreA, scoreB)}
          homeModA={flowState?.homeModA}
          homeModB={flowState?.homeModB}
          homeModTurnPlayer={flowState?.phase === "home_mod" ? flowState.turnPlayer : undefined}
          onHomeModSelect={setHomeMod}
          onClearHomeMod={clearHomeMod}
          matchStatus={liveMatchStatus}
          hasLobby={liveLobbyUrl !== undefined}
          isDemo={isDemo}
          postResultReady={flowState?.phase === "ready_result"}
          testResultUnlocked={false}
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
                {testMode && <TabsTrigger value="sim" className="flex-1 text-xs text-amber-700 dark:text-amber-400">Integration</TabsTrigger>}
              </TabsList>
            </div>

            <TabsContent value="recipes" className="flex-1 overflow-y-auto p-4">
              <RecipePanel
                invA={liveInventory?.a ?? INVENTORY_A}
                invB={liveInventory?.b ?? INVENTORY_B}
                labelA={match.playerA}
                labelB={match.playerB}
                phase={flowState?.phase}
                mappool={liveMappool ?? undefined}
                onUseRecipe={handleRecipeUse}
                recipeEvents={recipeEvents}
                onUndoRecipe={handleUndoRecipe}
                craftingDisabled={tiebreakerReady}
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
                onSetupMap={(map) => void setupPickedMap(map)}
                setupSubmitting={setupSubmitting}
                scoreSubmitting={scoreSubmitting}
                detectedScores={detectedScores.slot === flowState?.currentSlot ? detectedScores : undefined}
                accuracyMode={accuracyMode}
                onSubmitScore={submitScore}
              />
              <Separator className="my-4" />
              <p className="font-heading text-xs uppercase tracking-[0.16em] text-muted-foreground mb-3">Lobby activity (current session)</p>
              {liveEvents.length === 0 && (
                <p className="text-xs text-muted-foreground/40 text-center pt-4">No BanchoBot activity received in this browser session.</p>
              )}
              {liveEvents.slice().reverse().map((e) => (
                <div key={e.id} className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-xs flex items-start gap-2">
                  <span className="font-mono text-muted-foreground/60 flex-shrink-0">
                    {new Date(e.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <span className={
                    e.kind === "abort"      ? "text-destructive font-semibold" :
                    e.kind === "roll"       ? "text-[#9cb7c7]" :
                    e.kind === "score"      ? "text-primary font-semibold" :
                    e.kind === "map"        ? "text-[#9cb7c7]" :
                    e.kind === "start"      ? "text-[#a8c29f] font-semibold" :
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
                onMessagesChange={(msgs) => { ircMessagesRef.current = msgs }}
                onNewMessage={handleNewIrcMessage}
              />
            </TabsContent>

            {testMode && (
              <TabsContent value="sim" className="flex-1 overflow-y-auto p-4">
                <TestSimPanel
                  matchId={match.id}
                  playerA={match.playerA}
                  playerB={match.playerB}
                  playerAOsuId={match.playerAOsuId}
                  playerBOsuId={match.playerBOsuId}
                  binding={flowState?.testBinding}
                  currentSlot={flowState?.currentSlot}
                  scoreSubmitting={scoreSubmitting}
                  onBindingChange={(testBinding) => setFlowState((current) => current ? {
                    ...current,
                    phase: current.phase === "lobby" && testBinding ? "roll" : current.phase,
                    testBinding,
                  } : current)}
                  onLobbyChange={setLiveLobbyUrl}
                  onApplyScore={submitScore}
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
            : selectedMap?.status === "completed"
              ? flowState?.phase === "craft" && !flowState.currentSlot && !selectedMapBlockedByTiebreaker
                ? ["pick", "unpick"]
                : ["unpick"]
            : selectedMap?.status !== "available"
            ? []
            : selectedMapBlockedByTiebreaker
              ? []
            : flowState?.currentSlot
              ? []
            : manualMapActions
              ? undefined
              : flowState?.phase === "ban"
              ? ["ban"]
              : flowState?.phase === "craft"
                ? ["pick"]
                : []
        }
        expectedPlayer={(selectedMap?.status === "available" || selectedMap?.status === "completed") && !manualMapActions ? flowState?.turnPlayer : undefined}
        helperText={
          selectedMap?.status === "picked"
            ? "Remove this pending pick and return the map to available."
            : selectedMap?.status === "completed"
              ? flowState?.phase === "craft" && !selectedMapBlockedByTiebreaker
                ? "Repick this slot, or remove its latest completed result."
                : "Remove this map's latest completed result."
            : selectedMap?.status !== "available"
            ? "This map is already locked."
            : selectedMapBlockedByTiebreaker
              ? selectedMap.pool === "TB"
                ? "The tiebreaker opens at mutual match point or through Caramel."
                : "Both players are at match point. Play the tiebreaker."
            : flowState?.currentSlot
              ? `Finish or unpick ${flowState.currentSlot} before choosing another map.`
            : manualMapActions
              ? "Manual order is on. Either player can pick, ban, or protect."
              : flowState?.phase === "ban" && flowState.turnPlayer
              ? `${flowState.turnPlayer} must ban next.`
              : flowState?.phase === "craft" && flowState.turnPlayer
                ? `${flowState.turnPlayer} to pick.`
                : "Finish the current flow phase before choosing a map."
        }
        onClose={() => setSelectedMap(null)}
        onAction={(action, player) => {
          const map = selectedMap
          if (!map) return
          if (action !== "unpick" && !player) return
          setSelectedMap(null)

          void fetch(`/api/match/${match.id}/action`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, player, slot: map.slot, manualOrder: manualMapActions }),
          }).then(async (res) => {
            if (!res.ok) {
              const err = await res.json() as { error?: string }
              toast.error(err.error ?? "Action failed")
              return
            }
            const data = await res.json() as { state?: MatchFlowState; recipeSetup?: RecipePickSetup }
            setLiveMappool((prev) => prev ? prev.map((current) => {
              if (current.slot !== map.slot) return current
              if (action === "unpick") {
                return { ...current, status: "available", pickedBy: undefined, bannedBy: undefined, winner: undefined }
              }
              return {
                ...current,
                status: action === "pick" ? "picked" : action === "ban" ? "banned" : "protected",
                ...(action === "pick" ? { pickedBy: player } : {}),
                ...(action === "ban" ? { bannedBy: player } : {}),
              }
            }) : prev)
            if (data.state) setFlowState(data.state)
            else if (action === "unpick") {
              setFlowState((prev) => prev?.currentSlot === map.slot
                ? { ...prev, phase: "craft", turnPlayer: map.pickedBy ?? prev.turnPlayer, currentSlot: undefined, updatedAt: new Date().toISOString() }
                : prev)
            }
            else if (!manualMapActions && player) advanceLocalAfterMapAction(action, player, map.slot)

            await refreshRecipeSurfaces()
          }).catch(() => toast.error("Action failed"))
        }}
      />
    </div>
  )
}
