import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { INGREDIENTS } from "@/data/constants"
import { isMissCountWinCondition, isValidRoll, parseScoreValue } from "@/lib/match-rules"
import type { IngKey, MatchFlowState, PoolMap, ScoreSubmissionDetails } from "@/types"

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
  onSetupMap: (map: PoolMap) => void
  setupSubmitting?: boolean
  scoreSubmitting?: boolean
  detectedScores?: { a?: number; b?: number; run: number }
  accuracyMode?: boolean
  wildcardRewardRequired?: boolean
  onSubmitScore: (slot: string, scoreA: number, scoreB: number, details: ScoreSubmissionDetails) => void
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
  onSetupMap,
  setupSubmitting = false,
  scoreSubmitting = false,
  detectedScores,
  accuracyMode = false,
  wildcardRewardRequired = false,
  onSubmitScore,
}: Props) {
  const currentMap = !mappool
    ? null
    : state?.currentSlot
      ? mappool.find((map) => map.slot === state.currentSlot) ?? null
      : mappool.find((map) => map.status === "picked") ?? null
  const currentSlotKey = currentMap ? `${currentMap.slot}:${detectedScores?.run ?? 0}` : ""
  const [scoreEntry, setScoreEntry] = useState<{
    slot: string
    a?: string
    b?: string
    usesHdA?: boolean
    usesHdB?: boolean
    missCountA?: string
    missCountB?: string
    rewardA?: IngKey | ""
    rewardB?: IngKey | ""
  }>({ slot: "" })
  const [rollEntry, setRollEntry] = useState<{ a?: string; b?: string }>({})

  if (!state) {
    return <p className="pt-4 text-center text-xs text-muted-foreground/50">Loading flow state.</p>
  }

  const detectedRollA = latestRolls.a ?? state.rollA
  const detectedRollB = latestRolls.b ?? state.rollB
  const rollA = rollEntry.a === undefined ? detectedRollA : Number(rollEntry.a)
  const rollB = rollEntry.b === undefined ? detectedRollB : Number(rollEntry.b)
  const validRollA = typeof rollA === "number" && isValidRoll(rollA)
  const validRollB = typeof rollB === "number" && isValidRoll(rollB)
  const canSaveRolls = validRollA && validRollB
  const rollWinner = canSaveRolls && rollA !== rollB ? (rollA > rollB ? playerA : playerB) : state.rollWinner
  const winsNeeded = Math.ceil(bestOf / 2)
  const scoreInputA = scoreEntry.slot === currentSlotKey && scoreEntry.a !== undefined
    ? scoreEntry.a
    : detectedScores?.a?.toString() ?? ""
  const scoreInputB = scoreEntry.slot === currentSlotKey && scoreEntry.b !== undefined
    ? scoreEntry.b
    : detectedScores?.b?.toString() ?? ""
  const parsedScoreA = parseScoreValue(scoreInputA)
  const parsedScoreB = parseScoreValue(scoreInputB)
  const missCountMode = Boolean(currentMap && isMissCountWinCondition(currentMap.slot))
  const missCountInputA = scoreEntry.slot === currentSlotKey ? scoreEntry.missCountA ?? "" : ""
  const missCountInputB = scoreEntry.slot === currentSlotKey ? scoreEntry.missCountB ?? "" : ""
  const parsedMissCountA = parseScoreValue(missCountInputA)
  const parsedMissCountB = parseScoreValue(missCountInputB)
  const validMissCounts = !missCountMode || (
    parsedMissCountA !== null && Number.isInteger(parsedMissCountA) &&
    parsedMissCountB !== null && Number.isInteger(parsedMissCountB)
  )
  const scoresWithinRange = !accuracyMode || (
    parsedScoreA !== null && parsedScoreB !== null && parsedScoreA <= 100 && parsedScoreB <= 100
  )
  const rewardA = scoreEntry.slot === currentSlotKey ? scoreEntry.rewardA ?? "" : ""
  const rewardB = scoreEntry.slot === currentSlotKey ? scoreEntry.rewardB ?? "" : ""
  const validWildcardRewards = !wildcardRewardRequired || (Boolean(rewardA) && Boolean(rewardB))
  const canSubmitScore = currentMap && parsedScoreA !== null && parsedScoreB !== null && scoresWithinRange && validMissCounts && validWildcardRewards

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
          {state.phase === "craft" && currentMap ? `${currentMap.slot} is picked. Set up the map when ready.` : null}
          {state.phase === "craft" && !currentMap && state.turnPlayer ? `Craft recipes, then ${state.turnPlayer} picks a map.` : null}
          {state.phase === "play" && currentMap ? `${currentMap.slot} is in play. Record the score after both players finish.` : null}
          {state.phase === "ready_result" ? "Match point target reached. Post the result from the left panel." : null}
          {state.phase === "completed" ? "Final result has been posted." : null}
          {state.phase === "lobby" ? "Create or join the osu! lobby from the left panel." : null}
          {state.phase === "roll" ? "Wait for both player rolls, then save them here." : null}
          {state.phase === "order" ? `${state.rollWinner ?? rollWinner ?? "Roll winner"} chooses one order; the other player receives the remaining order.` : null}
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
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-muted-foreground">{playerA}</span>
              <Input
                type="number"
                min={1}
                max={100}
                inputMode="numeric"
                value={rollEntry.a ?? detectedRollA ?? ""}
                onChange={(event) => setRollEntry((current) => ({ ...current, a: event.target.value }))}
                placeholder="1-100"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-muted-foreground">{playerB}</span>
              <Input
                type="number"
                min={1}
                max={100}
                inputMode="numeric"
                value={rollEntry.b ?? detectedRollB ?? ""}
                onChange={(event) => setRollEntry((current) => ({ ...current, b: event.target.value }))}
                placeholder="1-100"
              />
            </label>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs"
            disabled={!canSaveRolls}
            onClick={() => canSaveRolls && onSaveRolls(rollA, rollB)}
          >
            Save current rolls
          </Button>
          {canSaveRolls && rollA === rollB && (
            <p className="text-xs text-muted-foreground">Tie roll. Ask both players to roll again.</p>
          )}
        </div>
      )}

      {state.phase === "order" && rollWinner && (
        <div className="space-y-2">
          <p className="font-heading text-xs uppercase tracking-[0.16em] text-muted-foreground">{rollWinner}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal text-xs" onClick={() => onChooseOrder("pick_first")}>Pick first / ban second</Button>
            <Button size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal text-xs" onClick={() => onChooseOrder("ban_first")}>Ban first / pick second</Button>
          </div>
        </div>
      )}

      {(state.phase === "ban" || state.phase === "craft") && (
        <div className="space-y-2">
          <Separator />
          <p className="text-xs text-muted-foreground">
            {state.phase === "craft" && currentMap
              ? "Crafting is closed for this pick. Set up the map when both players are ready."
              : manualMapActions
              ? "Select an available map in the pool table. Any player can pick, ban, or protect."
              : "Select an available map in the pool table. Only the expected player/action is enabled."}
          </p>
          {state.phase === "craft" && currentMap && (
            <Button size="sm" className="w-full text-xs" disabled={setupSubmitting} onClick={() => onSetupMap(currentMap)}>
              {setupSubmitting ? "Setting up..." : `Set up ${currentMap.slot}`}
            </Button>
          )}
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
                onChange={(event) => setScoreEntry((current) => ({ ...current, slot: currentSlotKey, a: event.target.value, b: scoreInputB }))}
                inputMode={accuracyMode ? "decimal" : "numeric"}
                placeholder={accuracyMode ? "98.76%" : "987432"}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-muted-foreground">{playerB}</span>
              <Input
                value={scoreInputB}
                onChange={(event) => setScoreEntry((current) => ({ ...current, slot: currentSlotKey, a: scoreInputA, b: event.target.value }))}
                inputMode={accuracyMode ? "decimal" : "numeric"}
                placeholder={accuracyMode ? "97.54%" : "854201"}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([
              [playerA, "usesHdA"],
              [playerB, "usesHdB"],
            ] as const).map(([player, key]) => (
              <label key={key} className="flex items-center justify-between rounded-md border border-border/60 px-2.5 py-2 text-xs">
                <span>{player} used HD</span>
                <Switch
                  checked={scoreEntry.slot === currentSlotKey && Boolean(scoreEntry[key])}
                  onCheckedChange={(checked) => setScoreEntry((current) => ({
                    ...current,
                    slot: currentSlotKey,
                    [key]: checked,
                  }))}
                  aria-label={`${player} used HD`}
                />
              </label>
            ))}
          </div>
          {missCountMode && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">PS3 uses lower miss count. A tied miss count requires a replay.</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">{playerA} misses</span>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={missCountInputA}
                    onChange={(event) => setScoreEntry((current) => ({ ...current, slot: currentSlotKey, missCountA: event.target.value }))}
                    placeholder="0"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">{playerB} misses</span>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={missCountInputB}
                    onChange={(event) => setScoreEntry((current) => ({ ...current, slot: currentSlotKey, missCountB: event.target.value }))}
                    placeholder="0"
                  />
                </label>
              </div>
            </div>
          )}
          {accuracyMode && !scoresWithinRange && (
            <p className="text-xs text-destructive">Accuracy must be between 0% and 100%.</p>
          )}
          {wildcardRewardRequired && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Choose the two ingredients awarded to this map's winner.</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["Winner reward 1", "rewardA", rewardA],
                  ["Winner reward 2", "rewardB", rewardB],
                ] as const).map(([label, key, value]) => (
                  <label key={key} className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                      value={value}
                      onChange={(event) => setScoreEntry((current) => ({
                        ...current,
                        slot: currentSlotKey,
                        [key]: event.target.value as IngKey | "",
                      }))}
                    >
                      <option value="">Select ingredient</option>
                      {INGREDIENTS.map((ingredient) => <option key={ingredient.key} value={ingredient.key}>{ingredient.name}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}
          <Button
            size="sm"
            className="w-full text-xs"
            disabled={!canSubmitScore || scoreSubmitting}
            onClick={() => currentMap && parsedScoreA !== null && parsedScoreB !== null && onSubmitScore(
              currentMap.slot,
              parsedScoreA,
              parsedScoreB,
              {
                usesHdA: scoreEntry.slot === currentSlotKey && Boolean(scoreEntry.usesHdA),
                usesHdB: scoreEntry.slot === currentSlotKey && Boolean(scoreEntry.usesHdB),
                ...(missCountMode && parsedMissCountA !== null && parsedMissCountB !== null
                  ? { missCountA: parsedMissCountA, missCountB: parsedMissCountB }
                  : {}),
                ...(wildcardRewardRequired && rewardA && rewardB
                  ? { rewardIngredients: [rewardA, rewardB] as [IngKey, IngKey] }
                  : {}),
              },
            )}
          >
            {scoreSubmitting ? "Submitting..." : "Submit scores"}
          </Button>
        </div>
      )}

      <div className="rounded-md border border-border/50 px-3 py-2 text-xs text-muted-foreground">
        <p className="font-mono">score {scoreA}-{scoreB} / first to {winsNeeded}</p>
      </div>
    </div>
  )
}
