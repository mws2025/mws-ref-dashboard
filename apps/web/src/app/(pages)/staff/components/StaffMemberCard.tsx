import { cn } from "@/lib/utils"
import Image from "next/image"
import Link from "next/link"
import { getCountryFlag, type CountryCodeIsoAlpha2 } from "@mws/utils"
import type { StaffMember } from "../types"
import { Heading } from "@/components/ui/heading"

type MemberCardProps = StaffMember & { className?: string }

export function MemberCard({
  id,
  username,
  countryCode,
  roles,
  timezone,
  pronouns,
  customLink,
  className,
}: MemberCardProps) {
  const profileUrl = customLink ?? `https://osu.ppy.sh/users/${id}`
  const avatarUrl = `https://a.ppy.sh/${id}`

  return (
    <div
      className={cn(
        "flex w-[calc(50%-0.5rem)] shrink-0 grow-0 flex-col gap-2 text-center sm:w-41.25",
        className
      )}
    >
      <Link
        href={profileUrl}
        className="relative block aspect-square w-full overflow-hidden"
      >
        {/* blurred, scaled-up copy of the avatar; only the outer 2px of it
            stays visible past the body-colored layer above it, reading as
            a border tinted to the avatar */}
        <Image
          src={avatarUrl}
          alt=""
          aria-hidden
          width={256}
          height={256}
          className="scale-300 object-cover blur-md"
        />
        {/* covers everything but that 2px ring, so the blur reads as a
            border rather than bleeding under the padding */}
        <div className="bg-background absolute inset-0.5" />
        <div className="absolute inset-2 overflow-hidden">
          <Image
            src={avatarUrl}
            alt={`${username}'s profile picture`}
            width={256}
            height={256}
            className="object-cover"
          />
        </div>
      </Link>
      <div className="flex items-center justify-center gap-1.5">
        <Image
          src={getCountryFlag(countryCode as CountryCodeIsoAlpha2)}
          alt={`${countryCode} flag`}
          width={20}
          height={14}
          className="h-3.5 w-5 shrink-0 rounded-xs object-cover"
        />
        <Heading
          as="h3"
          className="text-[13px]/snug font-semibold sm:text-sm/snug"
        >
          {username}
        </Heading>
      </div>

      <p className="text-muted-foreground text-sm">
        {pronouns} <span>{timezone ? `· ${timezone}` : null}</span>
      </p>
      <ul className="flex flex-wrap justify-center gap-1">
        {roles.map((role) => (
          <li
            key={role}
            className="bg-foam text-espresso rounded px-1.5 py-0.5 text-[11px]/tight font-medium"
          >
            {role}
          </li>
        ))}
      </ul>
    </div>
  )
}
