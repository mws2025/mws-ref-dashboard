import Image from "next/image"
import Link from "next/link"
import { type MappoolMap } from "@/server/data/mappools"
import { tagSrc, TAG_BODY_HEIGHT } from "./mod-brackets"

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

export function MapCard({ map }: { map: MappoolMap }) {
  const href = `https://osu.ppy.sh/b/${map.beatmapId}`
  const thumbnail = map.listUrl ?? map.coverUrl

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group focus-visible:ring-ring/50 bg-vanilla relative block overflow-hidden rounded-[11px] p-[8px] focus-visible:ring-3 focus-visible:outline-none"
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
          {map.slot}
        </span>
      </div>

      {/* The image is a direct child of this row, not of the padded text
          column, so it can stretch edge to edge. `overflow-hidden` clips it to
          the container's radius — the image itself has none. */}
      <div className="relative flex min-h-30 gap-3 overflow-hidden rounded-[11px] border-2 border-dashed border-[#312525] p-4 sm:gap-5">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Map title, artist, and line divider at bottom */}
          <div className="border-bean ml-14 border-b border-dashed pb-1.5 sm:ml-26">
            <span className="block truncate text-xl leading-snug font-semibold">
              {map.title}
            </span>
            <span className="block truncate text-xs">{map.artist}</span>
          </div>

          {/* difficulty, mapper, sr, bpm, id */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-6 text-xs sm:pt-10">
            <div className="flex min-w-0 flex-col">
              <div className="flex">
                <div className="w-16 font-bold">Difficulty</div>
                <div className="truncate">[{map.difficulty}]</div>
              </div>

              {map.mapper && (
                <div className="flex">
                  <div className="w-16 font-bold">Mapper</div>
                  <div className="truncate">{map.mapper}</div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 gap-x-4">
              <Stat label="SR" value={fmt(map.starRating, 2)} />
              <Stat label="BPM" value={fmt(map.bpm, 0)} />
              <Stat label="ID" value={String(map.beatmapId)} />
            </div>
          </div>
        </div>

        {/* Beatmap Image */}
        {thumbnail && (
          <div className="relative w-20 shrink-0 sm:w-36 lg:w-48">
            <Image
              src={thumbnail}
              alt=""
              fill
              sizes="(min-width: 1024px) 192px, (min-width: 640px) 144px, 80px"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              loading="eager"
              draggable={false}
            />
          </div>
        )}
      </div>
    </Link>
  )
}
