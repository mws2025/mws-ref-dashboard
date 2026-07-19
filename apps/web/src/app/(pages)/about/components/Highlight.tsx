import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const highlightVariants = cva("font-semibold", {
  variants: {
    color: {
      strawberry: "text-strawberry",
      cherry: "text-cherry",
      sage: "text-sage",
      caramel: "text-caramel",
    },
  },
  defaultVariants: {
    color: "strawberry",
  },
})

type HighlightProps = VariantProps<typeof highlightVariants> & {
  className?: string
  children: React.ReactNode
}

export function Highlight({ color, className, children }: HighlightProps) {
  return (
    <span className={cn(highlightVariants({ color }), className)}>
      {children}
    </span>
  )
}
