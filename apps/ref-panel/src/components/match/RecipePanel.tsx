import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { INGREDIENTS } from "@/data/constants"
import { RECIPES, RECIPES_ALPHABETICAL } from "@/data/recipes"
import { canAfford } from "@/lib/mappool"
import { isBanLimitReached } from "@/lib/match-rules"
import type {
  IngKey,
  Inventory,
  MatchFlowPhase,
  PoolMap,
  Recipe,
  RecipeActivation,
  RecipeEvent,
} from "@/types"

const MOD_CHOICES = ["HD", "HR", "HT", "EZ", "FL", "SO"] as const
const SUGAR_COOKIE_MOD_CHOICES = MOD_CHOICES.filter((mod) => mod !== "HT")

function isRecipeTimingOpen(phase: MatchFlowPhase | undefined, hasPickedMap: boolean, craftingDisabled: boolean): boolean {
  return phase === "craft" && !hasPickedMap && !craftingDisabled
}

function CostDisplay({ cost }: { cost: Partial<Inventory> }) {
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {(Object.entries(cost) as [IngKey, number][]).map(([key, amount]) => {
        const ingredient = INGREDIENTS.find((candidate) => candidate.key === key)
        if (!ingredient) return null
        return (
          <span key={key} className="flex items-center gap-1 text-xs text-muted-foreground">
            <img
              src={`/assets/Ingredients/${ingredient.icon}.png`}
              alt={ingredient.name}
              className="h-3 w-3 select-none object-contain"
              draggable={false}
            />
            <span style={{ color: ingredient.hex }}>{ingredient.name}</span>
            <span className="font-mono tabular-nums">x{amount}</span>
          </span>
        )
      })}
    </span>
  )
}

function IngredientBar({ inventory }: { inventory: Inventory }) {
  return (
    <div className="flex flex-col gap-1 pt-1">
      {INGREDIENTS.map(({ key, name, hex, icon }) => (
        <div key={key} className="flex items-center gap-2">
          <img
            src={`/assets/Ingredients/${icon}.png`}
            alt={name}
            className="h-7 w-7 flex-shrink-0 select-none object-contain"
            draggable={false}
          />
          <span className="flex-1 text-xs text-muted-foreground">{name}</span>
          <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: hex }}>
            x{inventory[key]}
          </span>
        </div>
      ))}
    </div>
  )
}

