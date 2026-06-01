import { cn } from "@/lib/utils"
import Image from "next/image"
import { Heading } from "@/components/ui/heading"

type InfoCardProps = {
  src: string
  alt: string
  width: number
  height: number
  title: string
  children: React.ReactNode
  className?: string
}

export function InfoCard({
  src,
  alt,
  width,
  height,
  title,
  children,
  className,
}: InfoCardProps) {
  return (
    <div
      className={cn(
        "bg-vanilla flex flex-col items-center rounded-xl p-6 text-center text-xl",
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="mb-6 h-18 w-auto"
      />
      <Heading as="h3" size="sub">
        {title}
      </Heading>
      <p className="text-muted-foreground mt-2 text-base">{children}</p>
    </div>
  )
}
