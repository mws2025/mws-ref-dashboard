import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { CURRENT_ROUND, TOURNAMENT_NAME, TOURNAMENT_SUBTITLE } from "@/data/constants"
import { isTerminalMatchStatus, statusVariant } from "@/lib/mappool"
import type { Match } from "@/types"

type MatchesResponse = {
  matches: Match[]
  yourMatches: Match[]
  activeMatches: Match[]
  updatedAt: string
}

interface Props {
  currentUserName: string
  onOpenMatch: (m: Match) => void
  onLogout: () => void
}

function canOpenMatch(match: Match, currentUserName: string): boolean {
  const assignedReferee = match.referee?.trim().toLowerCase()
  const currentReferee = currentUserName.trim().toLowerCase()
  return match.status === "live" || (assignedReferee === currentReferee && !isTerminalMatchStatus(match.status))
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/30 px-4 py-6 text-sm text-muted-foreground">
      {message}
    </div>
  )
}

export function DashboardPage({ currentUserName, onOpenMatch, onLogout }: Props) {
  const [matchesResponse, setMatchesResponse] = useState<MatchesResponse | null>(null)
  const [matchesError, setMatchesError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadMatches() {
      try {
        const res = await fetch("/api/matches", { credentials: "include" })
        if (!res.ok) {
          throw new Error(`Failed to load matches (${res.status})`)
        }

        const data = await res.json() as MatchesResponse
        if (!cancelled) {
          setMatchesResponse(data)
          setMatchesError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setMatchesError(error instanceof Error ? error.message : "Failed to load matches")
        }
      }
    }

    void loadMatches()
    const refreshId = window.setInterval(() => { void loadMatches() }, 15_000)

    return () => {
      cancelled = true
      window.clearInterval(refreshId)
    }
  }, [reloadKey])

  const yourMatches = matchesResponse?.yourMatches ?? []
  const activeMatches = matchesResponse?.activeMatches ?? []
  const scheduleMatches = matchesResponse?.matches ?? []

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-4">
            <img src="/assets/logo_light.png" alt="Whisked 2026" className="h-14 w-auto object-contain" />
            <div className="space-y-0.5">
              <p className="font-heading text-xs uppercase tracking-[0.18em] text-muted-foreground">{TOURNAMENT_NAME}</p>
              <h1 className="font-heading text-2xl leading-tight">{TOURNAMENT_SUBTITLE} · Referee Dashboard</h1>
              <p className="text-sm text-muted-foreground">Welcome back, {currentUserName}.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="border-0 bg-secondary text-secondary-foreground">{CURRENT_ROUND}</Badge>
            <Badge className="border-0 bg-accent text-accent-foreground">{activeMatches.length} Live</Badge>
            <Button size="sm" variant="outline" onClick={onLogout}>Sign out</Button>
          </div>
        </header>

        {matchesError && (
          <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{matchesError}</span>
            <Button size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
              Retry
            </Button>
          </div>
        )}

        <section className="space-y-3">
          <h2 className="font-heading text-xl">Your matches</h2>
          {yourMatches.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {yourMatches.map((m) => (
                <Card key={m.id} className="border-primary/30">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="font-heading text-lg">{m.playerA} vs {m.playerB}</CardTitle>
                        <CardDescription>{m.round} · {m.date} · {m.time}</CardDescription>
                      </div>
                      <Badge variant={statusVariant(m.status)} className="capitalize">{m.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" size="sm" disabled={!canOpenMatch(m, currentUserName)} onClick={() => onOpenMatch(m)}>
                      Open Ref Panel
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState message={matchesResponse ? "No matches assigned to you." : "Loading your matches..."} />
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-xl">Active matches</h2>
          {activeMatches.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {activeMatches.map((m) => (
                <Card key={m.id} className="border-primary/40">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="font-heading text-lg">{m.playerA} vs {m.playerB}</CardTitle>
                        <CardDescription>{m.round} · {m.date} · {m.time}</CardDescription>
                      </div>
                      <Badge variant={statusVariant(m.status)}>Live</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" size="sm" onClick={() => onOpenMatch(m)}>
                      Open Ref Panel
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState message={matchesResponse ? "No active matches right now." : "Loading active matches..."} />
          )}
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="font-heading text-xl">Tournament schedule</h2>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card/60">
                  {["Round", "Match", "Date", "Time", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-heading text-xs uppercase tracking-[0.18em] text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scheduleMatches.length > 0 ? (
                  scheduleMatches.map((m, i) => (
                    <tr key={m.id} className={`border-b border-border/60 last:border-0 ${i % 2 === 0 ? "bg-background/40" : ""}`}>
                      <td className="px-4 py-3 text-muted-foreground">{m.round}</td>
                      <td className="px-4 py-3 font-medium">{m.playerA} <span className="text-muted-foreground">vs</span> {m.playerB}</td>
                      <td className="px-4 py-3 text-muted-foreground">{m.date}</td>
                      <td className="px-4 py-3 text-muted-foreground">{m.time}</td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(m.status)} className="text-xs capitalize">{m.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canOpenMatch(m, currentUserName) && (
                          <Button size="sm" variant="secondary" onClick={() => onOpenMatch(m)}>Open</Button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-6 text-center text-muted-foreground" colSpan={6}>
                      {matchesResponse ? "No scheduled matches found." : "Loading tournament schedule..."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
