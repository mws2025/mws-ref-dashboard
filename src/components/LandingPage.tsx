import { Card, CardContent } from "@/components/ui/card"
import { TOURNAMENT_NAME } from "@/data/constants"

interface Props {
  onLogin: () => void
}

export function LandingPage({ onLogin }: Props) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-3">
          <img
            src="/assets/logo_light.png"
            alt="Whisked 2026 — ビートに合わせて焼く"
            className="mx-auto h-28 w-auto object-contain"
          />
          <p className="font-heading text-sm tracking-[0.22em] text-muted-foreground uppercase">
            {TOURNAMENT_NAME} Whisked 2026 Referee Portal
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6 pb-6">
            <p className="text-sm text-muted-foreground">
              Sign in with your osu! account to access the referee panel. Only
              authorized referees can log in.
            </p>
            <button
              onClick={onLogin}
              className="flex w-full items-center justify-center gap-3 rounded-md px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-75"
              style={{ backgroundColor: "#FF66AB" }}
            >
              <img
                src="/assets/osu.png"
                alt="osu!"
                className="h-5 w-5 object-contain"
              />
              Sign in with osu!
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
