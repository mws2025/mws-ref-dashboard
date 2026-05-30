import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { IRC_BOT } from "@/data/mock"
import type { PoolMap } from "@/types"

interface Props {
  playerA: string
  playerB: string
  refName: string
  mappool: PoolMap[] | null
  channel: string | undefined
  onInjectMessage: (from: string, message: string, local?: boolean) => void
  onGameResult: (slot: string, winner: string, scoreA: number, scoreB: number) => void
  onUnlockPostResult: () => void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{children}</p>
}

function Done() {
  return <span className="text-[10px] text-[#5f7f63]">✓</span>
}

export function TestSimPanel({
  playerA, playerB, refName, mappool, channel,
  onInjectMessage, onGameResult, onUnlockPostResult,
}: Props) {
  const [joinsSimulated, setJoinsSimulated] = useState(false)
  const [rollsDone, setRollsDone] = useState(false)
  const [rollA, setRollA] = useState<number | null>(null)
  const [rollB, setRollB] = useState<number | null>(null)
  const [resultUnlocked, setResultUnlocked] = useState(false)
  const [resultedSlots, setResultedSlots] = useState<Set<string>>(new Set())

  const hasChannel = Boolean(channel)
  const availableMaps = mappool?.filter(m => m.status === "available") ?? []
  const activePicks   = mappool?.filter(m => m.status === "picked" && !resultedSlots.has(m.slot)) ?? []

  function simulateJoins() {
    onInjectMessage("BanchoBot", `${playerA} joined in slot 1.`)
    setTimeout(() => onInjectMessage("BanchoBot", `${playerB} joined in slot 2.`), 800)
    setJoinsSimulated(true)
  }

  function simulateRolls() {
    const a = Math.floor(Math.random() * 100) + 1
    const b = Math.floor(Math.random() * 100) + 1
    setRollA(a); setRollB(b)
    onInjectMessage("BanchoBot", `${playerA} rolled ${a} point(s)`)
    setTimeout(() => onInjectMessage("BanchoBot", `${playerB} rolled ${b} point(s)`), 600)
    setRollsDone(true)
  }

  function simulateBanChat(player: string, slot: string) {
    onInjectMessage(player, `ban ${slot}`)
  }

  function injectPickNext(player: string) {
    onInjectMessage(IRC_BOT, `<${refName}>: ${player} to pick next!`, true)
  }

  function simulateResult(slot: string, winner: string) {
    const loser = winner === playerA ? playerB : playerA
    const winScore  = 800000 + Math.floor(Math.random() * 400000)
    const loseScore = 400000 + Math.floor(Math.random() * Math.min(winScore - 400001, 350000))

    onInjectMessage("BanchoBot", `${winner} finished playing (Score: ${winScore.toLocaleString()}, PASSED).`)
    setTimeout(() => {
      onInjectMessage("BanchoBot", `${loser} finished playing (Score: ${loseScore.toLocaleString()}, PASSED).`)
    }, 350)

    setResultedSlots(prev => new Set([...prev, slot]))
    onGameResult(
      slot,
      winner,
      winner === playerA ? winScore : loseScore,
      winner === playerB ? winScore : loseScore,
    )
  }

  return (
    <div className="space-y-5">
      <p className="font-heading text-xs uppercase tracking-[0.16em] text-muted-foreground">Simulation</p>

      {/* Lobby joins */}
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5">
          <SectionLabel>Lobby</SectionLabel>
          {joinsSimulated && <Done />}
        </p>
        <Button
          size="sm" variant="outline" className="w-full text-xs"
          disabled={!hasChannel || joinsSimulated}
          onClick={simulateJoins}
        >
          Simulate player joins
        </Button>
      </div>

      <Separator />

      {/* Rolls */}
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5">
          <SectionLabel>Rolls</SectionLabel>
          {rollsDone && <Done />}
        </p>
        <Button
          size="sm" variant="outline" className="w-full text-xs"
          disabled={!hasChannel || rollsDone}
          onClick={simulateRolls}
        >
          Simulate rolls
        </Button>
        {rollA !== null && rollB !== null && (
          <div className="rounded-md border border-border/60 bg-card/40 px-2.5 py-2 space-y-0.5">
            <p className="text-xs text-muted-foreground">{playerA} <span className="font-semibold tabular-nums text-foreground">{rollA}</span></p>
            <p className="text-xs text-muted-foreground">{playerB} <span className="font-semibold tabular-nums text-foreground">{rollB}</span></p>
            <p className="text-[10px] text-muted-foreground/50">
              {rollA === rollB ? "Tie - re-roll needed" : `${rollA > rollB ? playerA : playerB} picks first`}
            </p>
          </div>
        )}
      </div>

      <Separator />

      {/* Ban declarations */}
      <div className="space-y-1.5">
        <SectionLabel>Ban declarations</SectionLabel>
        <p className="text-[10px] text-muted-foreground/50">Injects player chat. Record bans in mappool manually.</p>
        {!mappool ? (
          <p className="text-xs text-muted-foreground/50 italic">Mappool loading…</p>
        ) : availableMaps.length === 0 ? (
          <p className="text-xs text-muted-foreground/50">No available maps.</p>
        ) : (
          <div className="space-y-2">
            {([playerA, playerB] as const).map((player, idx) => (
              <div key={player} className="space-y-1">
                <p className="text-[10px] text-muted-foreground">P{idx + 1} - {player}</p>
                <div className="flex flex-wrap gap-1">
                  {availableMaps.map(m => (
                    <button
                      key={m.slot}
                      onClick={() => simulateBanChat(player, m.slot)}
                      className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-[#a4564e]/60 hover:text-[#a4564e]"
                    >
                      {m.slot}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Next to pick */}
      <div className="space-y-1.5">
        <SectionLabel>Next to pick</SectionLabel>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 text-xs" disabled={!hasChannel} onClick={() => injectPickNext(playerA)}>
            {playerA}
          </Button>
          <Button size="sm" variant="outline" className="flex-1 text-xs" disabled={!hasChannel} onClick={() => injectPickNext(playerB)}>
            {playerB}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Game results */}
      <div className="space-y-1.5">
        <SectionLabel>Game results</SectionLabel>
        <p className="text-[10px] text-muted-foreground/50">Pick a map in the mappool first, then simulate its result here.</p>
        {!mappool ? (
          <p className="text-xs text-muted-foreground/50 italic">Mappool loading…</p>
        ) : activePicks.length === 0 ? (
          <p className="text-xs text-muted-foreground/50">No picked maps awaiting result.</p>
        ) : (
          <div className="space-y-2">
            {activePicks.map(m => (
              <div key={m.slot} className="rounded-md border border-border/60 bg-card/30 px-2.5 py-2 space-y-1.5">
                <p className="text-[10px] font-heading font-bold text-muted-foreground">{m.slot}</p>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px]" onClick={() => simulateResult(m.slot, playerA)}>
                    {playerA} wins
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px]" onClick={() => simulateResult(m.slot, playerB)}>
                    {playerB} wins
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Unlock post result */}
      <div className="space-y-1.5">
        <SectionLabel>Match finish</SectionLabel>
        <Button
          size="sm"
          variant={resultUnlocked ? "secondary" : "outline"}
          className="w-full text-xs"
          disabled={resultUnlocked}
          onClick={() => { setResultUnlocked(true); onUnlockPostResult() }}
        >
          {resultUnlocked ? "Post result unlocked ✓" : "Unlock post result"}
        </Button>
      </div>
    </div>
  )
}
