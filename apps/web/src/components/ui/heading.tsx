import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const headingVariants = cva("text-balance", {
  variants: {
    size: {
      display: "text-5xl sm:text-7xl lg:text-8xl",
      hero: "text-4xl sm:text-5xl lg:text-6xl",
      section: "text-3xl sm:text-4xl",
      sub: "text-2xl",
    },
  },
  defaultVariants: {
    size: "section",
  },
})

type HeadingElement = "h1" | "h2" | "h3" | "h4" | "h5" | "h6"

type HeadingProps = React.ComponentProps<"h2"> &
  VariantProps<typeof headingVariants> & {
    as?: HeadingElement
  }

function Heading({ className, size, as: Tag = "h2", ...props }: HeadingProps) {
  return (
    <Tag
      data-slot="heading"
      className={cn(headingVariants({ size, className }))}
      {...props}
    />
  )
}

export { Heading, headingVariants }
