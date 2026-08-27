import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getMappools } from "@/server/data"
import { MappoolView } from "../components/MappoolView"

type StageParams = { params: Promise<{ stage: string }> }

/**
 * Prerender one route per published stage. An unpublished stage has no entry
 * here and `dynamicParams` is left at its default, so a request for it falls
 * through to the lookup below and 404s.
 */
export async function generateStaticParams() {
  try {
    const stages = await getMappools()
    return stages.map((stage) => ({
      stage: stage.tab.toLowerCase(),
    }))
  } catch (err) {
    console.error("Error listing mappool stages:", err)
    return []
  }
}

async function findStage(tab: string) {
  try {
    const stages = await getMappools()
    const wanted = tab.toUpperCase()
    const stage = stages.find((s) => s.tab.toUpperCase() === wanted)
    return stage ? { stages, stage } : null
  } catch (err) {
    console.error("Error getting mappools:", err)
    return null
  }
}

export async function generateMetadata({
  params,
}: StageParams): Promise<Metadata> {
  const found = await findStage((await params).stage)
  if (!found) return { title: "Mappool" }
  return {
    title: `${found.stage.name} Mappool`,
    description: `The ${found.stage.name} mappool for Monodramatic World Series.`,
  }
}

export default async function MappoolStagePage({ params }: StageParams) {
  const found = await findStage((await params).stage)
  if (!found) notFound()
  return <MappoolView stages={found.stages} stage={found.stage} />
}
