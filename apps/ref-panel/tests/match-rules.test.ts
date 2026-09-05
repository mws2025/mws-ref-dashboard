import { describe, expect, test } from "bun:test"
import { RECIPES, RECIPES_ALPHABETICAL } from "../src/data/recipes.ts"
import {
  addLobbyMod,
  baseBanLimitForRound,
  caramelLobbyMods,
  caramelWinCondition,
  canClaimRefereeAssignment,
  compareMapResults,
  formatMatchResultSections,
  formatScheduleDateTime,
  formatScheduleTimeInput,
  formatLobbyTitle,
  hdUsageFromScoreReport,
  homeModIngredientAwards,
  isBanLimitReached,
  isValidScheduleDate,
  isTiebreakerReady,
  isMissCountWinCondition,
  lobbyInviteTarget,
  lobbyModsForPool,
  nextPlayerAfterPick,
  normalizeHdScore,
  parseScoreValue,
  parseRollAnnouncement,
  parseFinishedScoreAnnouncement,
  normalizeScheduleTime,
  refereeAssignments,
  refereeIsAssigned,
  scheduleDateSerial,
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

  test("maps validated Caramel sheet mods to lobby acronyms", () => {
    expect(caramelLobbyMods("", true)).toBe("NF")
    expect(caramelLobbyMods("double_time", true)).toBe("DT NF")
    expect(caramelLobbyMods("hard_rock", false)).toBe("HR")
    expect(caramelLobbyMods("easy-double_time", true)).toBe("EZ DT NF")
    expect(caramelLobbyMods("autopilot", false)).toBe("AP")
    expect(caramelLobbyMods("unsupported", true)).toBeNull()
  })

  test("defaults blank Caramel win conditions to score and validates accuracy", () => {
    expect(caramelWinCondition("")).toBe("score")
    expect(caramelWinCondition("scorev2")).toBe("score")
    expect(caramelWinCondition("acc")).toBe("accuracy")
    expect(caramelWinCondition("accuracy")).toBe("accuracy")
    expect(caramelWinCondition("combo")).toBeNull()
  })
})

describe("match progression", () => {
  test("alternates from the picker regardless of winner", () => {
    expect(nextPlayerAfterPick("Player A", "Player A", "Player B")).toBe("Player B")
    expect(nextPlayerAfterPick("Player B", "Player A", "Player B")).toBe("Player A")
  })

  test("only opens the tiebreaker at mutual match point", () => {
    expect(isTiebreakerReady(4, 4, 9)).toBe(true)
    expect(isTiebreakerReady(4, 3, 9)).toBe(false)
    expect(isTiebreakerReady(5, 5, 9)).toBe(false)
  })

  test("enforces the four-ban match limit", () => {
    expect(isBanLimitReached(3)).toBe(false)
    expect(isBanLimitReached(4)).toBe(true)
    expect(isBanLimitReached(5)).toBe(true)
  })

  test("limits RO32 to one base ban per player", () => {
    expect(baseBanLimitForRound("RO32")).toBe(2)
    expect(baseBanLimitForRound("Round of 32")).toBe(2)
    expect(baseBanLimitForRound("RO16")).toBe(4)
    expect(isBanLimitReached(2, baseBanLimitForRound("RO32"))).toBe(true)
  })

  test("normalizes HD scores and identifies the PS3 miss-count map", () => {
    expect(normalizeHdScore(1_060_000, true)).toBe(1_000_000)
    expect(normalizeHdScore(1_060_000, false)).toBe(1_060_000)
    expect(isMissCountWinCondition("ps3")).toBe(true)
    expect(isMissCountWinCondition("PS2")).toBe(false)
    expect(compareMapResults("PS3", 800_000, 900_000, 0, 1)).toBe(1)
    expect(compareMapResults("PS3", 900_000, 800_000, 2, 1)).toBe(-1)
    expect(compareMapResults("PS3", 900_000, 800_000, 1, 1)).toBe(0)
    expect(compareMapResults("PS3", 900_000, 800_000)).toBeNull()
  })

  test("detects HD from the matching finished osu score report", () => {
    const games = [
      {
        beatmapId: 5854733,
        endedAt: "2026-08-30T10:00:00Z",
        scores: [
          { userId: 8250297, score: 399617, mods: ["NF", "HR"] },
          { userId: 1501956, score: 417450, mods: ["NF", "HD", "HR"] },
        ],
      },
    ]
    expect(hdUsageFromScoreReport(games, 5854733, 8250297, 1501956, 399617, 417450)).toEqual({
      usesHdA: false,
      usesHdB: true,
    })
    expect(normalizeHdScore(417450, true)).toBe(393821)
    expect(hdUsageFromScoreReport(games, 5854733, 8250297, 1501956, 1, 2)).toBeNull()
  })

  test("awards one home ingredient on a loss and two on a win", () => {
    expect(homeModIngredientAwards("HR", "Player A", "Player A", "Player B", "HR", "DT")).toEqual({ playerA: 2, playerB: 0 })
    expect(homeModIngredientAwards("DT", "Player A", "Player A", "Player B", "HR", "DT")).toEqual({ playerA: 1, playerB: 1 })
    expect(homeModIngredientAwards("DT", "Player B", "Player A", "Player B", "DT", "DT")).toEqual({ playerA: 1, playerB: 2 })
  })
})

