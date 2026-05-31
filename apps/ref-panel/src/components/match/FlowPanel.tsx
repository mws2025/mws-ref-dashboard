import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import type { MatchFlowState, PoolMap } from "@/types"

interface Props {
  state: MatchFlowState | null
  playerA: string
  playerB: string
  scoreA: number
  scoreB: number
  bestOf: number
  mappool: PoolMap[] | null
  latestRolls: { a?: number; b?: number }
  manualMapActions: boolean
  onManualMapActionsChange: (enabled: boolean) => void
  onSaveRolls: (rollA: number, rollB: number) => void
  onChooseOrder: (choice: "pick_first" | "ban_first") => void
  onSubmitScore: (slot: string, scoreA: number, scoreB: number, winner: string) => void
}

const PHASE_LABEL: Record<MatchFlowState["phase"], string> = {
  lobby: "Lobby",
  roll: "Roll",
  order: "Order choice",
  home_mod: "Home mod",
  ban: "Ban",
  craft: "Pick",
  play: "Play",
  ready_result: "Ready result",
  completed: "Completed",
}

function playerLabel(player: string, playerA: string, playerB: string) {
  if (player.toLowerCase() === playerA.toLowerCase()) return "P1"
  if (player.toLowerCase() === playerB.toLowerCase()) return "P2"
  return "Player"
}