function RecipeList({
  inventory,
  label,
  phase,
  hasPickedMap,
  banLimitReached,
  craftingDisabled,
  onActivate,
}: {
  inventory: Inventory
  label: string
  phase?: MatchFlowPhase
  hasPickedMap: boolean
  banLimitReached: boolean
  craftingDisabled: boolean
  onActivate: (player: string, recipe: Recipe) => void
}) {
  const affordableCount = craftingDisabled
    ? 0
    : RECIPES_ALPHABETICAL.filter((recipe) =>
        canAfford(recipe, inventory) && !(banLimitReached && recipe.effectType === "extra_ban")
      ).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-heading text-sm uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <span className="text-xs text-muted-foreground">{affordableCount} craftable</span>
      </div>
      <IngredientBar inventory={inventory} />

      <div className="space-y-1.5">
          {RECIPES_ALPHABETICAL.map((recipe) => {
            const affordable = canAfford(recipe, inventory)
            const timingOpen = isRecipeTimingOpen(phase, hasPickedMap, craftingDisabled)
            const blockedByBanLimit = banLimitReached && recipe.effectType === "extra_ban"
            return (
            <div key={recipe.id} className={`rounded-md border border-border px-3 py-2 ${affordable ? "bg-secondary/10" : "opacity-50"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{recipe.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{recipe.desc}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <CostDisplay cost={recipe.cost} />
                  </div>
                </div>
                <Button
                  size="sm"
                  className="flex-shrink-0 text-xs"
                  variant="secondary"
                  disabled={!affordable || !timingOpen || blockedByBanLimit}
                  onClick={() => onActivate(label, recipe)}
                >
                  Use
                </Button>
              </div>
            </div>
          )})}
      </div>
    </div>
  )
}

function RecipeEvents({
  entries,
  onUndo,
}: {
  entries: RecipeEvent[]
  onUndo?: (eventId: string) => void
}) {
  if (entries.length === 0) return null
  return (
    <div className="space-y-1.5">
      <p className="font-heading text-xs uppercase tracking-[0.16em] text-muted-foreground">Recipe status</p>
      {entries.slice().reverse().map((entry) => {
        const recipe = RECIPES.find((candidate) => candidate.id === entry.recipeId)
        if (!recipe) return null
        const wildcardMap = String(entry.payload.wildcardMap ?? "").trim()
        const wildcardSource = [
          entry.payload.wildcardMappoolYear,
          entry.payload.wildcardSourceRound,
          entry.payload.wildcardSourceSlot,
        ].map((value) => String(value ?? "").trim()).filter(Boolean).join(" · ")
        const wildcardWinCondition = entry.payload.wildcardWinCondition === "accuracy" ? "Accuracy" : "ScoreV2"
        const wildcardMod = String(entry.payload.wildcardMod ?? "").trim() || "NM"
        return (
          <div key={entry.id} className="rounded-md border border-border/70 bg-card/35 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium">{recipe.name}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {entry.status}
                  {entry.target ? ` · ${entry.target}` : ""}
                </p>
                {wildcardMap && (
                  <div className="mt-1.5 space-y-0.5 text-[10px] text-foreground/75">
                    <p>{wildcardMap}</p>
                    <p className="text-muted-foreground">{wildcardSource} · {wildcardMod} · {wildcardWinCondition}</p>
                  </div>
                )}
              </div>
              {entry.status === "active" && !entry.activatedAt && onUndo && (
                <Button size="xs" variant="ghost" onClick={() => onUndo(entry.id)}>
                  Revert
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function NativeSelect({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
    >
      {children}
    </select>
  )
}

interface Props {
  invA: Inventory
  invB: Inventory
  labelA: string
  labelB: string
  phase?: MatchFlowPhase
  mappool?: PoolMap[]
  onUseRecipe?: (player: string, recipeId: number, activation: RecipeActivation) => void
  recipeEvents?: RecipeEvent[]
  onUndoRecipe?: (eventId: string) => void
  craftingDisabled?: boolean
}

export function RecipePanel({
  invA,
  invB,
  labelA,
  labelB,
  phase,
  mappool = [],
  onUseRecipe,
  recipeEvents = [],
  onUndoRecipe,
  craftingDisabled = false,
}: Props) {
  const [pending, setPending] = useState<{ player: string; recipe: Recipe } | null>(null)
  const [activation, setActivation] = useState<RecipeActivation>({})
  const usedA = recipeEvents.filter((event) => event.player.toLowerCase() === labelA.toLowerCase())
  const usedB = recipeEvents.filter((event) => event.player.toLowerCase() === labelB.toLowerCase())
  const availableMaps = mappool.filter((map) => map.status === "available")
  const bannedMaps = mappool.filter((map) => map.status === "banned")
  const banLimitReached = isBanLimitReached(bannedMaps.length)
  const hasPickedMap = mappool.some((map) => map.status === "picked")
  const caramelActive = recipeEvents.some((event) =>
    event.status === "active" && (event.recipeId === 21 || event.payload.copiedEffectType === "wildcard_slot")
  )
  const craftingLocked = craftingDisabled || caramelActive

  function openActivation(player: string, recipe: Recipe) {
    setPending({ player, recipe })
    setActivation({})
  }

  function confirmActivation() {
    if (!pending) return
    onUseRecipe?.(pending.player, pending.recipe.id, activation)
    setPending(null)
    setActivation({})
  }

  const inputs = pending?.recipe.inputs ?? []

  return (
    <>
      <div className="space-y-6">
        {caramelActive && (
          <div className="rounded-md border border-amber-600/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            Caramel is active. Other recipes are locked until it resolves or is reverted.
          </div>
        )}
        <div className="space-y-3">
          <RecipeEvents entries={usedA} onUndo={onUndoRecipe} />
          <RecipeList inventory={invA} label={labelA} phase={phase} hasPickedMap={hasPickedMap} banLimitReached={banLimitReached} craftingDisabled={craftingLocked} onActivate={openActivation} />
        </div>
        <Separator />
        <div className="space-y-3">
          <RecipeEvents entries={usedB} onUndo={onUndoRecipe} />
          <RecipeList inventory={invB} label={labelB} phase={phase} hasPickedMap={hasPickedMap} banLimitReached={banLimitReached} craftingDisabled={craftingLocked} onActivate={openActivation} />
        </div>
      </div>

      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.recipe.name}</DialogTitle>
            <DialogDescription>{pending?.recipe.desc}</DialogDescription>
          </DialogHeader>

          {inputs.includes("mod") && (
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Recipe mod</span>
              <NativeSelect value={activation.mod ?? ""} onChange={(mod) => setActivation((current) => ({ ...current, mod }))}>
                <option value="">Select mod</option>
                {SUGAR_COOKIE_MOD_CHOICES.map((mod) => <option key={mod} value={mod}>{mod}</option>)}
              </NativeSelect>
            </label>
          )}

          {inputs.includes("mods_both") && (
            <div className="grid grid-cols-2 gap-2">
              {[labelA, labelB].map((label, index) => {
                const key = index === 0 ? "modA" : "modB"
                return (
                  <label key={label} className="space-y-1">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <NativeSelect
                      value={activation[key] ?? ""}
                      onChange={(mod) => setActivation((current) => ({ ...current, [key]: mod }))}
                    >
                      <option value="">Select mod</option>
                      {MOD_CHOICES.map((mod) => <option key={mod} value={mod}>{mod}</option>)}
                    </NativeSelect>
                  </label>
                )
              })}
            </div>
          )}

          {inputs.includes("protect_map") && (
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Map to protect</span>
              <NativeSelect value={activation.targetSlot ?? ""} onChange={(targetSlot) => setActivation((current) => ({ ...current, targetSlot }))}>
                <option value="">Select available map</option>
                {availableMaps.map((map) => <option key={map.slot} value={map.slot}>{map.slot} · {map.map}</option>)}
              </NativeSelect>
            </label>
          )}

          {inputs.includes("unban_map") && (
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Map to unban</span>
              <NativeSelect value={activation.targetSlot ?? ""} onChange={(targetSlot) => setActivation((current) => ({ ...current, targetSlot }))}>
                <option value="">Select banned map</option>
                {bannedMaps.map((map) => <option key={map.slot} value={map.slot}>{map.slot} · {map.map}</option>)}
              </NativeSelect>
            </label>
          )}

          {inputs.includes("ingredient") && (
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Ingredient</span>
              <NativeSelect
                value={activation.ingredient ?? ""}
                onChange={(ingredient) => setActivation((current) => ({ ...current, ingredient: ingredient as IngKey }))}
              >
                <option value="">Select ingredient</option>
                {INGREDIENTS.map((ingredient) => <option key={ingredient.key} value={ingredient.key}>{ingredient.name}</option>)}
              </NativeSelect>
            </label>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            <Button onClick={confirmActivation}>Activate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
