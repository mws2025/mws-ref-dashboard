import { EmptyState } from "@/components/EmptyState"

export default function Mappools() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <EmptyState
        src="/PieSketch.png"
        alt=""
        title="Coming soon"
        description="The mappool isn't ready to serve yet. Check back soon."
      />
    </main>
  )
}
