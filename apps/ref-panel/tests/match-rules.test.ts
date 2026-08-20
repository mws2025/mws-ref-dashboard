import { describe, expect, test } from "bun:test"
import {
  addLobbyMod,
  formatLobbyTitle,
  homeModIngredientAwards,
  lobbyInviteTarget,
  lobbyModsForPool,
  nextPlayerAfterPick,
  parseScoreValue,
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

  test("awards one home ingredient on a loss and two on a win", () => {
    expect(homeModIngredientAwards("HR", "Player A", "Player A", "Player B", "HR", "DT")).toEqual({ playerA: 2, playerB: 0 })
    expect(homeModIngredientAwards("DT", "Player A", "Player A", "Player B", "HR", "DT")).toEqual({ playerA: 1, playerB: 1 })
    expect(homeModIngredientAwards("DT", "Player B", "Player A", "Player B", "DT", "DT")).toEqual({ playerA: 1, playerB: 2 })
  })
})

describe("referee input and lobby formatting", () => {
  test("accepts score and accuracy formatting", () => {
    expect(parseScoreValue("987,432")).toBe(987432)
    expect(parseScoreValue("98.76%")).toBe(98.76)
    expect(parseScoreValue(0)).toBe(0)
    expect(parseScoreValue("")).toBeNull()
    expect(parseScoreValue("%")).toBeNull()
    expect(parseScoreValue("invalid")).toBeNull()
  })

  test("formats lobby names and invite targets", () => {
    expect(formatLobbyTitle("MWSW", "Player A", "Player B")).toBe("MWSW: [Player A] vs [Player B]")
    expect(lobbyInviteTarget("WEARY", "12345")).toBe("#12345")
    expect(lobbyInviteTarget("Cinnamon Twist")).toBe("Cinnamon_Twist")
  })
})
