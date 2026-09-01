import { useEffect, useState } from "react"
import { format, isValid, parseISO } from "date-fns"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Radio,
  CalendarOff,
  RefreshCw,
  UserMinus,
  UserPlus,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
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
import {
  formatScheduleTimeInput,
  normalizeScheduleTime,
  refereeAssignments,
  refereeIsAssigned,
} from "@/lib/match-rules"
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

type ScheduleSortKey = "id" | "match" | "date" | "referee"
type SortDirection = "asc" | "desc"

const SCHEDULE_COLUMNS: readonly { label: string; className: string; sortKey?: ScheduleSortKey }[] = [
  { label: "Round", className: "w-24" },
  { label: "Match ID", className: "w-24", sortKey: "id" },
  { label: "Match", className: "w-64", sortKey: "match" },
  { label: "Date", className: "w-32", sortKey: "date" },
  { label: "Time", className: "w-20" },
  { label: "Referee", className: "w-40", sortKey: "referee" },
  { label: "Status", className: "w-28" },
  { label: "Action", className: "w-[244px] text-right" },
] as const

interface Props {
  currentUserName: string
  tournamentName?: string
  abbreviation?: string
  testMode?: boolean
  canManageAssignments?: boolean
  isAdmin?: boolean
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

function canOpenMatch(match: Match): boolean {
  return !isTerminalMatchStatus(match.status)
}

function compareMatchSchedule(left: Match, right: Match): number {
  return left.date.localeCompare(right.date) || left.time.localeCompare(right.time) || left.round.localeCompare(right.round)
}

function scheduleSortValue(match: Match, key: ScheduleSortKey): string {
  switch (key) {
    case "id": return match.id
    case "match": return `${match.playerA} vs ${match.playerB}`
    case "date": return match.date
    case "referee": return match.referee ?? ""
  }
}

function compareNatural(left: string, right: string): number {
  return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" })
}

function parseMatchDate(raw: string): Date | undefined {
  const parsed = parseISO(raw)
  return isValid(parsed) ? parsed : undefined
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
          <TableCell><Skeleton className="h-3 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-14 rounded-full" /></TableCell>
          <TableCell />
        </TableRow>
      ))}
    </>
  )
}

