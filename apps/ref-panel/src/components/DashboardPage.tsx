import { useEffect, useState } from "react"
import { CalendarDays, Radio, CalendarOff, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TOURNAMENT_NAME, TOURNAMENT_SUBTITLE } from "@/data/constants"
import { isTerminalMatchStatus, statusVariant } from "@/lib/mappool"
import type { Match } from "@/types"
import { LiveBadge } from "./LiveBadge"

function splitTournamentName(full: string): [string, string] {
  const idx = full.indexOf(" - ")
  if (idx !== -1) return [full.slice(0, idx), full.slice(idx + 3)]
  return [full, ""]
}

type MatchesResponse = {
  matches: Match[]
  yourMatches: Match[]
  activeMatches: Match[]
  updatedAt: string
}

interface Props {
  currentUserName: string
  tournamentName?: string
  abbreviation?: string
  testMode?: boolean
  onOpenMatch: (m: Match) => void
  onLogout: () => void
}

function formatMatchDate(raw: string): string {
  if (!raw) return raw
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw)
  if (isNaN(d.getTime())) return raw
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" })
  const month = d.toLocaleDateString("en-US", { month: "short" })
  return `(${weekday}) ${month} ${d.getDate()}`
}

function canOpenMatch(match: Match, currentUserName: string): boolean {
  const assignedReferee = match.referee?.trim().toLowerCase()
  const currentReferee = currentUserName.trim().toLowerCase()
  return match.status === "live" || (assignedReferee === currentReferee && !isTerminalMatchStatus(match.status))
}


function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-card/30 px-4 py-5 text-sm text-muted-foreground">
      <Icon className="h-4 w-4 shrink-0 opacity-60" />
      {message}
    </div>
  )
}

function SkeletonCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-3 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-28" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function SkeletonTableRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-3 w-20" /></TableCell>
          <TableCell><Skeleton className="h-3 w-16" /></TableCell>
          <TableCell><Skeleton className="h-3 w-36" /></TableCell>
          <TableCell><Skeleton className="h-3 w-16" /></TableCell>
          <TableCell><Skeleton className="h-3 w-12" /></TableCell>
          <TableCell><Skeleton className="h-4 w-14 rounded-full" /></TableCell>
          <TableCell />
        </TableRow>
      ))}
    </>
  )
}

export function DashboardPage({ currentUserName, tournamentName, testMode, onOpenMatch, onLogout }: Props) {
  const fullName = tournamentName || `${TOURNAMENT_NAME} - ${TOURNAMENT_SUBTITLE}`
  const [nameA, nameB] = splitTournamentName(fullName)
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
      {testMode && (
        <div className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          <span className="font-semibold">TEST MODE</span>
          <span className="text-amber-700 dark:text-amber-400">All actions are simulated - no real IRC messages or sheet writes will occur.</span>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-4">
            <img src="/assets/logo_light.png" alt="Whisked 2026" className="h-14 w-auto object-contain" />
            <div className="space-y-0.5">
              <p className="font-heading text-xs uppercase tracking-[0.18em] text-muted-foreground">Referee Dashboard</p>
              <h1 className="font-heading text-2xl leading-tight">{nameB || nameA}</h1>
              <p className="text-sm text-muted-foreground">Welcome back, {currentUserName}!</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" onClick={onLogout}>Sign out</Button>
          </div>
        </header>

        {matchesError && (
          <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{matchesError}</span>
            <Button size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        )}

        <section className="space-y-3">
          <h2 className="font-heading text-xl">Your matches</h2>
          {!matchesResponse ? <SkeletonCards /> : yourMatches.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {yourMatches.map((m) => (
                <Card key={m.id} className="border-border/60">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-heading text-lg font-semibold">{m.playerA} <span className="font-sans normal-case text-muted-foreground">vs</span> {m.playerB}</p>
                        <p className="text-sm text-muted-foreground">{m.round} · {formatMatchDate(m.date)} · {m.time}</p>
                      </div>
                      {m.status === "live"
                        ? <LiveBadge />
                        : <Badge variant={statusVariant(m.status)} className="capitalize">{m.status}</Badge>
                      }
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
            <EmptyState icon={CalendarDays} message="No matches assigned to you." />
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-xl">Active matches</h2>
          {!matchesResponse ? <SkeletonCards /> : activeMatches.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {activeMatches.map((m) => (
                <Card key={m.id} className="border-primary/50 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-heading text-lg font-semibold">{m.playerA} <span className="font-sans normal-case text-muted-foreground">vs</span> {m.playerB}</p>
                        <p className="text-sm text-muted-foreground">{m.round} · {formatMatchDate(m.date)} · {m.time}</p>
                      </div>
                      <LiveBadge />
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
            <EmptyState icon={Radio} message="No active matches right now." />
          )}
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="font-heading text-xl">Tournament schedule</h2>
          <div className="overflow-hidden rounded-lg border border-border">
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card/60 hover:bg-card/60">
                    {["Round", "Match ID", "Match", "Date", "Time", "Status", "Action"].map((h) => (
                      <TableHead key={h} className="font-heading text-xs uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!matchesResponse ? (
                    <SkeletonTableRows />
                  ) : scheduleMatches.length > 0 ? (
                    scheduleMatches.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-muted-foreground">{m.round}</TableCell>
                        <TableCell className="font-mono text-xs">{m.id}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap">
                          {m.playerA} <span className="text-muted-foreground">vs</span> {m.playerB}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">{formatMatchDate(m.date)}</TableCell>
                        <TableCell className="text-muted-foreground">{m.time}</TableCell>
                        <TableCell>
                          {m.status === "live"
                            ? <LiveBadge />
                            : <Badge variant={statusVariant(m.status)} className="text-xs capitalize">{m.status}</Badge>
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          {canOpenMatch(m, currentUserName) && (
                            <Button size="sm" variant="secondary" onClick={() => onOpenMatch(m)}>Open</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                          <CalendarOff className="h-4 w-4 opacity-60" />
                          No scheduled matches found.
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </section>

      </div>
    </div>
  )
}
