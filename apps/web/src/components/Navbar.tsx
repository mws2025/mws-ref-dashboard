import { cn } from "@/lib/utils"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu"
import { ButtonLink } from "@/components/ui/button"
import Link from "next/link"
import Image from "next/image"

type NavbarProps = {
  className?: string
}

export const navigationLinks = [
  { href: "/about", label: "About" },
  { href: "/staff", label: "Staff" },
  { href: "/players", label: "Players" },
  { href: "/gimmick", label: "Gimmick" },
  { href: "/mappool", label: "Mappool" },
  { href: "/schedule", label: "Schedule" },
]

export function Navbar({ className }: NavbarProps) {
  return (
    <div
      className={cn(
        "bg-caramel z-1 flex h-16 w-full items-center justify-between px-4 py-8 sm:px-6 lg:px-8",
        className
      )}
    >
      {/* logo */}
      <Link href="/">
        <Image
          src="/logo-light.png"
          alt="Whisked Logo"
          width={4096}
          height={1051}
          className="h-11 w-auto"
        />
      </Link>

      {/* links */}
      <div className="flex items-center justify-between gap-x-6">
        <NavigationMenu className="text-cream">
          <NavigationMenuList>
            {navigationLinks.map(({ href, label }) => (
              <NavigationMenuItem
                key={href}
                className="hover:text-espresso/50 transition-colors"
              >
                <NavigationMenuLink href={href}>{label}</NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        {/* ref button - conditionally visible for logged-in referees */}
        <ButtonLink href="#">Referee Portal</ButtonLink>
      </div>
    </div>
  )
}
