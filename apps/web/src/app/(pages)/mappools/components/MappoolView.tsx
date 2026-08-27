import Image from "next/image"
import { Section } from "@/components/Section"
import { Container } from "@/components/Container"
import { Heading } from "@/components/ui/heading"
import { ButtonLink } from "@/components/ui/button"
import { groupByBracket } from "@/server/data/mappools"
import type { MappoolStage } from "@/server/data/schemas"
import { StageNav } from "./StageNav"
import { MapCard } from "./MapCard"

type MappoolViewProps = {
  stages: MappoolStage[]
  stage: MappoolStage
}

export function MappoolView({ stages, stage }: MappoolViewProps) {
  const brackets = groupByBracket(stage.maps)

  return (
    <main className="">
      {/* Hero */}
      <Section
        className="relative h-[20vh] bg-[url(/illustration.webp)] bg-cover bg-center"
        spacing="none"
      >
        <div className="bg-grad-cappuccino absolute inset-0 opacity-52"></div>
        <Container className="relative h-full">
          <div className="absolute bottom-0 left-1/2 z-10 w-[90%] -translate-x-1/2 translate-y-1/2 sm:w-[60%]">
            {/* heading island */}
            <div className="border-cream relative z-10 w-full flex-col items-stretch justify-between rounded-2xl border-t-2 border-r-2 border-l-2 p-3">
              <div className="bg-cream flex items-center justify-center gap-4 rounded-2xl px-6 py-6">
                <Heading
                  as="h1"
                  size="hero"
                  className="text-espresso text-center"
                >
                  {stage.name}
                </Heading>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="flex flex-col gap-8 px-4 sm:px-8">
          {stages.length > 1 && (
            <StageNav stages={stages} activeTab={stage.tab} />
          )}

          {/* Mappack + Statistics. Both come from the Settings tab; either
              is hidden when the sheet has no link for it, and the whole row
              disappears when neither does. `justify-between` puts Mappack
              left and Statistics right — with only one, it stays on its own
              side rather than centring. */}
          {(stage.mappackUrl || stage.statsUrl) && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {stage.mappackUrl ? (
                // `default` variant is already bg-foam / text-espresso.
                // data-icon lets the button's own `has-data-[icon=...]` rule
                // tighten the left padding for the icon.
                <ButtonLink href={stage.mappackUrl}>
                  <Image
                    src="/icon-mappack.svg"
                    alt=""
                    width={22}
                    height={22}
                    data-icon="inline-start"
                    className="size-5"
                    loading="eager"
                    draggable={false}
                  />
                  Download Mappack
                </ButtonLink>
              ) : (
                // Holds the left slot so Statistics stays right. Only needed
                // once the row is horizontal.
                <span className="hidden sm:block" />
              )}
              {stage.statsUrl && (
                <ButtonLink
                  href={stage.statsUrl}
                  variant="blank"
                  className="bg-cream border-caramel text-caramel hover:bg-cream/90"
                >
                  Detailed Statistics
                </ButtonLink>
              )}
            </div>
          )}

          {/* Pool, grouped by mod bracket */}
          <div className="flex flex-col gap-3">
            {brackets.map(({ bracket, maps }) => {
              // Re-add `const style = bracketStyle(bracket)` and the
              // ./mod-brackets import when restoring the heading below.
              return (
                <section key={bracket} className="flex flex-col gap-3">
                  {/* <div className="flex items-center gap-3">
                    <span
                      className={`${style.accent} h-6 w-1.5 shrink-0 rounded-full`}
                      aria-hidden
                    />
                    <Heading as="h3" size="sub" className="text-espresso">
                      {style.label}
                    </Heading>
                    <span className="text-espresso/50 text-sm tabular-nums">
                      {maps.length}
                    </span>
                  </div> */}
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {maps.map((map) => (
                      <MapCard key={map.slot} map={map} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </Container>
      </Section>
    </main>
  )
}
