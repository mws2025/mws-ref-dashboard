import { StageTabs } from "@/components/StageTabs"
import type { MappoolStage } from "@/server/data/schemas"

type StageNavProps = {
  stages: MappoolStage[]
  activeTab: string
}

/** Mappool stage switcher — the shared tab strip, keyed by sheet tab name. */
export function StageNav({ stages, activeTab }: StageNavProps) {
  return (
    <StageTabs
      label="Mappool stage"
      basePath="/mappools"
      activeTab={activeTab}
      tabs={stages.map((stage) => ({
        id: stage.tab,
        label: stage.name,
        slug: stage.tab.toLowerCase(),
      }))}
    />
  )
}
