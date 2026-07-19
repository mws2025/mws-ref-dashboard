import { defineCloudflareConfig } from "@opennextjs/cloudflare"
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache"
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue"

export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  // Without a queue, background ISR revalidation falls back to a DummyQueue
  // that throws "Dummy queue is not implemented" once a cached page goes
  // stale. memory-queue just needs a self-referencing service binding
  // (WORKER_SELF_REFERENCE in wrangler.jsonc) — no separate Cloudflare Queue.
  queue: memoryQueue,
})
