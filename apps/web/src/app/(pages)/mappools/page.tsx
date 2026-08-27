import type { Metadata } from "next"
import { EmptyState } from "@/components/EmptyState"
import { getMappools } from "@/server/data"
import { MappoolView } from "./components/MappoolView"

export const metadata: Metadata = {
  title: "Mappool",
  description: "Mappools for Monodramatic World Series.",
}

/** No pool published yet — every stage is gated behind Settings!Publish Pool. */
function NoPools() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <EmptyState
        src="/PieSketch.png"
        alt=""
        title="Coming soon"
        description="The mappool isn't ready to serve yet. Check back soon."
      />
    </main>
  )
}

export default async function Mappools() {
  let stages: Awaited<ReturnType<typeof getMappools>> = []
  try {
    stages = await getMappools()
  } catch (err) {
    // Sheet/credential failure. Render the empty state rather than a 500 —
    // unlike staff/players there is no mock pool to fall back to.
    console.error("Error getting mappools:", err)
  }

  if (stages.length === 0) return <NoPools />

  // Latest published stage is the useful default (the sheet lists stages in
  // bracket order, so the last published one is the most recent).
  return <MappoolView stages={stages} stage={stages[stages.length - 1]} />
}
