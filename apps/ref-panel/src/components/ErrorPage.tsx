import { Button } from "@/components/ui/button"

const ERROR_META: Record<number, { title: string; desc: string }> = {
  400: { title: "Bad Request",           desc: "The server couldn't understand the request." },
  401: { title: "Unauthorized",          desc: "You need to log in to access this page." },
  403: { title: "Forbidden",             desc: "You don't have permission to access this." },
  404: { title: "Not Found",             desc: "The page you're looking for doesn't exist." },
  429: { title: "Too Many Requests",     desc: "Slow down - you've been rate limited." },
  500: { title: "Server Error",          desc: "Something went wrong on our end." },
  502: { title: "Bad Gateway",           desc: "The server received an invalid response upstream." },
  503: { title: "Service Unavailable",   desc: "The server is temporarily down. Try again soon." },
  504: { title: "Gateway Timeout",       desc: "The upstream server took too long to respond." },
}

interface Props {
  code: number
  onBack?: () => void
}

export function ErrorPage({ code, onBack }: Props) {
  const meta = ERROR_META[code] ?? { title: "Unexpected Error", desc: "Something went wrong." }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background text-foreground">
      <img src="/assets/logo_light.png" alt="Whisked 2026" className="h-12 w-auto object-contain opacity-60" />
      <p className="font-heading text-7xl font-bold text-primary/40">{code}</p>
      <div className="text-center">
        <p className="font-heading text-xl">{meta.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{meta.desc}</p>
      </div>
      {onBack && (
        <Button variant="outline" size="sm" onClick={onBack}>
          Go back
        </Button>
      )}
    </div>
  )
}
