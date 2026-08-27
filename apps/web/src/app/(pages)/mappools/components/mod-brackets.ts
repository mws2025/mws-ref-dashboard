import type { ModBracket } from "@/server/data/mappools"

type BracketStyle = {
  label: string
  /**
   * Section-heading accent. These are the exact fills from the matching
   * `public/tag-*.svg`, so the heading rule and the card's bookmark tag always
   * read as the same colour. Two of them (DT, TB) have no theme token, so all
   * six are written as literals rather than mixing tokens and hexes.
   */
  accent: string
}

// Keys mirror the sheet's own mod enum (Settings rows 29-34).
export const BRACKET_STYLES: Record<ModBracket, BracketStyle> = {
  NM: { label: "No Mod", accent: "bg-[#4E6A7A]" },
  PS: { label: "Pooler Slot", accent: "bg-[#957259]" },
  HR: { label: "Hard Rock", accent: "bg-[#8D3F38]" },
  DT: { label: "Double Time", accent: "bg-[#634E7A]" },
  FM: { label: "Free Mod", accent: "bg-[#5F7F63]" },
  TB: { label: "Tiebreaker", accent: "bg-[#454545]" },
}

export function bracketStyle(bracket: ModBracket): BracketStyle {
  return BRACKET_STYLES[bracket] ?? { label: bracket, accent: "bg-caramel" }
}

/**
 * Bookmark tag art for a slot. One file exists per member of MOD_BRACKETS,
 * so this always resolves.
 */
export function tagSrc(bracket: ModBracket): string {
  return `/tag-${bracket.toLowerCase()}.svg`
}

/**
 * The tag art is 90x100, but its solid body ends at y=71.64 — below that are
 * the two ribbon tails either side of the V-notch. Slot text centres on the
 * body, not the full height, or it sits visibly low.
 */
export const TAG_BODY_HEIGHT = "85%"
