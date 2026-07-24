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
import { RECIPES } from "@/data/recipes"
import { canAfford } from "@/lib/mappool"
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

function isRecipeTimingOpen(recipe: Recipe, phase?: MatchFlowPhase): boolean {
  if (!phase) return false
  const timing = recipe.timing.toLowerCase().replace(/[\s-]+/g, "_")
  return timing === "any" ||
    (timing === "ban_phase" && phase === "ban") ||
    (timing === "pick_phase" && phase === "craft") ||
    (timing === "before_map" && phase === "craft") ||
    (timing === "after_score" && phase === "play")
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
  onActivate,
}: {
  inventory: Inventory
  label: string
  phase?: MatchFlowPhase
  onActivate: (player: string, recipe: Recipe) => void
}) {
  const affordable = RECIPES.filter((recipe) => canAfford(recipe, inventory))
  const locked = RECIPES.filter((recipe) => !canAfford(recipe, inventory))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-heading text-sm uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <span className="text-xs text-muted-foreground">{affordable.length} craftable</span>
      </div>
      <IngredientBar inventory={inventory} />

      {affordable.length > 0 && (
        <div className="space-y-1.5">
          {affordable.map((recipe) => (
            <div key={recipe.id} className="rounded-md border border-border bg-secondary/10 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{recipe.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{recipe.desc}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <CostDisplay cost={recipe.cost} />
                    <span className="text-xs text-muted-foreground/70">{recipe.timing}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="flex-shrink-0 text-xs"
                  variant="secondary"
                  disabled={!isRecipeTimingOpen(recipe, phase)}
                  onClick={() => onActivate(label, recipe)}
                >
                  Use
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {locked.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-muted-foreground/70 hover:text-muted-foreground">
            {locked.length} locked recipes
          </summary>
          <div className="mt-1.5 space-y-1">
            {locked.map((recipe) => (
              <div key={recipe.id} className="rounded-md border border-border/50 px-3 py-2 opacity-50">
                <p className="text-xs font-medium">{recipe.name}</p>
                <CostDisplay cost={recipe.cost} />
              </div>
            ))}
          </div>
        </details>
      )}
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
        return (
          <div key={entry.id} className="rounded-md border border-border/70 bg-card/35 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium">{recipe.name}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {entry.status}
                  {entry.target ? ` · ${entry.target}` : ""}
                </p>
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
}: Props) {
  const [pending, setPending] = useState<{ player: string; recipe: Recipe } | null>(null)
  const [activation, setActivation] = useState<RecipeActivation>({})
  const usedA = recipeEvents.filter((event) => event.player.toLowerCase() === labelA.toLowerCase())
  const usedB = recipeEvents.filter((event) => event.player.toLowerCase() === labelB.toLowerCase())
  const availableMaps = mappool.filter((map) => map.status === "available")
  const bannedMaps = mappool.filter((map) => map.status === "banned")

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
        <div className="space-y-3">
          <RecipeEvents entries={usedA} onUndo={onUndoRecipe} />
          <RecipeList inventory={invA} label={labelA} phase={phase} onActivate={openActivation} />
        </div>
        <Separator />
        <div className="space-y-3">
          <RecipeEvents entries={usedB} onUndo={onUndoRecipe} />
          <RecipeList inventory={invB} label={labelB} phase={phase} onActivate={openActivation} />
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
                {MOD_CHOICES.map((mod) => <option key={mod} value={mod}>{mod}</option>)}
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

          {inputs.includes("reward_ingredients") && (
            <div className="grid grid-cols-2 gap-2">
              {[0, 1].map((index) => (
                <label key={index} className="space-y-1">
                  <span className="text-xs text-muted-foreground">Winner reward {index + 1}</span>
                  <NativeSelect
                    value={activation.rewardIngredients?.[index] ?? ""}
                    onChange={(value) => {
                      const current = activation.rewardIngredients ?? ["" as IngKey, "" as IngKey]
                      const next = [...current] as [IngKey, IngKey]
                      next[index] = value as IngKey
                      setActivation((state) => ({ ...state, rewardIngredients: next }))
                    }}
                  >
                    <option value="">Select ingredient</option>
                    {INGREDIENTS.map((ingredient) => <option key={ingredient.key} value={ingredient.key}>{ingredient.name}</option>)}
                  </NativeSelect>
                </label>
              ))}
            </div>
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
