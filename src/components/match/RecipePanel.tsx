import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { INGREDIENTS } from "@/data/constants"
import { RECIPES } from "@/data/recipes"
import { canAfford } from "@/lib/mappool"
import type { IngKey, Inventory } from "@/types"

function CostDisplay({ cost }: { cost: Partial<Inventory> }) {
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {(Object.entries(cost) as [IngKey, number][]).map(([k, n]) => {
        const ing = INGREDIENTS.find((i) => i.key === k)!
        return (
          <span key={k} className="flex items-center gap-0.5 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ing.hex }} />
            {ing.name}×{n}
          </span>
        )
      })}
    </span>
  )
}

function IngredientBar({ inv }: { inv: Inventory }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
      {INGREDIENTS.map(({ key, name, hex }) => (
        <div key={key} className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: hex }} />
          <span className="text-xs text-muted-foreground">{name}</span>
          <span className="text-xs font-semibold tabular-nums" style={{ color: hex }}>×{inv[key]}</span>
        </div>
      ))}
    </div>
  )
}

function RecipeList({ inv, label }: { inv: Inventory; label: string }) {
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
                <Button size="sm" className="flex-shrink-0 text-xs" variant="secondary">Use</Button>
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
}

export function RecipePanel({ invA, invB, labelA, labelB }: Props) {
  return (
    <div className="space-y-6">
      <RecipeList inv={invA} label={labelA} />
      <Separator />
      <RecipeList inv={invB} label={labelB} />
    </div>
  )
}
