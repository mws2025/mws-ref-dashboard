import { cn } from "@/lib/utils"
import Image from "next/image"
import { Heading } from "@/components/ui/heading"

type EmptyStateProps = {
  title: string
  description?: string
  src?: string
  alt?: string
  className?: string
  children?: React.ReactNode
}

export function EmptyState({
  title,
  description,
  src,
  alt = "",
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-16 text-center",
        className
      )}
    >
      {src && (
        <Image
          src={src}
          alt={alt}
          width={256}
          height={256}
          className="h-32 w-auto opacity-90"
        />
      )}
      <Heading as="h2" size="sub" className="text-espresso">
        {title}
      </Heading>
      {description && (
        <p className="text-muted-foreground max-w-md text-base">{description}</p>
      )}
      {children}
    </div>
  )
}
