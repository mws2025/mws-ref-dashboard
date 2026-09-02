import { Section } from "@/components/Section"
import { Container } from "@/components/Container"
import { Heading } from "@/components/ui/heading"
import { StageTabs } from "@/components/StageTabs"
import { EmptyState } from "@/components/EmptyState"
import type { RoundSettings, ScheduleMatch } from "@/server/data/matches"
import { MatchCard } from "./MatchCard"

type ScheduleViewProps = {
  rounds: RoundSettings[]
  round: RoundSettings
  matches: ScheduleMatch[]
}

export function ScheduleView({ rounds, round, matches }: ScheduleViewProps) {
  return (
    <main className="">
      {/* Hero — same treatment as the mappool page so the two read as siblings. */}
      <Section
        className="relative h-[20vh] bg-[url(/illustration.webp)] bg-cover bg-center"
        spacing="none"
      >
        <div className="bg-grad-cappuccino absolute inset-0 opacity-52"></div>
        <Container className="relative h-full">
          <div className="absolute bottom-0 left-1/2 z-10 w-[90%] -translate-x-1/2 translate-y-1/2 sm:w-[60%]">
            <div className="border-cream relative z-10 w-full flex-col items-stretch justify-between rounded-2xl border-t-2 border-r-2 border-l-2 p-3">
              <div className="bg-cream flex items-center justify-center gap-4 rounded-2xl px-6 py-6">
                <Heading
                  as="h1"
                  size="hero"
                  className="text-espresso text-center"
                >
                  {round.stage}
                </Heading>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="flex flex-col gap-8 px-4 sm:px-8">
          {rounds.length > 1 && (
            <StageTabs
              label="Schedule round"
              basePath="/schedule"
              activeTab={round.slug}
              tabs={rounds.map((r) => ({
                id: r.slug,
                label: r.stage,
                slug: r.slug,
              }))}
            />
          )}

          {round.bestOf && (
            <p className="text-espresso/60 text-center text-xs tracking-wide uppercase">
              Best of {round.bestOf} · times in UTC
            </p>
          )}

          {/* One card per row, ordered by match id (the referee sheet's own
              ordering, which runs in bracket order). */}
          {matches.length > 0 ? (
            <div className="flex flex-col gap-3">
              {matches.map((match, i) => (
                // The sheet can repeat an id across speculative bracket rows
                // (a Grand Finals reset, say), so position disambiguates.
                <MatchCard key={`${match.matchId}-${i}`} match={match} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No matches yet"
              description="This round hasn't been drawn. Check back soon."
            />
          )}
        </Container>
      </Section>
    </main>
  )
}
