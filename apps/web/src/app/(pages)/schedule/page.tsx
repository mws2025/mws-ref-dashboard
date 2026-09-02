import type { Metadata } from "next"
import { EmptyState } from "@/components/EmptyState"
import { getSchedule } from "@/server/data"

import { ScheduleView } from "./components/ScheduleView"

export const metadata: Metadata = {
  title: "Schedule",
  description: "Match schedule for Monodramatic World Series.",
}

function NoSchedule() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <EmptyState
        src="/BreadSketch.png"
        alt=""
        title="Coming soon"
        description="The schedule is still being plated. Check back soon."
      />
    </main>
  )
}

export default async function Schedule() {
  let schedule: Awaited<ReturnType<typeof getSchedule>> | null = null
  try {
    schedule = await getSchedule()
  } catch (err) {
    // Sheet/credential failure — render the empty state rather than a 500.
    console.error("Error getting schedule:", err)
  }

  if (!schedule || schedule.rounds.length === 0) return <NoSchedule />

  // Land on the round being played: the last one with any match under way or
  // finished. Falls back to the first round before anything has been played.
  const played = new Set(
    schedule.matches.filter((m) => m.status !== "upcoming").map((m) => m.slug)
  )
  const active =
    [...schedule.rounds].reverse().find((r) => played.has(r.slug)) ??
    schedule.rounds[0]

  return (
    <ScheduleView
      rounds={schedule.rounds}
      round={active}
      matches={schedule.matches.filter((m) => m.slug === active.slug)}
    />
  )
}
