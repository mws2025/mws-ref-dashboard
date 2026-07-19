import { cn } from "@/lib/utils"
import Image from "next/image"
import Link from "next/link"
import { Heading } from "@/components/ui/heading"
import { getCountryFlag, type CountryCodeIsoAlpha2 } from "@mws/utils"

type PlayerCardProps = {
  className?: string
  id: number
  username: string
  countryCode: string
  rank: number | null // live osu! global rank; null until enriched
  pronouns: string | null
}

export function PlayerCard({
  id,
  username,
  countryCode,
  rank,
  pronouns,
  className,
}: PlayerCardProps) {
  return (
    <Link
      className={cn(
        "bg-vanilla hover:bg-foam flex flex-col items-stretch justify-between gap-2 rounded-xl p-4 text-center transition duration-250 ease-out",
        className
      )}
      href={`https://osu.ppy.sh/users/${id}`}
    >
      <div>
        <Heading as="h3" className="text-xl sm:text-xl">
          {username}
        </Heading>
      </div>
      <Image
        src={`https://a.ppy.sh/${id}`}
        alt={`${username}'s osu! profile picture`}
        width={256}
        height={256}
        className="w-full rounded-xl object-cover"
      />
      <div className="flex flex-row items-center justify-between gap-4">
        <Image
          src={getCountryFlag(countryCode as CountryCodeIsoAlpha2)}
          alt={`${countryCode} flag`}
          width={20}
          height={14}
          className="h-3.5 w-5 shrink-0 rounded-xs object-cover"
        />
        <span>{rank != null ? `#${rank.toLocaleString()}` : "—"}</span>
      </div>
      <span className="text-bean">{pronouns ? pronouns : "\u00A0"}</span>
    </Link>
  )
}
