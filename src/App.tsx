import { useCallback, useEffect, useState } from "react"
import { DashboardPage } from "@/components/DashboardPage"
import { LandingPage } from "@/components/LandingPage"
import { MatchPanel } from "@/components/match/MatchPanel"
import type { Match } from "@/types"

type View = "landing" | "dashboard" | "match"
type AuthStatus = "loading" | "guest" | "authenticated"

type SessionUser = {
  username: string
  osu_id: number
}

function getAuthLoginUrl(): string {
  const configuredOrigin = import.meta.env.VITE_PAGES_DEV_ORIGIN?.trim()
  if (configuredOrigin) {
    return `${configuredOrigin.replace(/\/$/, "")}/api/auth/osu/login`
  }

  const { protocol, hostname, port, origin } = window.location
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1"
  if (isLocalHost && port !== "8788") {
    return `${protocol}//${hostname}:8788/api/auth/osu/login`
  }

  return `${origin}/api/auth/osu/login`
}

function App() {
  const [view, setView] = useState<View>("landing")
  const [match, setMatch] = useState<Match | null>(null)
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading")
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null)

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { credentials: "include" })
      if (!res.ok) {
        setSessionUser(null)
        setAuthStatus("guest")
        return
      }

      const data = await res.json() as { user?: SessionUser }
      if (!data.user) {
        setSessionUser(null)
        setAuthStatus("guest")
        return
      }

      setSessionUser(data.user)
      setAuthStatus("authenticated")
    } catch {
      setSessionUser(null)
      setAuthStatus("guest")
    }
  }, [])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  useEffect(() => {
    if (authStatus === "authenticated" && view === "landing") {
      setView("dashboard")
    }
    if (authStatus === "guest" && view !== "landing") {
      setView("landing")
      setMatch(null)
    }
  }, [authStatus, view])

  const beginOsuLogin = useCallback(() => {
    window.location.assign(getAuthLoginUrl())
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      })
    } finally {
      setSessionUser(null)
      setAuthStatus("guest")
      setMatch(null)
      setView("landing")
    }
  }, [])

  if (authStatus === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
        Checking session...
      </div>
    )
  }

  if (view === "landing") {
    return <LandingPage onLogin={beginOsuLogin} />
  }

  if (view === "dashboard") {
    return (
      <DashboardPage
        currentUserName={sessionUser?.username ?? "Referee"}
        onOpenMatch={(m) => { setMatch(m); setView("match") }}
        onLogout={() => { void logout() }}
      />
    )
  }

  if (view === "match" && match) {
    return (
      <MatchPanel
        match={match}
        onBack={() => { setView("dashboard"); setMatch(null) }}
      />
    )
  }

  return null
}

export default App
