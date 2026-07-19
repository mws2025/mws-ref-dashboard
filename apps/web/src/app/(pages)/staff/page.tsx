import { MemberCard } from "./components/StaffMemberCard"
import { getStaff } from "@/server/data"
import type { Staff } from "@/server/data/schemas"
import { mockStaff } from "./mock-staff"
import { Section } from "@/components/Section"
import { Container } from "@/components/Container"
import { Heading } from "@/components/ui/heading"
import { EmptyState } from "@/components/EmptyState"

const USE_MOCK_STAFF = false

const TEAM_MAPPINGS: Record<string, string[]> = {
  "Hosts & Admins": ["Host", "Co-Hosts"],
  Design: [
    "Illustrator",
    "GFX Artist",
    "Videography",
    "Lead Designer",
    "Skinner",
    "Storyboarder",
  ],
  Development: ["Web Developer", "Sheeter"],
  "Poolers & Mappers": ["Mapper", "Pooler", "Quality Assurance"],
  Playtesters: ["Playtester"],
  Streamers: ["Streamer"],
  Commentators: ["Commentator"],
  Referees: ["Referee"],
  Composers: ["Composer", "Voice Actor"],
}

export default async function StaffMembers() {
  let staffMembers: Staff[]
  if (USE_MOCK_STAFF) {
    staffMembers = mockStaff
  } else {
    try {
      staffMembers = await getStaff()
    } catch (err) {
      console.error("Error getting staff:", err)
      staffMembers = mockStaff
    }
  }

  // Group members by team, dropping teams with no matching members. If nothing
  // is left, the page shows an empty state.
  const teams = Object.entries(TEAM_MAPPINGS)
    .map(([team, roles]) => ({
      team,
      members: staffMembers.filter((member) =>
        member.roles.some((role) => roles.includes(role))
      ),
    }))
    .filter(({ members }) => members.length > 0)

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
                  Staff
                </Heading>
              </div>
            </div>
          </div>
        </Container>
      </Section>
      <Section>
        <Container>
          {teams.length === 0 ? (
            <EmptyState
              src="/CatSketch.png"
              alt="a cat waiting"
              title="No staff to show yet"
              description="Our team is still being whisked together. Check back soon to meet everyone."
            />
          ) : (
            <>
              <div className="mb-4 text-center">
                Last Updated:{" "}
                {new Date().toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </div>

              <div className="flex flex-col gap-8">
                {teams.map(({ team, members }) => (
                  <div key={team}>
                    <Heading as="h2" size="section" className="mb-2">
                      {team}
                    </Heading>
                    <div className="flex w-full flex-wrap gap-4">
                      {members.map((member) => (
                        <MemberCard key={member.id} {...member} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Container>
      </Section>
    </main>
  )
}
