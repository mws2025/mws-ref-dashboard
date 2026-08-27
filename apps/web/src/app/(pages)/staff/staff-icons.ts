// Hand-made avatars that override (or stand in for) a staff member's osu!
// profile picture.
//
// Keyed by discord handle — the one identifier every staff row has, including
// members with no linked osu! id, for whom this is the only avatar available.
// Discord handles are lowercase, and so are the filenames; the lookup lowers
// the sheet value anyway so a stray capital in the sheet still matches.
//
// Files live in `public/staff-icons/`; full-res originals are kept in
// `.extras/public/staff-icons/`.
//
// This is a static map on purpose: the deploy target (OpenNext on Cloudflare)
// serves `public/` as uploaded assets, so there's no filesystem to scan at
// request time. Adding an override means dropping in the webp and adding a
// line here.
const STAFF_ICONS: Record<string, string> = {
  _yukeuii: "/staff-icons/_yukeuii.webp",
  aiyru: "/staff-icons/aiyru.webp",
  arushii: "/staff-icons/arushii.webp",
  cocoball: "/staff-icons/cocoball.webp",
  cocorhi: "/staff-icons/cocorhi.webp",
  they: "/staff-icons/they.webp",
}

// osu!'s own guest avatar — byte-for-byte what a.ppy.sh serves for an id that
// doesn't resolve, so a member with no osu! account and no custom file looks
// exactly like one with a bad id rather than like a broken image.
export const FALLBACK_AVATAR = "https://osu.ppy.sh/images/layout/avatar-guest.png"

/**
 * Avatar for a staff member, in priority order:
 *   1. a custom file in `public/staff-icons/`, matched on their discord handle
 *   2. their osu! avatar, if an osu! id is linked
 *   3. osu!'s guest placeholder
 */
export function getStaffAvatar(discord: string, id: number | null): string {
  const custom = STAFF_ICONS[discord.trim().toLowerCase()]
  if (custom) return custom
  if (id !== null) return `https://a.ppy.sh/${id}`
  return FALLBACK_AVATAR
}
