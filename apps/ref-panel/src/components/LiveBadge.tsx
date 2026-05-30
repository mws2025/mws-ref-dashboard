export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-foreground/70" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary-foreground" />
      </span>
      Live
    </span>
  )
}
