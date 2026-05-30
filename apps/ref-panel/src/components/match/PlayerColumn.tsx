import { useState } from "react"
import { Check, Pencil } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { INGREDIENTS } from "@/data/constants"
import type { IngKey, Inventory, MatchStatus } from "@/types"

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
  return (
    <div className="mt-2 rounded-md border border-border/60 bg-muted/30 px-2 py-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Ingredients</span>
        <button
          className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onToggleEdit}
        >
          {editing ? <><Check className="h-2.5 w-2.5" /> Done</> : <><Pencil className="h-2.5 w-2.5" /> Edit</>}
        </button>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {INGREDIENTS.map(({ key, name, hex, icon }) => (
          <div key={key} className="flex flex-col items-center gap-0.5">
            <img
              src={`/assets/Ingredients/${icon}.png`}
              alt={name}
              className="h-6 w-6 object-contain select-none"
              draggable={false}
            />
            {editing ? (
              <div className="flex w-full flex-col items-center">
                <button
                  className="flex h-4 w-full items-center justify-center rounded text-[11px] leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => onChange?.(key, +1)}
                >+</button>
                <span className="font-mono text-xs font-bold tabular-nums leading-none" style={{ color: hex }}>
                  {inv[key] ?? 0}
                </span>
                <button
                  className="flex h-4 w-full items-center justify-center rounded text-[11px] leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => onChange?.(key, -1)}
                >-</button>
              </div>
            ) : (
              <span className="font-mono text-[10px] font-semibold tabular-nums" style={{ color: hex }}>
                x{inv[key] ?? 0}
              </span>
            )}
          </div>
        ))}
      </div>
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
  matchStatus?: MatchStatus
  hasLobby?: boolean
  isDemo?: boolean
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
  matchStatus, hasLobby = false, isDemo = false, testResultUnlocked = false,
}: Props) {
  const winsNeeded = Math.ceil(bestOf / 2)
  const isFinished = matchStatus === "completed" || matchStatus === "forfeit"
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
        <div className="space-y-2 border-b border-border p-4">
          <div className="flex items-baseline justify-between">
            <span className="font-heading text-sm font-semibold">{playerA}</span>
            {invLoading ? <Skeleton className="h-7 w-8" /> : <span className="font-heading text-3xl leading-none">{scoreA}</span>}
          </div>
          {invLoading ? <Skeleton className="h-3 w-28" /> : <WinBoxes score={scoreA} needed={winsNeeded} />}
          {invLoading
            ? <Skeleton className="h-14 w-full mt-2" />
            : <IngredientBar inv={invA} editing={editingPlayer === "a"} onChange={isDemo ? undefined : onInvAChange} onToggleEdit={isDemo ? undefined : () => setEditingPlayer(editingPlayer === "a" ? null : "a")} />
          }
        </div>

        <div className="flex items-center justify-center py-2">
          <span className="font-accent text-sm text-muted-foreground">vs</span>
        </div>

        {/* Player B */}
        <div className="space-y-2 border-b border-border p-4">
          <div className="flex items-baseline justify-between">
            <span className="font-heading text-sm font-semibold">{playerB}</span>
            {invLoading ? <Skeleton className="h-7 w-8" /> : <span className="font-heading text-3xl leading-none">{scoreB}</span>}
          </div>
          {invLoading ? <Skeleton className="h-3 w-28" /> : <WinBoxes score={scoreB} needed={winsNeeded} />}
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
        <Button size="sm" variant="outline" className="w-full text-xs" disabled={isDemo || hasLobby} onClick={() => setConfirmAction("create")}>Create lobby</Button>
        <Button size="sm" variant="outline" className="w-full text-xs" disabled={isDemo || hasLobby} onClick={() => setJoinOpen(true)}>Join existing</Button>
        <Button size="sm" variant="outline" className="w-full text-xs" disabled={isDemo || hasLobby} onClick={() => setConfirmAction("reminder")}>Match reminder</Button>
        <Separator className="my-1" />
        {/* Result */}
        <Button size="sm" variant="outline" className="w-full text-xs" disabled={isDemo || (!isFinished && !testResultUnlocked)} onClick={() => setConfirmAction("result")}>Post match result</Button>
        <Separator className="my-1" />
        {/* Danger */}
        <Button size="sm" variant="outline" className="w-full text-xs border-destructive/40 text-destructive/80 hover:border-destructive hover:text-destructive hover:bg-destructive/5" disabled={isDemo || isFinished} onClick={() => setForfeitOpen(true)}>Set forfeit</Button>
        <Button size="sm" variant="destructive" className="w-full text-xs" disabled={isDemo || !hasLobby} onClick={() => setConfirmAction("close")}>Close lobby</Button>
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
