import { useState } from "react"
import { Check, Pencil } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { HOME_MODS, INGREDIENTS } from "@/data/constants"
import type { HomeMod, IngKey, Inventory, MatchStatus } from "@/types"

function WinBoxes({ score, needed }: { score: number; needed: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: needed }).map((_, i) => (
        <div
          key={i}
          className={`h-4 w-4 rounded-sm border ${i < score ? "border-primary bg-primary" : "border-border bg-transparent"}`}
        />
      ))}
    </div>
  )
}

function IngredientBar({ inv, editing, onChange, onToggleEdit }: { inv: Inventory; editing?: boolean; onChange?: (key: IngKey, delta: number) => void; onToggleEdit?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2 rounded-md border border-border/60 bg-muted/30 px-2 py-2">
      <div className={`flex items-center justify-between ${open ? "mb-2" : ""}`}>
        <button
          className="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
          onClick={() => setOpen((v) => !v)}
        >
          <span>{open ? "▾" : "▸"}</span>
          <span>Ingredients</span>
        </button>
        {open && (
          <button
            className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onToggleEdit}
          >
            {editing ? <><Check className="h-2.5 w-2.5" /> Done</> : <><Pencil className="h-2.5 w-2.5" /> Edit</>}
          </button>
        )}
      </div>
      {open && <div className="flex flex-col gap-1">
        {INGREDIENTS.map(({ key, name, hex, icon }) => (
          <div key={key} className="flex items-center gap-2">
            <img
              src={`/assets/Ingredients/${icon}.png`}
              alt={name}
              className="h-7 w-7 flex-shrink-0 object-contain select-none"
              draggable={false}
            />
            <span className="flex-1 text-xs text-muted-foreground">{name}</span>
            {editing ? (
              <div className="flex items-center gap-1">
                <button
                  className="flex h-5 w-5 items-center justify-center rounded text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => onChange?.(key, -1)}
                >-</button>
                <span className="font-mono text-xs font-bold tabular-nums w-5 text-center" style={{ color: hex }}>
                  {inv[key] ?? 0}
                </span>
                <button
                  className="flex h-5 w-5 items-center justify-center rounded text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => onChange?.(key, +1)}
                >+</button>
              </div>
            ) : (
              <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: hex }}>
                x{inv[key] ?? 0}
              </span>
            )}
          </div>
        ))}
      </div>}
    </div>
  )
}

