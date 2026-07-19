import { ButtonLink } from "@/components/ui/button"
import { Heading } from "@/components/ui/heading"
import { Section } from "@/components/Section"
import { Container } from "@/components/Container"
import Image from "next/image"
import { InfoCard } from "./components/InfoCard"
import { SponsorRow } from "./components/SponsorRow"
import Link from "next/link"

export default function Home() {
  return (
    <main className="">
      {/* Hero */}
      <Section
        className="relative h-[75vh] bg-[url(/illustration.webp)] bg-cover bg-center sm:h-[50vh]"
        spacing="none"
      >
        <div className="bg-grad-cappuccino absolute inset-0 opacity-52"></div>
        <Container className="relative h-full">
          {/* mobile: normal stacked buttons above the island, image still
              visible around them. Desktop keeps the peeking row instead. */}
          <div className="absolute inset-x-4 bottom-22 z-10 flex flex-col gap-2 sm:hidden">
            <ButtonLink
              href="https://docs.google.com/forms/d/e/1FAIpQLSc7A0XAzS_u9ithwfAnwSBCuNPSHciijE7R-ssG_kRMdYEmSA/viewform"
              variant="blank"
              className="bg-strawberry text-cream hover:bg-strawberry/60 w-full justify-center"
            >
              Player Registration
            </ButtonLink>
            <ButtonLink
              href="https://docs.google.com/forms/d/e/1FAIpQLSfHZhW7tVeeqVseH5JhH2k2s4Lq7lXZr-0Nz6aKIqr85n6XFg/viewform?usp=header"
              variant="blank"
              className="bg-cream border-strawberry text-strawberry hover:bg-cream/90 w-full justify-center"
            >
              Staff Registration
            </ButtonLink>
            <ButtonLink
              href="https://www.twitch.tv/mwstournament"
              variant="blank"
              className="bg-cherry hover:bg-cherry/60 text-cream w-full justify-center gap-1.5"
            >
              <span className="bg-cream size-2 animate-pulse rounded-full" />
              Watch Live
            </ButtonLink>
          </div>

          <div className="absolute bottom-0 left-1/2 z-10 w-[90%] -translate-x-1/2 translate-y-1/2 sm:w-[60%]">
            {/* peeking buttons (desktop only) */}
            <div className="absolute top-0 right-6 z-0 hidden -translate-y-3/4 justify-end gap-2 sm:flex">
              <ButtonLink
                href="https://docs.google.com/forms/d/e/1FAIpQLSc7A0XAzS_u9ithwfAnwSBCuNPSHciijE7R-ssG_kRMdYEmSA/viewform"
                size="peek"
                variant="blank"
                className="bg-strawberry text-cream hover:bg-strawberry/60 hover:-translate-y-1"
              >
                Player Registration
              </ButtonLink>
              <ButtonLink
                href="https://docs.google.com/forms/d/e/1FAIpQLSfHZhW7tVeeqVseH5JhH2k2s4Lq7lXZr-0Nz6aKIqr85n6XFg/viewform?usp=header"
                size="peek"
                variant="blank"
                className="bg-cream border-strawberry text-strawberry hover:bg-cream/90 hover:-translate-y-1"
              >
                Staff Registration
              </ButtonLink>
              <ButtonLink
                href="https://www.twitch.tv/mwstournament"
                size="peek"
                variant="blank"
                className="bg-cherry hover:bg-cherry/60 text-cream gap-1.5 hover:-translate-y-1"
              >
                <span className="bg-cream size-2 animate-pulse rounded-full" />
                Watch Live
              </ButtonLink>
            </div>

            {/* heading island */}
            <div className="bg-cream relative z-10 flex items-center gap-4 rounded-2xl px-6 py-6">
              <Heading
                as="h1"
                size="hero"
                className="text-espresso text-center text-3xl"
              >
                Welcome to Whisked, MWS&apos;s Third Iteration!
              </Heading>
            </div>
          </div>
        </Container>
      </Section>

      {/* Info Grid */}
      <Section className="mt-24">
        <Container>
          <div className="mb-8 text-center">
            <Heading
              as="h3"
              size="sub"
              className="text-strawberry font-semibold tracking-[0.2em] uppercase"
            >
              What&apos;s Baking
            </Heading>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-8">
            <InfoCard
              src="/PieSketch.png"
              alt="pie sketch"
              width={273}
              height={187}
              title="Brand New Gimmick"
            >
              Baking themed gimmick. Pick your map. Gather your ingredients.
              Bake your recipe. use them to win or manipulate your opponent!
            </InfoCard>
            <InfoCard
              src="/PastrySketch.png"
              alt="pastry sketch"
              width={378}
              height={319}
              title="Website Update"
            >
              Our website has been updated with new features and a fresh design!
              Including our own custom referee portal!
            </InfoCard>
            <InfoCard
              src="/CustardSketch.png"
              alt="custard sketch"
              width={216}
              height={145}
              title="Over 10+ Customs"
            >
              This year we are providing new maps and custom songs catered to
              our story and tournament.
            </InfoCard>
            <InfoCard
              src="/BreadSketch.png"
              alt="bread sketch"
              width={168}
              height={168}
              title="Prize Pool"
            >
              We have partnered with 2 companies to provide new prizes to our
              winners.
            </InfoCard>
          </div>

          {/* mobile only: the Book section's rules/menu hotspots below are
              hidden on mobile, so surface them as real buttons here instead */}
          <div className="mt-8 mb-8 flex justify-center gap-2 sm:hidden">
            <ButtonLink
              href="/about"
              variant="blank"
              className="bg-caramel text-cream hover:bg-caramel/80 flex-1 justify-center"
            >
              View Rules
            </ButtonLink>
            <ButtonLink
              href="/menu"
              variant="blank"
              className="bg-cream border-caramel text-caramel hover:bg-cream/90 flex-1 justify-center"
            >
              View Menu
            </ButtonLink>
          </div>
        </Container>
      </Section>

      {/* Book — hidden on mobile for now */}
      <Section
        className="relative mt-40 hidden sm:block"
        background="foam"
        spacing="none"
      >
        {/* TODO: translate book image to jsx */}
        <div className="absolute inset-x-0 -top-23 h-auto w-full">
          <Image
            src="/book.webp"
            alt="recipe book"
            width={2160}
            height={1210}
            className="h-auto w-full"
            draggable="false"
          ></Image>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute top-0 left-0 h-full w-full"
          >
            <Link
              href="https://docs.google.com/document/d/1yZUfOGIjgmyxufVrqDNi5Fs85XAdAuNw1lwaIWuEGhU/edit?tab=t.0#heading=h.myjk5m6lzhvh"
              target="_blank"
            >
              <rect
                x="36.6"
                y="78.6"
                width="9.76"
                height="3.1"
                transform="rotate(-2.33, 38.33, 81.43)"
                fill="transparent"
                pointerEvents={"auto"}
                stroke="none"
                style={{
                  transformOrigin: "38.33% 81.43%",
                }}
              />
            </Link>
            <Link href="/menu">
              <rect
                x="85.45"
                y="10.5"
                width="9.75"
                height="3.1"
                transform="rotate(-2.33, 88.74, 15.29)"
                fill="transparent"
                pointerEvents={"auto"}
                stroke="none"
                style={{
                  transformOrigin: "88.74% 15.29%",
                }}
              />
            </Link>
          </svg>
        </div>

        {/* spacer */}
        <div aria-hidden className="aspect-2160/1210 w-full" />

        <Container size="full" className="px-12">
          <div className="ml-auto pt-0 pb-8 text-right">
            <Heading
              as="h2"
              size="display"
              className="text-toasted text-4xl sm:text-6xl lg:text-7xl"
            >
              Baked to the Beat.
            </Heading>
          </div>
        </Container>
      </Section>

      {/* Sponsors */}
      <Section background="chocolate">
        <Container>
          <div className="text-cream flex flex-col gap-16">
            {/* intro */}
            <div className="max-w-2xl">
              <Heading as="h2" size="section" className="mt-2">
                Our Sponsors
              </Heading>
              <p className="text-cream/80 mt-2 text-lg">
                Thank you to our sponsors — we appreciate you and your work.
                Because of them, we&apos;re able to provide our competitors with
                exclusive prizes!
                <br />
                <br />
                If you are a company or organization who is interested in
                collaborating with us, please contact us at{" "}
                <a
                  href="mailto:mwsseries@gmail.com"
                  className="text-strawberry"
                >
                  mwsseries@gmail.com
                </a>
                !
              </p>
            </div>

            <SponsorRow
              src="/screenshot-wishlist-card.webp"
              alt="Whisk"
              title="Whisk"
              description="Whisk is a two-player platformer about shared movement and communication. Coordinate jumps, climbs and throws with a partner to get every Dreamcat home."
              href="https://store.steampowered.com/app/3602270/Whisk/"
            />
            <SponsorRow
              reverse
              src="/PulsarLab_Xpadmini_banner_main_3350x.webp"
              alt="Pulsar Lab XPAD"
              title="Pulsar Lab XPAD"
              description="The smallest pad on your desk. The fastest input in the room. XPAD mini puts flagship-level performance exactly where it belongs next to your mouse, where every millisecond counts."
              href="https://www.pulsar.gg/products/pulsar-lab-xpad-mini-gaming-key-pad"
            />
          </div>
        </Container>
      </Section>
    </main>
  )
}
