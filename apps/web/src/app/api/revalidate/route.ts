import { revalidateTag } from "next/cache"
import { getEnv } from "@/server/env"
import { TAGS } from "@/server/data"

const VALID_TAGS = new Set<string>(Object.values(TAGS))

// Called by a Google Apps Script onEdit trigger, one per source sheet:
//   POST /api/revalidate?secret=…&tag=matches
export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const secret = url.searchParams.get("secret")
  const tag = url.searchParams.get("tag")

  const env = await getEnv()
  if (!env.REVALIDATE_SECRET || secret !== env.REVALIDATE_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!tag || !VALID_TAGS.has(tag)) {
    return Response.json({ error: "unknown tag" }, { status: 400 })
  }

  // "max" = stale-while-revalidate: next visitor gets last-good instantly,
  // fresh data fetched in the background.
  revalidateTag(tag, "max")
  return Response.json({ revalidated: tag })
}
