import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getSchedule, getScheduleRound } from "@/server/data"
import { ScheduleView } from "../components/ScheduleView"

type StageParams = { params: Promise<{ stage: string }> }

/** One prerendered route per round that has matches. */
export async function generateStaticParams() {
  try {
    const { rounds } = await getSchedule()
    return rounds.map((round) => ({ stage: round.slug }))
  } catch (err) {
    console.error("Error listing schedule rounds:", err)
    return []
  }
}

async function findRound(slug: string) {
  try {
    return await getScheduleRound(slug)
  } catch (err) {
    console.error("Error getting schedule:", err)
    return null
  }
}

export async function generateMetadata({
  params,
}: StageParams): Promise<Metadata> {
  const found = await findRound((await params).stage)
  if (!found) return { title: "Schedule" }
  return {
    title: `${found.round.stage} Schedule`,
    description: `${found.round.stage} matches for Monodramatic World Series.`,
  }
}

export default async function ScheduleRoundPage({ params }: StageParams) {
  const found = await findRound((await params).stage)
  if (!found) notFound()
  return (
    <ScheduleView
      rounds={found.schedule.rounds}
      round={found.round}
      matches={found.matches}
    />
  )
}
