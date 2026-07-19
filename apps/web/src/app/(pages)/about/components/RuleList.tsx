import * as React from "react"
import { cn } from "@/lib/utils"

export type RuleItem =
  | string
  | React.ReactElement
  | { text: React.ReactNode; children?: RuleItem[] }

const BULLET_STYLES = ["list-disc", "list-[circle]", "list-[square]"]

function normalize(item: RuleItem): {
  text: React.ReactNode
  children?: RuleItem[]
} {
  if (typeof item === "string" || React.isValidElement(item)) {
    return { text: item }
  }
  return item
}

export function RuleList({
  items,
  depth = 0,
}: {
  items: RuleItem[]
  depth?: number
}) {
  return (
    <ul
      className={cn(
        "space-y-1.5 pl-5",
        BULLET_STYLES[depth % BULLET_STYLES.length],
        depth > 0 && "mt-1.5"
      )}
    >
      {items.map((item, i) => {
        const { text, children } = normalize(item)
        return (
          <li key={i} className="text-espresso marker:espresso">
            {text}
            {children && children.length > 0 && (
              <RuleList items={children} depth={depth + 1} />
            )}
          </li>
        )
      })}
    </ul>
  )
}
