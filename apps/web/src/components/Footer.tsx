import { cn } from "@/lib/utils"
import Link from "next/link"
import Image from "next/image"
import { externalLinks } from "./nav-links"
import { Heading } from "./ui/heading"

type FooterProps = {
  className?: string
}

function getCopyrightYear() {
  return new Date().getFullYear()
}

export function Footer({ className }: FooterProps) {
  return (
    <footer>
      <div
        className={cn(
          "bg-foam text-espresso flex flex-col items-stretch justify-between gap-y-10 px-6 py-12 text-base sm:flex-row sm:gap-x-16 sm:gap-y-0",
          className
        )}
      >
        <div className="flex max-w-150 flex-col justify-between gap-y-6 text-lg">
          <Heading as="h3" size="sub">
            Let&apos;s bake something unforgettable together!
          </Heading>
          <Link
            href="/"
            className="w-[90%] transition-opacity hover:opacity-80"
          >
            <Image
              className="w-full"
              src="/logo-dark.webp"
              alt="whisked logo"
              width={4096}
              height={1051}
            />
          </Link>
        </div>

        <div className="order-first flex max-w-100 flex-col items-start gap-y-6 sm:order-none sm:items-end">
          <div className="flex gap-x-2">
            {externalLinks.map(({ href, label, iconDark }) => (
              <Link
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="focus-visible:ring-ring/50 flex size-14 items-center justify-center rounded-full transition-transform duration-150 hover:scale-110 hover:opacity-80 focus-visible:ring-3 focus-visible:outline-none"
              >
                <Image
                  src={iconDark}
                  alt=""
                  width={74}
                  height={74}
                  className="size-18.5 h-auto w-auto"
                />
              </Link>
            ))}
          </div>
          <Image
            className="hidden w-[80%] rotate-y-180 sm:-mb-30 sm:block"
            src="/CaeliaSketch.webp"
            alt=""
            width={887}
            height={735}
          />
        </div>
      </div>
      <p className="bg-toasted text-cream flex h-20 items-center justify-between px-4 text-lg">
        © {getCopyrightYear()} Monodramatic World Series
      </p>
    </footer>
  )
}
