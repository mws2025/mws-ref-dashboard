import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const containerVariants = cva("mx-auto w-full", {
  variants: {
    size: {
      sm: "max-w-3xl px-4",
      md: "max-w-5xl px-6",
      lg: "max-w-7xl px-8",
      full: "max-w-none px-0",
    },
  },
  defaultVariants: {
    size: "lg",
  },
})

type ContainerProps = VariantProps<typeof containerVariants> & {
  className?: string
  children: React.ReactNode
}

export function Container({ size, className, children }: ContainerProps) {
  return (
    <div className={cn(containerVariants({ size }), className)}>{children}</div>
  )
}
