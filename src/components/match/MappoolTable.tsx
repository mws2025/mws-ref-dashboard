import { Badge } from "@/components/ui/badge"
import { POOL_CONFIG } from "@/data/constants"
import { MAPPOOL } from "@/data/mock"
import { rowStyle } from "@/lib/mappool"
import type { PoolMap } from "@/types"

function statusBadge(map: PoolMap): React.ReactNode {
  if (map.status === "banned")      return <span className="text-xs text-muted-foreground line-through">Banned · {map.bannedBy}</span>
  if (map.status === "in-progress") return <span className="text-xs font-semibold text-primary">In Progress</span>
  if (map.status === "completed")   return <span className="text-xs text-muted-foreground">Won by {map.winner}</span>
  if (map.status === "picked")      return <span className="text-xs text-muted-foreground">Picked · {map.pickedBy}</span>
  return null
}

export function MappoolTable() {
  const played = MAPPOOL.filter((m) => m.status === "completed").length
  const banned = MAPPOOL.filter((m) => m.status === "banned").length

  return (
    <main className="flex flex-col overflow-hidden" style={{ width: "45%", flexShrink: 0 }}>
      {/* Toolbar */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-card/40 px-4 py-2">
        <span className="font-heading text-xs uppercase tracking-[0.16em] text-muted-foreground">Mappool</span>
        <Badge variant="outline" className="text-xs">Picks / Bans</Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {played} played · {banned} banned
        </span>
      </div>

      {/* Map rows */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card/90 backdrop-blur-sm">
            <tr className="border-b border-border">
              <th className="w-14 px-3 py-2 text-left font-heading text-xs uppercase tracking-[0.16em] text-muted-foreground">Slot</th>
              <th className="px-3 py-2 text-left font-heading text-xs uppercase tracking-[0.16em] text-muted-foreground">Map</th>
              <th className="w-48 px-3 py-2 text-left font-heading text-xs uppercase tracking-[0.16em] text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {MAPPOOL.map((map) => (
              <tr
                key={map.slot}
                style={rowStyle(map)}
                className="border-b border-border/40 transition-opacity"
              >
                <td className="px-3 py-2.5">
                  <span className="font-heading text-sm font-bold" style={{ color: POOL_CONFIG[map.pool].hex }}>
                    {map.slot}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={map.status === "banned" ? "line-through" : ""}>{map.map}</span>
                </td>
                <td className="px-3 py-2.5">{statusBadge(map)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
