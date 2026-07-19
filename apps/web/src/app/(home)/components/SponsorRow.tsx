import Image from "next/image"
import { cn } from "@/lib/utils"
import { Heading } from "@/components/ui/heading"
import { ButtonLink } from "@/components/ui/button"

type SponsorRowProps = {
  src: string
  alt: string
  title: string
  description: string
  href: string
  buttonLabel?: string
  /** When true, image sits on the right and content on the left (desktop). */
  reverse?: boolean
  className?: string
}

export function SponsorRow({
  src,
  alt,
  title,
  description,
  href,
  buttonLabel = "Visit site",
  reverse = false,
  className,
}: SponsorRowProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-x-12",
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        width={1920}
        height={1080}
        className={cn(
          "aspect-video w-full rounded-xl object-cover",
          reverse && "lg:order-2"
        )}
      />
      <div className={cn(reverse && "lg:order-1")}>
        <Heading as="h3" size="section">
          {title}
        </Heading>
        <p className="text-cream/80 mt-3 text-lg">{description}</p>
        <ButtonLink
          href={href}
          size="lg"
          variant="blank"
          className="bg-strawberry text-cream hover:bg-strawberry/80 mt-6 px-6"
        >
          {buttonLabel}
        </ButtonLink>
      </div>
    </div>
  )
}
