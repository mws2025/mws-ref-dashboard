import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { MatchPlayer, ScheduleMatch } from "@/server/data/matches"
import { FALLBACK_AVATAR } from "../../staff/staff-icons"

/** Every live match points at the tournament's own channel, not the ref's. */
const TWITCH_URL = "https://www.twitch.tv/mwstournament"

const rankLabel = (rank: number | null): string | null =>
  rank == null ? null : `#${rank.toLocaleString("en-US")}`

/**
 * One side of a match. `align` mirrors the layout so the two players face the
 * scoreline — p1's avatar sits outside-left, p2's outside-right.
 */
function PlayerSide({
  player,
  align,
  won,
}: {
  player: MatchPlayer
  align: "start" | "end"
  won: boolean
}) {
  const rank = rankLabel(player.rank)
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 sm:gap-3",
        align === "end" && "flex-row-reverse"
      )}
    >
      {/* a.ppy.sh serves the avatar straight off the user id, so no API call is
          needed for these. Players missing from the referee sheet's roster tab
          have no id and fall back to osu!'s guest avatar. */}
      <Image
        src={player.osuId ? `https://a.ppy.sh/${player.osuId}` : FALLBACK_AVATAR}
        alt=""
        width={40}
        height={40}
        className="border-bean/30 size-9 shrink-0 rounded-full border object-cover sm:size-10"
        draggable={false}
      />
      <div
        className={cn(
          "flex min-w-0 flex-col leading-tight",
          align === "end" && "items-end text-right"
        )}
      >
        <span
          className={cn(
            "min-w-0 truncate text-sm sm:text-base",
            won ? "font-bold" : "font-medium"
          )}
        >
          {player.name}
        </span>
        {rank && (
          <span className="text-espresso/60 text-[0.6875rem] tabular-nums">
            {rank}
          </span>
        )}
      </div>
    </div>
  )
}

/** Pulsing dot + link to the stream. Only rendered for a live match. */
function LiveButton() {
  return (
    <Link
      href={TWITCH_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-cherry text-cream focus-visible:ring-ring/50 flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[0.6875rem] font-bold tracking-wide uppercase transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:outline-none"
    >
      <span className="relative flex size-2">
        <span className="bg-cream absolute inline-flex size-full animate-ping rounded-full opacity-75" />
        <span className="bg-cream relative inline-flex size-2 rounded-full" />
      </span>
      Live
    </Link>
  )
}

export function MatchCard({ match }: { match: ScheduleMatch }) {
  const isLive = match.status === "live"
  // A forfeit has no numeric score to compare, so neither name is bolded.
  const p1Won =
    match.forfeit === "p2" ||
    (match.status === "complete" &&
      match.p1Score != null &&
      match.p2Score != null &&
      match.p1Score > match.p2Score)
  const p2Won =
    match.forfeit === "p1" ||
    (match.status === "complete" &&
      match.p1Score != null &&
      match.p2Score != null &&
      match.p2Score > match.p1Score)

  // Blank cells read as 0 rather than an empty gap, so every card has a
  // scoreline in the same place. "FF" survives from the sheet as-is.
  const p1Display = match.forfeit === "p1" ? "FF" : (match.p1Score ?? 0)
  const p2Display = match.forfeit === "p2" ? "FF" : (match.p2Score ?? 0)

  return (
    <article className="bg-vanilla relative overflow-hidden rounded-[11px] p-[8px]">
      <div
        className={cn(
          "flex flex-col gap-3 rounded-[11px] border-2 border-dashed p-4 sm:flex-row sm:items-center sm:gap-5",
          isLive ? "border-cherry" : "border-chocolate"
        )}
      >
        {/* When — the sheet stores a bare "(Sun) Sep 28" with no year, so it is
            shown verbatim rather than reformatted into a date that would need
            one guessed. */}
        <div className="flex shrink-0 items-baseline gap-2 sm:w-32 sm:flex-col sm:items-start sm:gap-0">
          <span className="text-espresso/60 text-[0.6875rem] tracking-wide uppercase">
            {match.date.replace(/^\((\w+)\)\s*/, "$1, ")}
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {match.time}
            <span className="text-espresso/50 ml-1 text-[0.625rem] font-normal">
              UTC
            </span>
          </span>
        </div>

        {/* Players + scoreline. The grid keeps the score dead-centre no matter
            how long the two names are; both side columns can shrink. */}
        <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
          <PlayerSide player={match.p1} align="start" won={p1Won} />
          <div className="flex shrink-0 items-center gap-1.5 text-lg font-semibold tabular-nums sm:text-xl">
            <span className={cn(!p1Won && "text-espresso/60")}>
              {p1Display}
            </span>
            <span className="text-espresso/40 text-sm">–</span>
            <span className={cn(!p2Won && "text-espresso/60")}>
              {p2Display}
            </span>
          </div>
          <PlayerSide player={match.p2} align="end" won={p2Won} />
        </div>

        {/* Match id (links to the mp when the lobby exists) + live button. */}
        <div className="flex shrink-0 items-center justify-between gap-2 sm:w-28 sm:justify-end">
          {match.mpUrl ? (
            <Link
              href={match.mpUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Match ${match.matchId} on osu!`}
              className="focus-visible:ring-ring/50 text-caramel rounded-sm text-xs font-semibold tabular-nums underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              #{match.matchId}
            </Link>
          ) : (
            // No lobby yet — the id still identifies the match on the sheet.
            <span className="text-espresso/40 text-xs font-semibold tabular-nums">
              #{match.matchId}
            </span>
          )}
          {isLive && <LiveButton />}
        </div>
      </div>
    </article>
  )
}
