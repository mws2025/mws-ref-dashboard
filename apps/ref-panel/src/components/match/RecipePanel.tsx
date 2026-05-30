import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { INGREDIENTS } from "@/data/constants"
import { RECIPES } from "@/data/recipes"
import { canAfford } from "@/lib/mappool"
import type { IngKey, Inventory, MatchFlowPhase, Recipe } from "@/types"

function isRecipeTimingOpen(recipe: Recipe, phase?: MatchFlowPhase): boolean {
  if (!phase) return false
  const timing = recipe.timing.toLowerCase().replace(/[\s-]+/g, "_")
  return timing === "any" ||
    (timing === "ban_phase" && phase === "ban") ||
    (timing === "pick_phase" && phase === "craft") ||
    (timing === "before_map" && phase === "craft") ||
    (timing === "after_score" && (phase === "craft" || phase === "ready_result"))
}

function CostDisplay({ cost }: { cost: Partial<Inventory> }) {
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {(Object.entries(cost) as [IngKey, number][]).map(([k, n]) => {
        const ing = INGREDIENTS.find((i) => i.key === k)!
        return (
          <span key={k} className="flex items-center gap-1 text-xs text-muted-foreground">
            <img src={`/assets/Ingredients/${ing.icon}.png`} alt={ing.name} className="h-3 w-3 object-contain select-none" draggable={false} />
            <span style={{ color: ing.hex }}>{ing.name}</span>
            <span className="font-mono tabular-nums">x{n}</span>
          </span>
        )
      })}
    </span>
  )
}

function IngredientBar({ inv }: { inv: Inventory }) {
  return (
    <div className="grid grid-cols-5 gap-2 pt-1">
      {INGREDIENTS.map(({ key, name, hex, icon }) => (
        <div key={key} className="flex flex-col items-center gap-0.5">
          <img src={`/assets/Ingredients/${icon}.png`} alt={name} className="h-5 w-5 object-contain select-none" draggable={false} />
          <span className="text-[10px] text-muted-foreground">{name}</span>
          <span className="font-mono text-[10px] font-semibold tabular-nums" style={{ color: hex }}>x{inv[key]}</span>
        </div>
      ))}
    </div>
  )
}

function RecipeList({ inv, label, phase, onUseRecipe }: { inv: Inventory; label: string; phase?: MatchFlowPhase; onUseRecipe?: (recipeId: number) => void }) {
  const affordable = RECIPES.filter((r) => canAfford(r, inv))
  const locked     = RECIPES.filter((r) => !canAfford(r, inv))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-heading text-sm uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <span className="text-xs text-muted-foreground">{affordable.length} craftable</span>
      </div>

      <IngredientBar inv={inv} />

      {affordable.length > 0 && (
        <div className="space-y-1.5">
          {affordable.map((r) => (
            <div key={r.id} className="rounded-md border border-border bg-secondary/10 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.desc}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <CostDisplay cost={r.cost} />
                    <span className="text-xs text-muted-foreground/70">· {r.timing}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="flex-shrink-0 text-xs"
                  variant="secondary"
                  disabled={!isRecipeTimingOpen(r, phase)}
                  onClick={() => onUseRecipe?.(r.id)}
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
            {locked.map((r) => (
              <div key={r.id} className="rounded-md border border-border/50 px-3 py-2 opacity-50">
                <p className="text-xs font-medium">{r.name}</p>
                <CostDisplay cost={r.cost} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

interface Props {
  invA: Inventory
  invB: Inventory
  labelA: string
  labelB: string
  phase?: MatchFlowPhase
  onUseRecipe?: (player: string, recipeId: number) => void
}

export function RecipePanel({ invA, invB, labelA, labelB, phase, onUseRecipe }: Props) {
  return (
    <div className="space-y-6">
      <RecipeList inv={invA} label={labelA} phase={phase} onUseRecipe={(recipeId) => onUseRecipe?.(labelA, recipeId)} />
      <Separator />
      <RecipeList inv={invB} label={labelB} phase={phase} onUseRecipe={(recipeId) => onUseRecipe?.(labelB, recipeId)} />
    </div>
  )
}
