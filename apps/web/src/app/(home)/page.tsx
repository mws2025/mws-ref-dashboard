import { ButtonLink } from "@/components/ui/button"
import { Heading } from "@/components/ui/heading"
import { Section } from "@/components/Section"
import { Container } from "@/components/Container"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import Image from "next/image"
import { InfoCard } from "./components/InfoCard"

export default function Home() {
  const eyebrow =
    "text-strawberry text-sm font-semibold tracking-[0.2em] uppercase"

  return (
    <>
      <Navbar />

      {/* Hero */}
      <Section
        className="relative h-[50vh] bg-[url(/illustration.png)] bg-cover bg-center"
        spacing="x"
      >
        <div className="bg-grad-cappuccino absolute inset-0 opacity-52"></div>
        <Container className="relative h-full">
          <div className="absolute bottom-0 left-1/2 z-10 w-[60%] -translate-x-1/2 translate-y-1/2">
            {/* peeking buttons */}
            <div className="absolute top-0 right-6 z-0 flex -translate-y-3/4 gap-2">
              <ButtonLink
                href="#"
                size="peek"
                variant="blank"
                className="bg-strawberry text-cream hover:bg-strawberry/60 hover:-translate-y-1"
              >
                Player Registration
              </ButtonLink>
              <ButtonLink
                href="#"
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
                Live Now
              </ButtonLink>
            </div>

            {/* heading island */}
            <div className="bg-cream relative z-10 flex items-center gap-4 rounded-2xl px-6 py-6">
              <Heading
                as="h1"
                size="hero"
                className="text-espresso text-center"
              >
                Welcome to Whisked, MWS&apos;s Third Iteration!
              </Heading>
            </div>
          </div>
        </Container>
      </Section>

      {/* Info Grid */}
      <Section className="mt-22">
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
          <div className="grid grid-cols-4 gap-x-8">
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
        </Container>
      </Section>

      {/* Book */}
      <Section className="relative mt-39" background="foam" spacing="x">
        {/* TODO: translate book image to jsx */}
        <Image
          src="/Book.png"
          alt="recipe book"
          width={2160}
          height={1210}
          className="absolute inset-x-0 -top-23 h-auto w-full"
        ></Image>

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
          <div className="text-cream grid grid-cols-2 gap-x-12">
            <div>
              <p className={eyebrow}>Sponsors</p>
              <Heading as="h3" size="section" className="mt-2">
                Additional Prizes
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
            <Image
              src="/screenshot-wishlist-card.png"
              alt="Whisk game"
              width={1920}
              height={1080}
              className="ml-auto aspect-auto rounded-xl"
            ></Image>
          </div>
        </Container>
      </Section>

      {/* Decor */}
      <Section spacing="xl">
        <Container>
          <div className="grid grid-cols-4 gap-x-8">
            <Image
              src="/window 1.png"
              alt="window"
              width={319}
              height={416}
              className="w-75"
            ></Image>
            <Image
              src="/window 2.png"
              alt="window"
              width={319}
              height={416}
              className="w-75"
            ></Image>
            <Image
              src="/window 3.png"
              alt="window"
              width={319}
              height={416}
              className="w-75"
            ></Image>
            <Image
              src="/window 4.png"
              alt="window"
              width={319}
              height={416}
              className="w-75"
            ></Image>
          </div>
        </Container>
      </Section>

      <Footer />
    </>
  )
}