describe("referee input and lobby formatting", () => {
  test("parses referee assignments without allowing partial-name matches", () => {
    expect(refereeAssignments("Ref One, RefTwo | RefThree")).toEqual(["Ref One", "RefTwo", "RefThree"])
    expect(refereeIsAssigned("Ref One, RefTwo", "reftwo")).toBe(true)
    expect(refereeIsAssigned("Ref One, RefTwo", "Ref")).toBe(false)
    expect(canClaimRefereeAssignment(undefined, "New Ref")).toBe(true)
    expect(canClaimRefereeAssignment("Existing Ref", "New Ref")).toBe(false)
  })

  test("formats and validates schedule input", () => {
    expect(formatScheduleTimeInput("0930")).toBe("09:30")
    expect(formatScheduleTimeInput("9:30")).toBe("9:30")
    expect(normalizeScheduleTime("9:30")).toBe("09:30")
    expect(normalizeScheduleTime("24:00")).toBeNull()
    expect(isValidScheduleDate("2026-09-01")).toBe(true)
    expect(isValidScheduleDate("2026-02-30")).toBe(false)
    expect(scheduleDateSerial("1970-01-01")).toBe(25569)
    expect(scheduleDateSerial("2026-02-30")).toBeNull()
  })

  test("converts UTC schedules to another timezone across calendar days", () => {
    expect(formatScheduleDateTime("2026-09-04", "20:30", "UTC")).toEqual({
      date: "(Fri) Sep 4",
      time: "20:30",
    })
    expect(formatScheduleDateTime("2026-09-04", "20:30 UTC", "Asia/Ho_Chi_Minh")).toEqual({
      date: "(Sat) Sep 5",
      time: "03:30",
    })
    expect(formatScheduleDateTime("invalid", "20:30", "UTC")).toBeNull()
  })

  test("accepts score and accuracy formatting", () => {
    expect(parseScoreValue("987,432")).toBe(987432)
    expect(parseScoreValue("98.76%")).toBe(98.76)
    expect(parseScoreValue(0)).toBe(0)
    expect(parseScoreValue("")).toBeNull()
    expect(parseScoreValue("%")).toBeNull()
    expect(parseScoreValue("invalid")).toBeNull()
  })

  test("parses BanchoBot finish scores", () => {
    expect(parseFinishedScoreAnnouncement("WEARY finished playing (Score: 987,432, PASSED).")).toEqual({
      player: "WEARY",
      score: 987432,
    })
    expect(parseFinishedScoreAnnouncement("The match has started!")).toBeNull()
  })

  test("formats lobby names and invite targets", () => {
    expect(formatLobbyTitle("MWSW", "Player A", "Player B")).toBe("MWSW: (Player A) vs (Player B)")
    expect(lobbyInviteTarget("WEARY", "12345")).toBe("#12345")
    expect(lobbyInviteTarget("Cinnamon Twist")).toBe("Cinnamon_Twist")
  })
})

describe("match result formatting", () => {
  test("includes bans, home mods, map winners, and recipe targets", () => {
    expect(formatMatchResultSections(
      "teffek",
      "Fuma",
      "HR",
      "PS",
      [
        { slot: "DT1", status: "banned", bannedBy: "teffek" },
        { slot: "DT3", status: "banned", bannedBy: "Fuma" },
        { slot: "FM1", status: "completed", pickedBy: "Fuma", winner: "teffek" },
        { slot: "PS3", status: "completed", pickedBy: "Fuma", winner: "Fuma" },
      ],
      [{ player: "teffek", name: "Crepe", target: "PS3" }],
    )).toEqual({
      bans: "🔴 bans `DT1`\n🔵 bans `DT3`",
      homeMods: "🔴 `HR`\n🔵 `PS`",
      rundown: "🔵 picks `FM1` - 🔴 wins!\n🔵 picks `PS3` - 🔵 wins!",
      recipes: "🔴 Crepe `PS3`",
    })
  })
})

describe("recipe catalog", () => {
  test("is alphabetical and distinguishes both Cinnamon Roll recipes", () => {
    const names = RECIPES_ALPHABETICAL.map((recipe) => recipe.name)
    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right, "en", { numeric: true })))
    expect(RECIPES.find((recipe) => recipe.id === 8)?.name).toBe("Cinnamon Roll (Protect)")
    expect(RECIPES.find((recipe) => recipe.id === 8)?.cost).toEqual({ egg: 1, sugar: 2, butter: 1, flour: 1, milk: 1 })
    expect(RECIPES.find((recipe) => recipe.id === 19)?.name).toBe("Cinnamon Roll (Unban)")
  })

  test("defines Quiche as forced HD", () => {
    expect(RECIPES.find((recipe) => recipe.id === 11)?.desc).toContain("HD")
  })
})
