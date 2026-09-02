import Link from "next/link"
import { cn } from "@/lib/utils"
import type { MappoolStage } from "@/server/data/schemas"

type StageNavProps = {
  stages: MappoolStage[]
  activeTab: string
}

/**
 * Stage switcher. Plain links to prerendered routes rather than client-side
 * tabs — each pool gets a shareable URL, and the page ships no JS.
 */
export function StageNav({ stages, activeTab }: StageNavProps) {
  return (
    <nav aria-label="Mappool stage" className="w-full">
      <ul className="flex flex-wrap justify-center gap-2">
        {stages.map((stage) => {
          const isActive = stage.tab === activeTab
          return (
            <li key={stage.tab}>
              <Link
                href={`/mappools/${stage.tab.toLowerCase()}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 block rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:outline-none",
                  isActive
                    ? "bg-foam border-foam text-espresso"
                    : "border-caramel text-caramel hover:bg-caramel/10"
                )}
              >
                {stage.name}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
