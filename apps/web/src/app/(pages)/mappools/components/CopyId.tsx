"use client"

import { useEffect, useRef, useState } from "react"

const RESET_MS = 1200

/**
 * The beatmap id as a copy button — players paste it straight into osu!'s
 * chat/search rather than reading it off the screen digit by digit.
 *
 * Copying can fail for reasons the page can't control (no clipboard
 * permission, an insecure origin), so success is only claimed once the write
 * actually resolves; a rejection leaves the id on screen untouched.
 */
export function CopyId({ id }: { id: number }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A card unmounting mid-flash (stage switch) would otherwise set state on a
  // gone component.
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(String(id))
    } catch {
      return
    }
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), RESET_MS)
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy beatmap ID"
      // Colour is inherited from the card shell, so this works on both the
      // light and the dark treatment without knowing which it is on.
      className="focus-visible:ring-ring/50 flex cursor-pointer flex-col items-center rounded-sm leading-tight transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="text-[0.625rem] tracking-wide uppercase">ID</span>
      {/* `min-w` reserves room for the widest of the two states so the stats
          row doesn't shift when the confirmation swaps in. */}
      <span className="min-w-[7ch] text-center text-sm font-medium tabular-nums">
        {copied ? "Copied!" : id}
      </span>
      {/* The visual swap above is inside a button, which screen readers
          announce on focus, not on change — so state gets its own live region. */}
      <span aria-live="polite" className="sr-only">
        {copied ? `Beatmap ID ${id} copied` : ""}
      </span>
    </button>
  )
}