function HomeModControl({
  value,
  canChoose,
  onSelect,
  onClear,
}: {
  value?: HomeMod
  canChoose?: boolean
  onSelect?: (homeMod: HomeMod) => void
  onClear?: () => void
}) {
  return (
    <div className="mt-2 rounded-md border border-border/60 bg-card/35 px-2 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Home mod</span>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[10px] font-semibold text-foreground">{value ?? "Unset"}</span>
          {value && onClear && (
            <button
              type="button"
              className="flex h-3.5 w-3.5 items-center justify-center rounded text-[10px] text-muted-foreground/60 hover:bg-muted hover:text-foreground"
              onClick={onClear}
              title="Undo home mod"
            >×</button>
          )}
        </div>
      </div>
      {canChoose && (
        <div className="grid grid-cols-5 gap-1">
          {HOME_MODS.map((mod) => {
            const selected = value === mod.key
            return (
              <button
                key={mod.key}
                type="button"
                className={`h-6 rounded border px-0.5 font-mono text-[10px] transition-colors ${
                  selected ? "bg-muted text-foreground" : "bg-background text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                }`}
                style={{ borderColor: selected ? mod.hex : `${mod.hex}66` }}
                onClick={() => onSelect?.(mod.key)}
              >
                {mod.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

type LobbyConfirm = "create" | "close" | "result" | "reminder"

interface Props {
  playerA: string
  playerB: string
  scoreA: number
  scoreB: number
  bestOf: number
  invA: Inventory
  invB: Inventory
  invLoading?: boolean
  round: string
  refName: string
  streamer?: string
  onInvAChange?: (key: IngKey, delta: number) => void
  onInvBChange?: (key: IngKey, delta: number) => void
  onCreateLobby?: () => void
  onJoinLobby?: (mpId: string) => void
  onCloseLobby?: () => void
  onPostResult?: () => void
  onSendReminder?: () => void
  onForfeit?: (winner: string) => void
  homeModA?: HomeMod
  homeModB?: HomeMod
  homeModTurnPlayer?: string
  onHomeModSelect?: (player: string, homeMod: HomeMod) => void
  onClearHomeMod?: (player: string) => void
  onScoreAEdit?: (val: number) => void
  onScoreBEdit?: (val: number) => void
  matchStatus?: MatchStatus
  hasLobby?: boolean
  isDemo?: boolean
  postResultReady?: boolean
  testResultUnlocked?: boolean
}

const LOBBY_CONFIRM_CONFIG: Record<LobbyConfirm, { title: string; description: string; actionLabel: string; destructive?: boolean }> = {
  create:   { title: "Create lobby",        description: "This will create a new osu! multiplayer lobby for this match.",                                actionLabel: "Create"        },
  close:    { title: "Close lobby",         description: "This will close the osu! lobby. This action cannot be undone.",                                actionLabel: "Close lobby",  destructive: true },
  result:   { title: "Post match result",   description: "This will post the final match result to the tournament sheet. Make sure scores are correct.", actionLabel: "Post result"   },
  reminder: { title: "Send match reminder", description: "Posts a reminder ping to the reminder channel with estimated time until match start.",        actionLabel: "Send reminder" },
}

export function PlayerColumn({
  playerA, playerB, scoreA, scoreB, bestOf,
  invA, invB, invLoading,
  round, refName, streamer,
  onInvAChange, onInvBChange,
  onCreateLobby, onJoinLobby, onCloseLobby, onPostResult, onSendReminder, onForfeit,
  homeModA, homeModB, homeModTurnPlayer, onHomeModSelect, onClearHomeMod,
  onScoreAEdit, onScoreBEdit,
  matchStatus, hasLobby = false, isDemo = false, postResultReady = false, testResultUnlocked = false,
}: Props) {
  const winsNeeded = Math.ceil(bestOf / 2)
  const isFinished = matchStatus === "completed" || matchStatus === "forfeit"
  const canPostResult = !isDemo && hasLobby && (isFinished || postResultReady || testResultUnlocked)
  const [editingPlayer, setEditingPlayer] = useState<"a" | "b" | null>(null)
  const [confirmAction, setConfirmAction] = useState<LobbyConfirm | null>(null)
  const [joinOpen, setJoinOpen] = useState(false)
  const [mpIdInput, setMpIdInput] = useState("")
  const [forfeitOpen, setForfeitOpen] = useState(false)

  function handleJoinConfirm() {
    const cleaned = mpIdInput.trim().replace(/^#?mp_?/i, "")
    if (cleaned) onJoinLobby?.(cleaned)
    setJoinOpen(false)
    setMpIdInput("")
  }

  function handleConfirmAction() {
    if (confirmAction === "create")   onCreateLobby?.()
    if (confirmAction === "close")    onCloseLobby?.()
    if (confirmAction === "result")   onPostResult?.()
    if (confirmAction === "reminder") onSendReminder?.()
    setConfirmAction(null)
  }

  return (
    <aside className="flex w-52 flex-shrink-0 flex-col border-r border-border">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Player A */}
        <div className="space-y-2 border-b border-border px-4 pb-4 pt-4">
          <div className="flex min-h-9 items-start justify-between gap-2">
            <span className="min-w-0 break-words pt-1 font-heading text-sm font-semibold leading-tight">{playerA}</span>
            {invLoading ? <Skeleton className="h-7 w-8" /> : (
              <div className="flex items-center gap-1">
                <button
                  className="flex h-5 w-5 items-center justify-center rounded border border-border/60 text-xs text-muted-foreground hover:border-border hover:text-foreground disabled:opacity-30"
                  disabled={isDemo || scoreA <= 0}
                  onClick={() => onScoreAEdit?.(scoreA - 1)}
                >−</button>
                <span className="w-6 text-center font-heading text-3xl leading-none tabular-nums">{scoreA}</span>
                <button
                  className="flex h-5 w-5 items-center justify-center rounded border border-border/60 text-xs text-muted-foreground hover:border-border hover:text-foreground disabled:opacity-30"
                  disabled={isDemo}
                  onClick={() => onScoreAEdit?.(scoreA + 1)}
                >+</button>
              </div>
            )}
          </div>
          {invLoading ? <Skeleton className="h-3 w-28" /> : <WinBoxes score={scoreA} needed={winsNeeded} />}
          <HomeModControl
            value={homeModA}
            canChoose={!isDemo && homeModTurnPlayer?.toLowerCase() === playerA.toLowerCase()}
            onSelect={(homeMod) => onHomeModSelect?.(playerA, homeMod)}
            onClear={!isDemo && homeModA ? () => onClearHomeMod?.(playerA) : undefined}
          />
          {invLoading
            ? <Skeleton className="h-14 w-full mt-2" />
            : <IngredientBar inv={invA} editing={editingPlayer === "a"} onChange={isDemo ? undefined : onInvAChange} onToggleEdit={isDemo ? undefined : () => setEditingPlayer(editingPlayer === "a" ? null : "a")} />
          }
        </div>

        {/* Player B */}
        <div className="space-y-2 border-b border-border px-4 pb-4 pt-4">
          <div className="flex min-h-9 items-start justify-between gap-2">
            <span className="min-w-0 break-words pt-1 font-heading text-sm font-semibold leading-tight">{playerB}</span>
            {invLoading ? <Skeleton className="h-7 w-8" /> : (
              <div className="flex items-center gap-1">
                <button
                  className="flex h-5 w-5 items-center justify-center rounded border border-border/60 text-xs text-muted-foreground hover:border-border hover:text-foreground disabled:opacity-30"
                  disabled={isDemo || scoreB <= 0}
                  onClick={() => onScoreBEdit?.(scoreB - 1)}
                >−</button>
                <span className="w-6 text-center font-heading text-3xl leading-none tabular-nums">{scoreB}</span>
                <button
                  className="flex h-5 w-5 items-center justify-center rounded border border-border/60 text-xs text-muted-foreground hover:border-border hover:text-foreground disabled:opacity-30"
                  disabled={isDemo}
                  onClick={() => onScoreBEdit?.(scoreB + 1)}
                >+</button>
              </div>
            )}
          </div>
          {invLoading ? <Skeleton className="h-3 w-28" /> : <WinBoxes score={scoreB} needed={winsNeeded} />}
          <HomeModControl
            value={homeModB}
            canChoose={!isDemo && homeModTurnPlayer?.toLowerCase() === playerB.toLowerCase()}
            onSelect={(homeMod) => onHomeModSelect?.(playerB, homeMod)}
            onClear={!isDemo && homeModB ? () => onClearHomeMod?.(playerB) : undefined}
          />
          {invLoading
            ? <Skeleton className="h-14 w-full mt-2" />
            : <IngredientBar inv={invB} editing={editingPlayer === "b"} onChange={isDemo ? undefined : onInvBChange} onToggleEdit={isDemo ? undefined : () => setEditingPlayer(editingPlayer === "b" ? null : "b")} />
          }
        </div>

        {/* Match meta */}
        <div className="space-y-1.5 p-4 text-xs text-muted-foreground">
          <p><span className="font-heading uppercase tracking-[0.12em] text-foreground">Format</span> <span className="ml-1">Bo{bestOf}</span></p>
          <p><span className="font-heading uppercase tracking-[0.12em] text-foreground">Round</span> <span className="ml-1">{round}</span></p>
          <p><span className="font-heading uppercase tracking-[0.12em] text-foreground">Ref</span> <span className="ml-1">{refName}</span></p>
          {streamer && <p><span className="font-heading uppercase tracking-[0.12em] text-foreground">Streamer</span> <span className="ml-1">{streamer}</span></p>}
        </div>

        {/* Pool legend */}
        <div className="border-t border-border p-4">
          <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Ingredient key</p>
          <div className="space-y-0.5">
            {INGREDIENTS.map(({ name, pool, icon }) => (
              <div key={name} className="flex items-center gap-2 py-0.5">
                <img
                  src={`/assets/Ingredients/${icon}.png`}
                  alt={name}
                  className="h-4 w-4 flex-shrink-0 object-contain select-none"
                  draggable={false}
                />
                <span className="flex-1 text-xs text-muted-foreground">{name}</span>
                <span className="font-mono text-[10px] text-muted-foreground/50">{pool}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lobby manage - pinned to bottom */}
      <div className="flex-shrink-0 space-y-1.5 border-t border-border p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-heading text-xs uppercase tracking-[0.16em] text-muted-foreground">Lobby</p>
          {isDemo && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">demo</span>}
        </div>
        {/* Setup */}
        {!hasLobby && (
          <>
            <Button size="sm" variant="outline" className="w-full text-xs" disabled={isDemo} onClick={() => setConfirmAction("create")}>Create lobby</Button>
            <Button size="sm" variant="outline" className="w-full text-xs" disabled={isDemo} onClick={() => setJoinOpen(true)}>Join existing</Button>
          </>
        )}
        <Button size="sm" variant="outline" className="w-full text-xs" disabled={isDemo} onClick={() => setConfirmAction("reminder")}>Match reminder</Button>
        <Separator className="my-1" />
        {/* Result */}
        <Button size="sm" variant="outline" className="w-full text-xs" disabled={!canPostResult} onClick={() => setConfirmAction("result")}>Post match result</Button>
        <Separator className="my-1" />
        {/* Danger */}
        {!isFinished && (
          <Button size="sm" variant="outline" className="w-full text-xs border-destructive/40 text-destructive/80 hover:border-destructive hover:text-destructive hover:bg-destructive/5" disabled={isDemo} onClick={() => setForfeitOpen(true)}>Set forfeit</Button>
        )}
        {hasLobby && (
          <Button size="sm" variant="destructive" className="w-full text-xs" disabled={isDemo} onClick={() => setConfirmAction("close")}>Close lobby</Button>
        )}
      </div>

      {/* Confirmation dialogs */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null) }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction ? LOBBY_CONFIRM_CONFIG[confirmAction].title : ""}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction ? LOBBY_CONFIRM_CONFIG[confirmAction].description : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              size="sm"
              variant={confirmAction === "close" ? "destructive" : "default"}
              onClick={handleConfirmAction}
            >
              {confirmAction ? LOBBY_CONFIRM_CONFIG[confirmAction].actionLabel : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Join lobby dialog */}
      <Dialog open={joinOpen} onOpenChange={(open) => { if (!open) { setJoinOpen(false); setMpIdInput("") } }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Join existing lobby</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="#mp_12345678"
            value={mpIdInput}
            onChange={(e) => setMpIdInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleJoinConfirm() }}
            autoFocus
          />
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => { setJoinOpen(false); setMpIdInput("") }}>Cancel</Button>
            <Button size="sm" disabled={!mpIdInput.trim()} onClick={handleJoinConfirm}>Join</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Forfeit dialog */}
      <Dialog open={forfeitOpen} onOpenChange={setForfeitOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Set forfeit - who wins?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">The other player will receive a score of −1. Match status will be set to forfeit.</p>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs"
              onClick={() => { onForfeit?.(playerA); setForfeitOpen(false) }}
            >
              {playerA} wins
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs"
              onClick={() => { onForfeit?.(playerB); setForfeitOpen(false) }}
            >
              {playerB} wins
            </Button>
          </div>
          <DialogFooter>
            <Button size="sm" variant="ghost" className="w-full text-xs text-muted-foreground" onClick={() => setForfeitOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
