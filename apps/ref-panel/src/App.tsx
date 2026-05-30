import { useCallback, useEffect, useState } from "react"
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { DashboardPage } from "@/components/DashboardPage"
import { ErrorPage } from "@/components/ErrorPage"
import { LandingPage } from "@/components/LandingPage"
import { MatchPanel } from "@/components/match/MatchPanel"
import type { Match } from "@/types"

type AuthStatus = "loading" | "guest" | "authenticated"
type SessionUser = { username: string; osu_id: number }

function getApiUrl(path: string): string {
  const configuredOrigin = import.meta.env.VITE_PAGES_DEV_ORIGIN?.trim()
  if (configuredOrigin) {
    return `${configuredOrigin.replace(/\/$/, "")}${path}`
  }
  const { protocol, hostname, port, origin } = window.location
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1"
  if (isLocalHost && port !== "8788") {
    return `${protocol}//${hostname}:8788${path}`
  }
  return `${origin}${path}`
}

function MatchPanelRoute({ onBack, isDemo, testMode }: { onBack: () => void; isDemo: boolean; testMode: boolean }) {
  const { state } = useLocation()
  const match = (state as { match?: Match } | null)?.match

  if (!match) return <Navigate to="/dashboard" replace />
  return <MatchPanel match={match} onBack={onBack} isDemo={isDemo} testMode={testMode} />
}

function ErrorRoute() {
  const { code } = useParams()
  const navigate = useNavigate()
  return <ErrorPage code={Number(code) || 500} onBack={() => navigate("/")} />
}

function App() {
  const navigate = useNavigate()
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading")
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null)
  const [restrictAccess, setRestrictAccess] = useState<boolean>(true)
  const [testMode, setTestMode] = useState(false)
  const [tournamentName, setTournamentName] = useState("")
  const [abbreviation, setAbbreviation] = useState("")

  const refreshSession = useCallback(async () => {
    try {
      const [sessionRes, configRes] = await Promise.all([
        fetch("/api/auth/session", { credentials: "include" }),
        fetch("/api/public/config"),
      ])

      if (configRes.ok) {
        const cfg = await configRes.json() as { restrictAccess?: boolean; testMode?: boolean; tournamentName?: string; abbreviation?: string }
        setRestrictAccess(cfg.restrictAccess ?? true)
        if (typeof cfg.testMode === "boolean") setTestMode(cfg.testMode)
        if (cfg.tournamentName) setTournamentName(cfg.tournamentName)
        if (cfg.abbreviation)   setAbbreviation(cfg.abbreviation)
      }

      if (!sessionRes.ok) {
        setSessionUser(null)
        setAuthStatus("guest")
        if (sessionRes.status === 403) navigate("/error/403")
        return
      }

      const data = await sessionRes.json() as { user?: SessionUser }
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
  }, [navigate])

  useEffect(() => { void refreshSession() }, [refreshSession])

  useEffect(() => {
    const path = window.location.pathname
    if (authStatus === "authenticated" && path === "/") navigate("/dashboard")
    if (authStatus === "guest" && path !== "/" && !path.startsWith("/error")) navigate("/")
  }, [authStatus, navigate])

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    } finally {
      setSessionUser(null)
      setAuthStatus("guest")
      navigate("/")
    }
  }, [navigate])

  if (authStatus === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
        Checking session...
      </div>
    )
  }

  return (
    <>
    <Toaster position="bottom-right" />
    <Routes>
      <Route path="/" element={
        <LandingPage
          restrictAccess={restrictAccess}
          tournamentName={tournamentName}
          onLogin={() => window.location.assign(getApiUrl(restrictAccess ? "/api/auth/osu/login" : "/api/auth/bypass"))}
        />
      } />
      <Route path="/dashboard" element={
        <DashboardPage
          currentUserName={sessionUser?.username ?? "Referee"}
          tournamentName={tournamentName}
          abbreviation={abbreviation}
          testMode={testMode}
          onOpenMatch={(m) => navigate(`/match/${m.id}`, { state: { match: m } })}
          onLogout={() => { void logout() }}
        />
      } />
      <Route path="/match/:matchId" element={<MatchPanelRoute onBack={() => navigate("/dashboard")} isDemo={sessionUser?.osu_id === 0} testMode={testMode} />} />
      <Route path="/error/:code" element={<ErrorRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}

export default App