export function FlowPanel({
  state,
  playerA,
  playerB,
  scoreA,
  scoreB,
  bestOf,
  mappool,
  latestRolls,
  manualMapActions,
  onManualMapActionsChange,
  onSaveRolls,
  onChooseOrder,
  onSubmitScore,
}: Props) {
  const currentMap = !mappool
    ? null
    : state?.currentSlot
      ? mappool.find((map) => map.slot === state.currentSlot) ?? null
      : mappool.find((map) => map.status === "picked") ?? null
  const currentSlotKey = currentMap?.slot ?? ""
  const [scoreEntry, setScoreEntry] = useState({ slot: "", a: "", b: "" })

  if (!state) {
    return <p className="pt-4 text-center text-xs text-muted-foreground/50">Loading flow state.</p>
  }

  const rollA = latestRolls.a ?? state.rollA
  const rollB = latestRolls.b ?? state.rollB
  const rollWinner = rollA != null && rollB != null && rollA !== rollB ? (rollA > rollB ? playerA : playerB) : state.rollWinner
  const winsNeeded = Math.ceil(bestOf / 2)
  const scoreInputA = scoreEntry.slot === currentSlotKey ? scoreEntry.a : ""
  const scoreInputB = scoreEntry.slot === currentSlotKey ? scoreEntry.b : ""
  const parsedScoreA = Number(scoreInputA)
  const parsedScoreB = Number(scoreInputB)
  const canSubmitScore = currentMap && Number.isFinite(parsedScoreA) && Number.isFinite(parsedScoreB)

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/70 bg-card/35 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <p className="font-heading text-xs uppercase tracking-[0.16em] text-muted-foreground">Current phase</p>
          <span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
            {PHASE_LABEL[state.phase]}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {state.phase === "ban" && state.turnPlayer ? `${state.turnPlayer} bans next.` : null}
          {state.phase === "craft" && state.turnPlayer ? `${state.turnPlayer} picks a map. Craft first if needed (Recipes tab).` : null}
          {state.phase === "play" && currentMap ? `${currentMap.slot} is in play. Record the score after both players finish.` : null}
          {state.phase === "ready_result" ? "Match point target reached. Post the result from the left panel." : null}
          {state.phase === "completed" ? "Final result has been posted." : null}
          {state.phase === "lobby" ? "Create or join the osu! lobby from the left panel." : null}
          {state.phase === "roll" ? "Wait for both player rolls, then save them here." : null}
          {state.phase === "order" ? `${state.rollWinner ?? rollWinner ?? "Roll winner"} chooses whether to pick first or ban first.` : null}
          {state.phase === "home_mod" && state.turnPlayer ? `${state.turnPlayer} chooses home mod in the player column.` : null}
        </p>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-heading text-xs uppercase tracking-[0.16em] text-muted-foreground">Manual pick/ban order</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {manualMapActions ? "Free pick, ban, or protect by either player." : "Flow order limits map action and player."}
            </p>
          </div>
          <Switch
            checked={manualMapActions}
            onCheckedChange={onManualMapActionsChange}
            aria-label="Toggle manual pick and ban order"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-border/60 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{playerLabel(playerA, playerA, playerB)}</p>
          <p className="mt-1 font-medium">{playerA}</p>
          <p className="mt-1 font-mono text-muted-foreground">roll {rollA ?? "-"}</p>
          {state.homeModA && <p className="font-mono text-muted-foreground">home {state.homeModA}</p>}
        </div>
        <div className="rounded-md border border-border/60 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{playerLabel(playerB, playerA, playerB)}</p>
          <p className="mt-1 font-medium">{playerB}</p>
          <p className="mt-1 font-mono text-muted-foreground">roll {rollB ?? "-"}</p>
          {state.homeModB && <p className="font-mono text-muted-foreground">home {state.homeModB}</p>}
        </div>
      </div>

      {state.phase === "roll" && (
        <div className="space-y-2">
          <p className="font-heading text-xs uppercase tracking-[0.16em] text-muted-foreground">Rolls</p>
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs"
            disabled={rollA == null || rollB == null}
            onClick={() => rollA != null && rollB != null && onSaveRolls(rollA, rollB)}
          >
            Save current rolls
          </Button>
          {rollA != null && rollB != null && rollA === rollB && (
            <p className="text-xs text-muted-foreground">Tie roll. Ask both players to roll again.</p>
          )}
        </div>
      )}

      {state.phase === "order" && rollWinner && (
        <div className="space-y-2">
          <p className="font-heading text-xs uppercase tracking-[0.16em] text-muted-foreground">{rollWinner}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => onChooseOrder("pick_first")}>Pick first</Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => onChooseOrder("ban_first")}>Ban first</Button>
          </div>
        </div>
      )}

      {(state.phase === "ban" || state.phase === "craft") && (
        <div className="space-y-2">
          <Separator />
          <p className="text-xs text-muted-foreground">
            {manualMapActions
              ? "Select an available map in the pool table. Any player can pick, ban, or protect."
              : "Select an available map in the pool table. Only the expected player/action is enabled."}
          </p>
        </div>
      )}

      {state.phase === "play" && (
        <div className="space-y-3">
          <Separator />
          <div>
            <p className="font-heading text-xs uppercase tracking-[0.16em] text-muted-foreground">Score entry</p>
            <p className="mt-1 text-xs text-muted-foreground">{currentMap ? `${currentMap.slot} - ${currentMap.map}` : "No picked map found."}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-muted-foreground">{playerA}</span>
              <Input
                value={scoreInputA}
                onChange={(event) => setScoreEntry({ slot: currentSlotKey, a: event.target.value, b: scoreInputB })}
                inputMode="numeric"
                placeholder="987432"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-muted-foreground">{playerB}</span>
              <Input
                value={scoreInputB}
                onChange={(event) => setScoreEntry({ slot: currentSlotKey, a: scoreInputA, b: event.target.value })}
                inputMode="numeric"
                placeholder="854201"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              disabled={!canSubmitScore}
              onClick={() => currentMap && onSubmitScore(currentMap.slot, parsedScoreA, parsedScoreB, playerA)}
            >
              {playerA} wins
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              disabled={!canSubmitScore}
              onClick={() => currentMap && onSubmitScore(currentMap.slot, parsedScoreA, parsedScoreB, playerB)}
            >
              {playerB} wins
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-md border border-border/50 px-3 py-2 text-xs text-muted-foreground">
        <p className="font-mono">score {scoreA}-{scoreB} / first to {winsNeeded}</p>
      </div>
    </div>
  )
}
