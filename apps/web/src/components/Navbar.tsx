import { cn } from "@/lib/utils"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu"
import Link from "next/link"
import Image from "next/image"
import { navigationLinks, externalLinks } from "./nav-links"
import { MobileNav } from "./MobileNav"

type NavbarProps = {
  className?: string
}

export function Navbar({ className }: NavbarProps) {
  return (
    <header
      className={cn(
        "bg-caramel font-domus relative z-50 flex h-16 w-full items-center justify-between px-4 py-8 sm:px-6 lg:px-8",
        className
      )}
    >
      {/* logo */}
      <Link href="/" className="transition-opacity hover:opacity-80">
        <Image
          src="/logo-light.webp"
          alt="Whisked Logo"
          width={4096}
          height={1051}
          className="h-11 w-auto"
          loading="eager"
        />
      </Link>

      {/* mobile: dropdown menu */}
      <MobileNav />

      {/* desktop: inline links */}
      <div className="hidden items-center justify-between gap-x-6 md:flex">
        <NavigationMenu className="text-cream">
          <NavigationMenuList>
            {navigationLinks.map(({ href, label }) => (
              <NavigationMenuItem key={href}>
                <NavigationMenuLink
                  href={href}
                  className="text-cream hover:text-strawberry pt-1 hover:opacity-100"
                >
                  {label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        {/* external links (osu!, Challonge, Sheets, Twitch) */}
        <div className="flex items-center gap-1">
          {externalLinks.map(({ href, label, icon }) => (
            <Link
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="focus-visible:ring-ring/50 flex size-9 items-center justify-center rounded-full transition-transform duration-150 hover:scale-110 hover:opacity-80 focus-visible:ring-3 focus-visible:outline-none"
            >
              <Image
                src={icon}
                alt=""
                width={48}
                height={48}
                className="size-12 h-auto w-auto"
                loading="eager"
              />
            </Link>
          ))}
        </div>
      </div>
    </header>
  )
}
