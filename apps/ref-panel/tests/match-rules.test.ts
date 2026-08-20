import { describe, expect, test } from "bun:test"
import {
  addLobbyMod,
  homeModIngredientCount,
  lobbyModsForPool,
  nextPlayerAfterPick,
  parseRollAnnouncement,
} from "../src/lib/match-rules.ts"

describe("roll announcements", () => {
  test("parses current and legacy Bancho wording", () => {
    expect(parseRollAnnouncement("Cinnamon Twist rolls 85 point(s)")).toEqual({
      player: "Cinnamon Twist",
      value: 85,
    })
    expect(parseRollAnnouncement("iiMegxnx rolled 78 point(s).")).toEqual({
      player: "iiMegxnx",
      value: 78,
    })
  })

  test("rejects invalid roll values", () => {
    expect(parseRollAnnouncement("Player rolls 0 point(s)")).toBeNull()
    expect(parseRollAnnouncement("Player rolls 101 point(s)")).toBeNull()
  })
})

describe("lobby mods", () => {
  test("adds NF as a separate command argument", () => {
    expect(lobbyModsForPool("HR", true)).toBe("HR NF")
    expect(lobbyModsForPool("DT", true)).toBe("DT NF")
    expect(lobbyModsForPool("FM", true)).toBe("Freemod NF")
    expect(lobbyModsForPool("TB", true)).toBe("Freemod NF")
    expect(lobbyModsForPool("PS", true)).toBe("NF")
  })

  test("preserves selected mods when adding recipe mods", () => {
    expect(addLobbyMod("HR NF", "HD", true)).toBe("HR HD NF")
    expect(addLobbyMod("Freemod NF", "HR", true)).toBe("Freemod NF")
  })
})

describe("match progression", () => {
  test("alternates from the picker regardless of winner", () => {
    expect(nextPlayerAfterPick("Player A", "Player A", "Player B")).toBe("Player B")
    expect(nextPlayerAfterPick("Player B", "Player A", "Player B")).toBe("Player A")
  })

  test("doubles the base ingredient on a home-mod win", () => {
    expect(homeModIngredientCount("HR", "Player A", "Player A", "Player B", "HR", "DT")).toBe(2)
    expect(homeModIngredientCount("DT", "Player A", "Player A", "Player B", "HR", "DT")).toBe(1)
    expect(homeModIngredientCount("DT", "Player B", "Player A", "Player B", "HR", "DT")).toBe(2)
  })
})
