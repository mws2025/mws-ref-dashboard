import { INGREDIENTS } from "@/data/constants"
import { MATCH } from "@/data/mock"
import type { Inventory } from "@/types"

function WinBoxes({ score, needed }: { score: number; needed: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: needed }).map((_, i) => (
        <div
          key={i}
          className={`h-3 w-3 rounded-sm border ${i < score ? "border-primary bg-primary" : "border-border bg-transparent"}`}
        />
      ))}
    </div>
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

interface Props {
  invA: Inventory
  invB: Inventory
  round: string
  refName: string
}

export function PlayerColumn({ invA, invB, round, refName }: Props) {
  return (
    <aside className="flex w-52 flex-shrink-0 flex-col gap-0 overflow-y-auto border-r border-border">
      {/* Player A */}
      <div className="space-y-2 border-b border-border p-4">
        <div className="flex items-baseline justify-between">
          <span className="font-heading text-sm font-semibold">{MATCH.playerA}</span>
          <span className="font-heading text-3xl leading-none">{MATCH.scoreA}</span>
        </div>
        <WinBoxes score={MATCH.scoreA} needed={MATCH.winsNeeded} />
        <IngredientBar inv={invA} />
      </div>

      <div className="flex items-center justify-center py-2">
        <span className="font-accent text-sm text-muted-foreground">vs</span>
      </div>

      {/* Player B */}
      <div className="space-y-2 border-b border-border p-4">
        <div className="flex items-baseline justify-between">
          <span className="font-heading text-sm font-semibold">{MATCH.playerB}</span>
          <span className="font-heading text-3xl leading-none">{MATCH.scoreB}</span>
        </div>
        <WinBoxes score={MATCH.scoreB} needed={MATCH.winsNeeded} />
        <IngredientBar inv={invB} />
      </div>

      {/* Match meta */}
      <div className="space-y-1.5 p-4 text-xs text-muted-foreground">
        <p><span className="font-medium text-foreground">Format</span> Bo{MATCH.bestOf}</p>
        <p><span className="font-medium text-foreground">Round</span> {round}</p>
        <p><span className="font-medium text-foreground">Ref</span> {refName}</p>
      </div>

      {/* Pool legend */}
      <div className="border-t border-border p-4">
        <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">Ingredient key</p>
        {INGREDIENTS.map(({ name, pool, hex }) => (
          <div key={name} className="flex items-center gap-2 py-0.5">
            <span className="inline-block h-2 w-2 rounded-sm flex-shrink-0" style={{ backgroundColor: hex }} />
            <span className="text-xs text-muted-foreground">{name} = {pool} win</span>
          </div>
        ))}
      </div>
    </aside>
  )
}
