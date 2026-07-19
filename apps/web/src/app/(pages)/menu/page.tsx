import { EmptyState } from "@/components/EmptyState"

export default function Menu() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <EmptyState
        src="/PastrySketch.png"
        alt=""
        title="Coming soon"
        description="This page is still in the oven. Check back soon."
      />
    </main>
  )
}
