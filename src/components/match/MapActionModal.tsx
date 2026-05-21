import { Dialog } from "radix-ui"
import { Button } from "@/components/ui/button"
import { POOL_CONFIG } from "@/data/constants"
import type { PoolMap } from "@/types"

type Action = "pick" | "ban" | "protect"

interface Props {
  map: PoolMap | null
  playerA: string
  playerB: string
  onClose: () => void
  onAction: (action: Action, player: string) => void
}

export function MapActionModal({ map, playerA, playerB, onClose, onAction }: Props) {
  return (
    <Dialog.Root open={map !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {map && (
            <>
              <Dialog.Title className="font-heading text-sm font-semibold">
                <span style={{ color: POOL_CONFIG[map.pool].hex === "#ffffff" ? "var(--muted-foreground)" : POOL_CONFIG[map.pool].hex }}>
                  {map.slot}
                </span>
                {" — "}
                <span className="text-foreground">{map.map}</span>
              </Dialog.Title>

              <div className="mt-4 space-y-2">
                {(["pick", "ban", "protect"] as const).map((action) => (
                  <div key={action} className="flex items-center gap-2">
                    <span className="w-14 text-xs capitalize text-muted-foreground">{action}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={() => { onAction(action, playerA); onClose() }}
                    >
                      {playerA}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={() => { onAction(action, playerB); onClose() }}
                    >
                      {playerB}
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="mt-3 w-full text-xs text-muted-foreground"
                onClick={onClose}
              >
                Cancel
              </Button>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
