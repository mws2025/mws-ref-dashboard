import Link from "next/link"
import { cn } from "@/lib/utils"

export type StageTab = {
  /** Stable identifier, compared against `activeTab`. */
  id: string
  /** Button text, e.g. "Round of 32". */
  label: string
  /** URL segment appended to `basePath`. */
  slug: string
}

type StageTabsProps = {
  tabs: StageTab[]
  activeTab: string
  /** e.g. "/mappools" or "/schedule". */
  basePath: string
  label: string
}

/**
 * Round/stage switcher shared by the mappool and schedule pages.
 *
 * Plain links to prerendered routes rather than client-side tabs — each round
 * gets a shareable URL, and the page ships no JS for this.
 */
export function StageTabs({ tabs, activeTab, basePath, label }: StageTabsProps) {
  return (
    <nav aria-label={label} className="w-full">
      <ul className="flex flex-wrap justify-center gap-2">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <li key={tab.id}>
              <Link
                href={`${basePath}/${tab.slug}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 block rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:outline-none",
                  isActive
                    ? "bg-foam border-foam text-espresso"
                    : "border-caramel text-caramel hover:bg-caramel/10"
                )}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
