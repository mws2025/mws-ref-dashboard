import { Section } from "@/components/Section"
import { Container } from "@/components/Container"
import { Heading } from "@/components/ui/heading"
import { RuleList } from "./components/RuleList"
import {
  GENERAL_INFO,
  QUALIFIER_STAGE,
  BRACKET_SCHEDULING,
  BRACKET_MATCH_PROCEDURES,
  BRACKET_BANS_PICKS,
  BRACKET_TIEBREAKER,
  BRACKET_SCREENING,
} from "./content"

export default function About() {
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
                  About
                </Heading>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container size="md" className="flex flex-col gap-12">
          <section>
            <Heading as="h2" size="section" className="mb-2">
              General Information
            </Heading>
            <hr className="border-espresso/30 mb-4 w-full border-t-2 border-dotted" />
            <RuleList items={GENERAL_INFO} />
          </section>

          <section>
            <Heading as="h2" size="section" className="mb-2">
              Qualifier Stage
            </Heading>
            <hr className="border-espresso/30 mb-4 w-full border-t-2 border-dotted" />
            <RuleList items={QUALIFIER_STAGE} />
          </section>

          <section>
            <Heading as="h2" size="section" className="mb-2">
              Bracket Stage Procedures
            </Heading>
            <hr className="border-espresso/30 mb-4 w-full border-t-2 border-dotted" />

            <div className="flex flex-col gap-8">
              <div>
                <Heading as="h3" size="sub" className="mb-2">
                  Scheduling
                </Heading>
                <RuleList items={BRACKET_SCHEDULING} />
              </div>

              <div>
                <Heading as="h3" size="sub" className="mb-2">
                  Match Procedures
                </Heading>
                <RuleList items={BRACKET_MATCH_PROCEDURES} />
              </div>

              <div>
                <Heading as="h3" size="sub" className="mb-2">
                  Bans &amp; Picks
                </Heading>
                <RuleList items={BRACKET_BANS_PICKS} />
              </div>

              <div>
                <Heading as="h3" size="sub" className="mb-2">
                  Tiebreaker
                </Heading>
                <RuleList items={BRACKET_TIEBREAKER} />
              </div>

              <div>
                <Heading as="h3" size="sub" className="mb-2">
                  Screening
                </Heading>
                <RuleList items={BRACKET_SCREENING} />
              </div>
            </div>
          </section>
        </Container>
      </Section>
    </main>
  )
}
