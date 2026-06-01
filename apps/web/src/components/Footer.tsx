import { cn } from "@/lib/utils"
import Link from "next/link"
import Image from "next/image"
import { navigationLinks } from "./Navbar"
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
          "bg-foam text-espresso flex flex-row items-stretch justify-between gap-x-16 px-6 py-12 text-base",
          className
        )}
      >
        <div className="flex max-w-150 flex-col justify-between gap-y-6 text-lg">
          <Heading as="h3" size="sub">
            Let&apos;s bake something unforgettable together!
          </Heading>
          <Link href="/">
            <Image
              className="w-[90%]"
              src="/logo-dark.png"
              alt="whisked logo"
              width={4096}
              height={1051}
            />
          </Link>
        </div>

        <div className="flex max-w-100 flex-col items-end gap-y-6">
          <div className="flex gap-x-6">
            {navigationLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="bg-cream h-8 w-8"
                // className="hover:text-espresso/50 text-lg transition-colors"
              >
                <span className="hidden">{label}</span>
              </Link>
            ))}
          </div>
          <Image
            className="-mb-30 w-[80%] rotate-y-180"
            src="/CaeliaSketch.png"
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
