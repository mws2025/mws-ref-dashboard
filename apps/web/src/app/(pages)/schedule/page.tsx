import { EmptyState } from "@/components/EmptyState"

export default function Schedule() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <EmptyState
        src="/BreadSketch.png"
        alt=""
        title="Coming soon"
        description="The schedule is still being plated. Check back soon."
      />
    </main>
  )
}