export function DashboardPage({ currentUserName, tournamentName, testMode, canManageAssignments = true, isAdmin = false, onOpenMatch, onLogout }: Props) {
  const fullName = tournamentName || `${TOURNAMENT_NAME} - ${TOURNAMENT_SUBTITLE}`
  const [nameA, nameB] = splitTournamentName(fullName)
  const [matchesResponse, setMatchesResponse] = useState<MatchesResponse | null>(null)
  const [matchesError, setMatchesError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [assignmentPending, setAssignmentPending] = useState<string | null>(null)
  const [scheduleMatch, setScheduleMatch] = useState<Match | null>(null)
  const [scheduleDate, setScheduleDate] = useState<Date>()
  const [scheduleTime, setScheduleTime] = useState("")
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [scheduleSort, setScheduleSort] = useState<{ key: ScheduleSortKey; direction: SortDirection }>({
    key: "id",
    direction: "asc",
  })

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
  const sortedScheduleMatches = [...scheduleMatches].sort((left, right) => {
    let order = compareNatural(
      scheduleSortValue(left, scheduleSort.key),
      scheduleSortValue(right, scheduleSort.key),
    )
    if (order === 0 && scheduleSort.key === "date") {
      order = compareNatural(left.time, right.time)
    }
    return (scheduleSort.direction === "asc" ? order : -order) || compareNatural(left.id, right.id)
  })

  function toggleScheduleSort(key: ScheduleSortKey) {
    setScheduleSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }))
  }

  async function updateRefereeAssignment(match: Match, action: "signup" | "signout") {
    if (assignmentPending) return
    setAssignmentPending(match.id)
    try {
      const res = await fetch(`/api/match/${match.id}/referee`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json() as { error?: string; referee?: string }
      if (!res.ok) throw new Error(data.error ?? "Failed to update referee assignment")

      const referee = data.referee ?? ""
      setMatchesResponse((current) => {
        if (!current) return current
        const matches = current.matches.map((candidate) =>
          candidate.id === match.id ? { ...candidate, referee: referee || undefined } : candidate
        )
        return {
          ...current,
          matches,
          yourMatches: matches.filter((candidate) => refereeIsAssigned(candidate.referee, currentUserName)),
          activeMatches: matches.filter((candidate) => candidate.status === "live"),
          updatedAt: new Date().toISOString(),
        }
      })
      toast.success(action === "signup" ? "Signed in to match" : "Signed out of match")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update referee assignment")
    } finally {
      setAssignmentPending(null)
    }
  }

  function assignmentButton(match: Match) {
    if (!canManageAssignments || isTerminalMatchStatus(match.status)) return null
    const assigned = refereeAssignments(match.referee)
    const assignedToCurrentUser = refereeIsAssigned(match.referee, currentUserName)
    if (assigned.length > 0 && !assignedToCurrentUser) return null

    const action = assignedToCurrentUser ? "signout" : "signup"
    return (
      <Button
        size="sm"
        variant="outline"
        className="w-[108px] shrink-0"
        disabled={assignmentPending !== null}
        onClick={() => { void updateRefereeAssignment(match, action) }}
      >
        {assignedToCurrentUser
          ? <UserMinus className="mr-1.5 h-3.5 w-3.5" />
          : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
        {assignmentPending === match.id ? "Saving..." : assignedToCurrentUser ? "Sign out" : "Sign in"}
      </Button>
    )
  }

  function openScheduleEditor(match: Match) {
    setScheduleMatch(match)
    setScheduleDate(parseMatchDate(match.date))
    setScheduleTime(formatScheduleTimeInput(match.time))
    setCalendarOpen(false)
  }

  async function saveSchedule() {
    if (!scheduleMatch || !scheduleDate || scheduleSaving) return
    const time = normalizeScheduleTime(scheduleTime)
    if (!time) {
      toast.error("Enter a valid 24-hour time in HH:MM format")
      return
    }

    const date = format(scheduleDate, "yyyy-MM-dd")
    setScheduleSaving(true)
    try {
      const res = await fetch(`/api/match/${scheduleMatch.id}/schedule`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, time }),
      })
      const data = await res.json() as { error?: string; date?: string; time?: string }
      if (!res.ok) throw new Error(data.error ?? "Failed to update match schedule")

      const update = (matches: Match[]) => matches
        .map((candidate) =>
          candidate.id === scheduleMatch.id
            ? { ...candidate, date: data.date ?? date, time: data.time ?? time }
            : candidate
        )
        .sort(compareMatchSchedule)
      setMatchesResponse((current) => current ? {
        ...current,
        matches: update(current.matches),
        yourMatches: update(current.yourMatches),
        activeMatches: update(current.activeMatches),
        updatedAt: new Date().toISOString(),
      } : current)
      setScheduleMatch(null)
      toast.success("Match schedule updated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update match schedule")
    } finally {
      setScheduleSaving(false)
    }
  }

  function scheduleButton(match: Match) {
    if (!isAdmin) return null
    return (
      <Button
        size="icon-sm"
        variant="outline"
        className="size-8 shrink-0"
        title="Edit schedule"
        onClick={() => openScheduleEditor(match)}
      >
        <CalendarDays className="h-3.5 w-3.5" />
        <span className="sr-only">Edit schedule</span>
      </Button>
    )
  }

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
                        <p className="mt-1 text-xs text-muted-foreground">Referee: {m.referee || "Unassigned"}</p>
                      </div>
                      {m.status === "live"
                        ? <LiveBadge />
                        : <Badge variant={statusVariant(m.status)} className="capitalize">{m.status}</Badge>
                      }
                    </div>
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    <Button className="flex-1" size="sm" disabled={!canOpenMatch(m)} onClick={() => onOpenMatch(m)}>
                      Open Ref Panel
                    </Button>
                    {assignmentButton(m)}
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
                        <p className="mt-1 text-xs text-muted-foreground">Referee: {m.referee || "Unassigned"}</p>
                      </div>
                      <LiveBadge />
                    </div>
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    <Button className="flex-1" size="sm" onClick={() => onOpenMatch(m)}>
                      Open Ref Panel
                    </Button>
                    {assignmentButton(m)}
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
              <Table className="min-w-[1160px] table-fixed">
                <TableHeader>
                  <TableRow className="bg-card/60 hover:bg-card/60">
                    {SCHEDULE_COLUMNS.map((column) => (
                      <TableHead
                        key={column.label}
                        className={`font-heading text-xs uppercase tracking-normal text-muted-foreground ${column.className}`}
                        aria-sort={column.sortKey && scheduleSort.key === column.sortKey
                          ? scheduleSort.direction === "asc" ? "ascending" : "descending"
                          : undefined}
                      >
                        {column.sortKey ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            className="-ml-2 px-2 font-heading text-xs uppercase tracking-normal text-muted-foreground"
                            onClick={() => toggleScheduleSort(column.sortKey as ScheduleSortKey)}
                          >
                            {column.label}
                            {scheduleSort.key !== column.sortKey
                              ? <ArrowUpDown className="h-3.5 w-3.5" />
                              : scheduleSort.direction === "asc"
                                ? <ArrowUp className="h-3.5 w-3.5" />
                                : <ArrowDown className="h-3.5 w-3.5" />}
                          </Button>
                        ) : column.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!matchesResponse ? (
                    <SkeletonTableRows />
                  ) : sortedScheduleMatches.length > 0 ? (
                    sortedScheduleMatches.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-muted-foreground">{m.round}</TableCell>
                        <TableCell className="font-mono text-xs">{m.id}</TableCell>
                        <TableCell className="truncate font-medium" title={`${m.playerA} vs ${m.playerB}`}>
                          {m.playerA} <span className="text-muted-foreground">vs</span> {m.playerB}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">{formatMatchDate(m.date)}</TableCell>
                        <TableCell className="text-muted-foreground">{m.time}</TableCell>
                        <TableCell className="truncate text-muted-foreground" title={m.referee || "Unassigned"}>{m.referee || "Unassigned"}</TableCell>
                        <TableCell>
                          {m.status === "live"
                            ? <LiveBadge />
                            : <Badge variant={statusVariant(m.status)} className="text-xs capitalize">{m.status}</Badge>
                          }
                        </TableCell>
                        <TableCell className="w-[244px]">
                          <div className="grid grid-cols-[72px_108px_32px] justify-end gap-2">
                            {canOpenMatch(m)
                              ? <Button className="w-[72px]" size="sm" variant="secondary" onClick={() => onOpenMatch(m)}>Open</Button>
                              : <span aria-hidden="true" />}
                            {assignmentButton(m) ?? <span aria-hidden="true" />}
                            {scheduleButton(m) ?? <span aria-hidden="true" />}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                          <CalendarOff className="h-4 w-4 opacity-60" />
                          No scheduled matches found.
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </section>

      </div>

      <Dialog
        open={scheduleMatch !== null}
        onOpenChange={(open) => {
          if (!open && !scheduleSaving) setScheduleMatch(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit match schedule</DialogTitle>
            <DialogDescription>
              {scheduleMatch ? `${scheduleMatch.playerA} vs ${scheduleMatch.playerB}` : "Select a date and time."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1">
            <div className="grid gap-2">
              <Label htmlFor="schedule-date">Date</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="schedule-date"
                    type="button"
                    variant="outline"
                    className="w-full justify-start font-normal"
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {scheduleDate ? format(scheduleDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={scheduleDate}
                    onSelect={(date) => {
                      setScheduleDate(date)
                      if (date) setCalendarOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="schedule-time">Time</Label>
              <Input
                id="schedule-time"
                value={scheduleTime}
                inputMode="numeric"
                maxLength={5}
                placeholder="HH:MM"
                aria-invalid={scheduleTime.length > 0 && normalizeScheduleTime(scheduleTime) === null}
                onChange={(event) => setScheduleTime(formatScheduleTimeInput(event.target.value))}
                onBlur={() => {
                  const normalized = normalizeScheduleTime(scheduleTime)
                  if (normalized) setScheduleTime(normalized)
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={scheduleSaving} onClick={() => setScheduleMatch(null)}>
              Cancel
            </Button>
            <Button
              disabled={!scheduleDate || !normalizeScheduleTime(scheduleTime) || scheduleSaving}
              onClick={() => { void saveSchedule() }}
            >
              {scheduleSaving ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
