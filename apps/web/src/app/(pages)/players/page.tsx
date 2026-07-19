import { PlayerCard } from "./components/PlayerCard"
import { Container } from "@/components/Container"
import { getPlayers } from "@/server/data"
import { Section } from "@/components/Section"
import { Heading } from "@/components/ui/heading"
import { type Player } from "@/server/data/schemas"
import { mockPlayers } from "./mock-players"
import { EmptyState } from "@/components/EmptyState"

const USE_MOCK_PLAYERS = false

export default async function Players() {
  let players: Player[]
  if (USE_MOCK_PLAYERS) {
    players = mockPlayers
  } else {
    try {
      players = await getPlayers()
    } catch (err) {
      console.error("Error getting players:", err)
      players = mockPlayers
    }
  }

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
                  Players
                </Heading>
              </div>
            </div>
          </div>
        </Container>
      </Section>
      <Section>
        <Container>
          {players.length === 0 ? (
            <EmptyState
              src="/BreadSketch.png"
              alt="empty bread basket"
              title="No players registered yet"
              description="Registrations aren't out of the oven just yet. Check back soon to see who's competing."
            />
          ) : (
            <>
              <div className="mb-4 text-center">
                Total Registered Players: {players.length}
              </div>
              <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {[...players]
                  .sort((a, b) => {
                    if (a.rank === null && b.rank === null) return 0
                    if (a.rank === null) return 1
                    if (b.rank === null) return -1
                    return a.rank - b.rank
                  })
                  .map(({ id, username, bws, countryCode, pronouns }) => (
                    <PlayerCard
                      key={id}
                      id={id}
                      username={username}
                      rank={bws}
                      countryCode={countryCode}
                      pronouns={pronouns}
                    ></PlayerCard>
                  ))}
              </div>
            </>
          )}
        </Container>
      </Section>
    </main>
  )
}
