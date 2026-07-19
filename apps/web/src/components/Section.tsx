import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const sectionVariants = cva("w-full", {
  variants: {
    background: {
      cream: "bg-cream",
      foam: "bg-foam",
      chocolate: "bg-chocolate",
      transparent: "",
    },
    spacing: {
      none: "py-0",
      sm: "py-4",
      md: "py-8",
      lg: "pt-16 pb-30",
      xl: "py-24 pb-30",
    },
  },
  defaultVariants: {
    background: "cream",
    spacing: "lg",
  },
})

type SectionProps = VariantProps<typeof sectionVariants> & {
  className?: string
  children: React.ReactNode
}

export function Section({
  background,
  spacing,
  className,
  children,
}: SectionProps) {
  return (
    <div className={cn(sectionVariants({ background, spacing }), className)}>
      {children}
    </div>
  )
}
