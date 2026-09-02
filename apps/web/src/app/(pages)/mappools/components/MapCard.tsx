import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { type MappoolMap } from "@/server/data/mappools"
import { tagSrc, TAG_BODY_HEIGHT } from "./mod-brackets"
import { CopyId } from "./CopyId"

/** Stats are already mod-adjusted upstream by the pooling sheet. */
function Stat({ label, value }: { label: string; value: string | null }) {
  if (value == null) return null
  return (
    <div className="flex flex-col items-center leading-tight">
      <span className="text-[0.625rem] tracking-wide uppercase">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  )
}

const fmt = (n: number | null, digits = 1): string | null =>
  n == null ? null : n.toFixed(digits)

/**
 * Palettes for the two card treatments. Tournament-made maps get the dark
 * one so they stand out in a pool of otherwise identical cards.
 *
 * The light values are the card's originals — `chocolate` is the token for the
 * #312525 that used to be hard-coded on the frame.
 */
const CARD_THEME = {
  light: {
    shell: "bg-vanilla",
    frame: "border-chocolate",
    divider: "border-bean",
    placeholder: "bg-bean/15",
  },
  dark: {
    shell: "bg-toasted text-cream",
    frame: "border-foam",
    divider: "border-foam/40",
    placeholder: "bg-cream/10",
  },
} as const

/**
 * Badges naming why a card is dark. Both can apply to the same map.
 *
 * Only ever rendered on the dark shell, so both are keyed to `foam` — the
 * warmer `toffee` reads as brand-correct but lands around 3:1 against
 * `toasted`, too low for 10px type. Solid vs outline separates the two
 * instead of colour.
 */
const BADGE_BASE =
  "shrink-0 rounded-full border px-2 py-px pb-0 text-[0.625rem] font-semibold tracking-wide uppercase"

function CustomBadges({ map }: { map: MappoolMap }) {
  return (
    <>
      {map.isCustomSong && (
        <span className={cn(BADGE_BASE, "bg-foam border-foam text-espresso")}>
          Original
        </span>
      )}
      {map.isCustomMap && (
        <span className={cn(BADGE_BASE, "border-foam text-foam")}>Custom</span>
      )}
    </>
  )
}

export function MapCard({ map }: { map: MappoolMap }) {
  const href = `https://osu.ppy.sh/b/${map.beatmapId}`
  const thumbnail = map.listUrl ?? map.coverUrl
  // Either flag means the map was made for this tournament.
  const isCustom = map.isCustomMap || map.isCustomSong
  const theme = CARD_THEME[isCustom ? "dark" : "light"]

  return (
    // Not a link any more: the only navigation is the cover art, so the id
    // below can be a copy button without nesting a control inside an anchor.
    <article
      className={cn(
        "relative overflow-hidden rounded-[11px] p-[8px]",
        theme.shell
      )}
    >
      {/* Bookmark tag: hangs from the top edge of the card, inset from the
          left. The slot label is centred on the tag's solid body rather than
          its full height — see TAG_BODY_HEIGHT.

          The tag shrinks on mobile (60px vs 90px) so the title keeps a usable
          width beside it. Its width is coupled to two things below: the
          title's `ml-*` (must clear the tag horizontally) and the meta row's
          `pt-*` (must clear it vertically). Change one, check the other two. */}
      <div className="pointer-events-none absolute top-0 left-3 z-10 w-[60px] sm:left-6 sm:w-[90px]">
        <Image
          src={tagSrc(map.bracket)}
          alt=""
          width={90}
          height={100}
          className="h-auto w-full"
          loading="eager"
          draggable={false}
        />
        <span
          className="text-cream absolute inset-x-0 top-0 flex items-center justify-center text-lg leading-none font-semibold tracking-wide sm:text-2xl"
          style={{ height: TAG_BODY_HEIGHT }}
        >
          {/* Marks a tournament-made map on the tag itself, so the pool reads
              at a glance without relying on the card's colour. Hidden from
              assistive tech — the badge beside the artist already names it,
              and this would otherwise be read out as its Unicode name. */}
          {isCustom && (
            <span aria-hidden="true" className="mr-0.5 text-sm sm:text-lg">
              ✢
            </span>
          )}
          {map.slot}
        </span>
      </div>

      {/* The image is a direct child of this row, not of the padded text
          column, so it can stretch edge to edge. `overflow-hidden` clips it to
          the container's radius — the image itself has none. */}
      <div
        className={cn(
          "relative flex min-h-30 gap-3 overflow-hidden rounded-[11px] border-2 border-dashed p-4 sm:gap-5",
          theme.frame
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Map title, artist, and line divider at bottom */}
          <div
            className={cn(
              "ml-14 border-b border-dashed pb-1.5 sm:ml-26",
              theme.divider
            )}
          >
            <span className="block truncate text-xl leading-snug font-semibold">
              {map.title}
            </span>
            {/* Artist keeps the whole line when there is no badge, and yields
                only as much as the badges need when there is one. */}
            <div className="flex items-center gap-2 text-xs">
              <span className="min-w-0 truncate">{map.artist}</span>
              {isCustom && <CustomBadges map={map} />}
            </div>
          </div>

          {/* difficulty, mapper, sr, bpm, id */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-6 text-xs sm:pt-10">
            {/* Difficulty and mapper names run arbitrarily long, so both
                values ellipsis rather than pushing the stats out of the card.
                `truncate` only bites once every box in the chain can shrink:
                `min-w-0` on each flex parent (a flex item's default
                `min-width: auto` floors it at its content width), `shrink-0`
                on the labels so a long value eats the value box and not
                "Difficulty". */}
            {/* No `flex-1` here on purpose: the column keeps a content-sized
                flex basis, so an over-long pair still wraps below the stats
                on narrow cards (as it did before) and only then truncates —
                `flex-1` would let it shrink to a sliver beside the stats
                instead of wrapping. */}
            <div className="flex max-w-43 min-w-0 flex-col">
              <div className="flex min-w-0">
                <div className="w-16 shrink-0 font-bold">Difficulty</div>
                <div className="min-w-0 flex-1 truncate">
                  [{map.difficulty}]
                </div>
              </div>

              {map.mapper && (
                <div className="flex min-w-0">
                  <div className="w-16 shrink-0 font-bold">Mapper</div>
                  <div className="min-w-0 flex-1 truncate">{map.mapper}</div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-start gap-x-4">
              <Stat label="SR" value={fmt(map.starRating, 2)} />
              <Stat label="BPM" value={fmt(map.bpm, 0)} />
              <CopyId id={map.beatmapId} />
            </div>
          </div>
        </div>

        {/* Beatmap Image — the card's only link.

            `group` lives here rather than on the card so the zoom answers a
            hover on the art itself, which is now the thing that is clickable.
            The link renders even when enrichment produced no cover, otherwise
            a map with a failed osu! lookup would have no way through to osu!
            at all. */}
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${map.artist} - ${map.title} on osu!`}
          className={cn(
            "group focus-visible:ring-ring/50 relative w-20 shrink-0 overflow-hidden focus-visible:ring-3 focus-visible:outline-none sm:w-36 lg:w-48",
            !thumbnail && theme.placeholder
          )}
        >
          {thumbnail ? (
            <Image
              src={thumbnail}
              alt=""
              fill
              sizes="(min-width: 1024px) 192px, (min-width: 640px) 144px, 80px"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              loading="eager"
              draggable={false}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-[0.625rem] tracking-wide uppercase opacity-70">
              View on osu!
            </span>
          )}
        </Link>
      </div>
    </article>
  )
}
