import { describe, expect, test } from "bun:test"
import { RECIPES, RECIPES_ALPHABETICAL } from "../src/data/recipes.ts"
import {
  addLobbyMod,
  baseBanLimitForRound,
  effectiveBanLimitForRound,
  caramelLobbyMods,
  canClaimRefereeAssignment,
  compareMapResults,
  formatMatchResultSections,
  formatMatchResultTitle,
  formatForfeitResultDescription,
  formatRefereeIrcMessage,
  formatScheduleDateTime,
  formatScheduleTimeInput,
  formatLobbyTitle,
  hdUsageFromScoreReport,
  homeModIngredientAwards,
  isBanLimitReached,
  isValidScheduleDate,
  isTiebreakerReady,
  latestRoundScheduleMatches,
  mapResultFromScoreReport,
  lobbyInviteTarget,
  lobbyModsForPool,
  nextPlayerAfterPick,
  normalizeHdScore,
  parseMappoolMods,
  parseMapWinCondition,
  parseScoreValue,
  parseRollAnnouncement,
  parseFinishedScoreAnnouncement,
  parseCreatedLobbyAnnouncement,
  normalizeScheduleTime,
  refereeAssignments,
  refereeIsAssigned,
  resolveLobbyReferees,
  resolvePotentialScheduleMatches,
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
  test("enables optional HD through freemod on every pool", () => {
    expect(lobbyModsForPool("NM", false)).toBe("Freemod")
    expect(lobbyModsForPool("PS", false)).toBe("Freemod")
    expect(lobbyModsForPool("HR", true)).toBe("Freemod NF")
    expect(lobbyModsForPool("DT", true)).toBe("DT Freemod NF")
    expect(lobbyModsForPool("FM", true)).toBe("Freemod NF")
    expect(lobbyModsForPool("TB", true)).toBe("Freemod NF")
  })

  test("preserves selected mods when adding recipe mods", () => {
    expect(addLobbyMod("HR NF", "HD", true)).toBe("HR HD NF")
    expect(addLobbyMod("Freemod NF", "HR", true)).toBe("Freemod NF")
  })

  test("maps validated Caramel sheet mods to lobby acronyms", () => {
    expect(caramelLobbyMods("", true)).toBe("Freemod NF")
    expect(caramelLobbyMods("double_time", true)).toBe("DT Freemod NF")
    expect(caramelLobbyMods("hard_rock", false)).toBe("HR Freemod")
    expect(caramelLobbyMods("easy-double_time", true)).toBe("EZ DT Freemod NF")
    expect(caramelLobbyMods("autopilot", false)).toBe("AP Freemod")
    expect(caramelLobbyMods("unsupported", true)).toBeNull()
  })

  test("parses every sheet win condition and defaults blank to ScoreV2", () => {
    expect(parseMapWinCondition("")).toBe("score")
    expect(parseMapWinCondition("v2")).toBe("score")
    expect(parseMapWinCondition("scorev2")).toBe("score")
    expect(parseMapWinCondition("acc")).toBe("accuracy")
    expect(parseMapWinCondition("accuracy")).toBe("accuracy")
    expect(parseMapWinCondition("miss")).toBe("miss")
    expect(parseMapWinCondition("combo")).toBe("combo")
    expect(parseMapWinCondition("unsupported")).toBeNull()
  })

  test("parses optional mappool mods without enforcing an acronym list", () => {
    expect(parseMappoolMods("")).toEqual([])
    expect(parseMappoolMods("HD")).toEqual(["HD"])
    expect(parseMappoolMods("HD, HR/DT")).toEqual(["HD", "HR", "DT"])
    expect(parseMappoolMods("RX")).toEqual(["RX"])
  })
})

describe("match progression", () => {
  test("shows potential lower-bracket rows until the canonical matchup is finalized", () => {
    const common = { round: "Quarterfinals", date: "9/20/2026", time: "18:00" }
    const matches = [
      { ...common, id: "41", playerA: "TBD", playerB: "TBD", referee: "" },
      { ...common, id: "41a", playerA: "Alpha", playerB: "Bravo", referee: "Ref A" },
      { ...common, id: "41b", playerA: "Alpha", playerB: "Charlie", referee: "Ref B" },
      { ...common, id: "42", playerA: "Delta", playerB: "Echo", referee: "Ref C" },
    ]

    expect(resolvePotentialScheduleMatches(matches).map((match) => match.id)).toEqual(["41a", "41b", "42"])
  })

  test("collapses a finalized potential matchup into its numeric ID and inherits its referee", () => {
    const matches = [
      { id: "41", playerA: "Bravo", playerB: "Alpha", date: "9/20/2026", time: "18:00", referee: "" },
      { id: "41a", playerA: "Alpha", playerB: "Bravo", date: "9/19/2026", time: "19:00", referee: "Ref A" },
      { id: "41b", playerA: "Alpha", playerB: "Bravo", date: "9/20/2026", time: "18:00", referee: "Ref B" },
      { id: "41c", playerA: "Alpha", playerB: "Charlie", date: "9/20/2026", time: "18:00", referee: "Ref C" },
    ]

    expect(resolvePotentialScheduleMatches(matches)).toEqual([{
      ...matches[0],
      referee: "Ref B",
      refereeSourceId: "41b",
    }])
  })

  test("shows only the latest available tournament round in the schedule", () => {
    const matches = [
      { id: "1", round: "Round of 32" },
      { id: "2", round: "RO16" },
      { id: "3", round: "Round of 16" },
    ]
    expect(latestRoundScheduleMatches(matches).map((match) => match.id)).toEqual(["2", "3"])

    expect(latestRoundScheduleMatches([
      ...matches,
      { id: "4", round: "Quarterfinals" },
      { id: "5", round: "Semifinals" },
      { id: "6", round: "Finals" },
      { id: "7", round: "Grand Finals" },
    ]).map((match) => match.id)).toEqual(["7"])
  })

  test("keeps unknown round schedules visible when no configured round is present", () => {
    const matches = [
      { id: "1", round: "Qualifier A" },
      { id: "2", round: "Qualifier B" },
    ]
    expect(latestRoundScheduleMatches(matches)).toEqual(matches)
  })

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

  test("limits RO32 and RO16 to one base ban per player", () => {
    expect(baseBanLimitForRound("RO32")).toBe(2)
    expect(baseBanLimitForRound("Round of 32")).toBe(2)
    expect(baseBanLimitForRound("RO16")).toBe(2)
    expect(baseBanLimitForRound("Round of 16")).toBe(2)
    expect(baseBanLimitForRound("Quarterfinals")).toBe(4)
    expect(effectiveBanLimitForRound("RO16")).toBe(2)
    expect(effectiveBanLimitForRound("RO16", true)).toBe(3)
    expect(effectiveBanLimitForRound("Quarterfinals", true)).toBe(4)
    expect(isBanLimitReached(2, baseBanLimitForRound("RO32"))).toBe(true)
    expect(isBanLimitReached(2, baseBanLimitForRound("RO16"))).toBe(true)
  })

  test("normalizes HD scores and compares explicit sheet win conditions", () => {
    expect(normalizeHdScore(1_060_000, true)).toBe(1_000_000)
    expect(normalizeHdScore(1_060_000, false)).toBe(1_060_000)
    expect(compareMapResults("score", { scoreA: 800_000, scoreB: 900_000 })).toBe(-1)
    expect(compareMapResults("miss", { scoreA: 800_000, scoreB: 900_000, missCountA: 0, missCountB: 1 })).toBe(1)
    expect(compareMapResults("miss", { scoreA: 900_000, scoreB: 800_000, missCountA: 2, missCountB: 1 })).toBe(-1)
    expect(compareMapResults("miss", { scoreA: 900_000, scoreB: 800_000, missCountA: 1, missCountB: 1 })).toBe(0)
    expect(compareMapResults("miss", { scoreA: 900_000, scoreB: 800_000 })).toBeNull()
    expect(compareMapResults("combo", { scoreA: 800_000, scoreB: 900_000, comboA: 500, comboB: 400 })).toBe(1)
    expect(compareMapResults("combo", { scoreA: 900_000, scoreB: 800_000, comboA: 400, comboB: 500 })).toBe(-1)
    const emptyPs3Condition = parseMapWinCondition("")
    expect(emptyPs3Condition).toBe("score")
    expect(compareMapResults(emptyPs3Condition ?? "score", {
      scoreA: 900_000,
      scoreB: 800_000,
      missCountA: 5,
      missCountB: 0,
    })).toBe(1)
  })

  test("detects HD from the matching finished osu score report", () => {
    const games = [
      {
        beatmapId: 5854733,
        endedAt: "2026-08-30T10:00:00Z",
        scores: [
          { userId: 8250297, score: 399617, accuracy: 0.98765, misses: 1, maxCombo: 843, mods: ["NF", "HR"] },
          { userId: 1501956, score: 417450, accuracy: 98.12345, misses: 2, maxCombo: 721, mods: ["NF", "HD", "HR"] },
        ],
      },
    ]
    expect(hdUsageFromScoreReport(games, 5854733, 8250297, 1501956, 399617, 417450)).toEqual({
      usesHdA: false,
      usesHdB: true,
    })
    expect(normalizeHdScore(417450, true)).toBe(393821)
    expect(mapResultFromScoreReport(games, 5854733, 8250297, 1501956, 399617, 417450)).toEqual({
      scoreA: 399617,
      scoreB: 417450,
      accuracyA: 98.765,
      accuracyB: 98.1235,
      missCountA: 1,
      missCountB: 2,
      comboA: 843,
      comboB: 721,
      usesHdA: false,
      usesHdB: true,
    })
    const missingMetricsGames = [{
      ...games[0],
      scores: games[0].scores.map(({ userId, score, mods }) => ({ userId, score, mods })),
    }]
    expect(mapResultFromScoreReport(missingMetricsGames, 5854733, 8250297, 1501956, 399617, 417450)).toMatchObject({
      accuracyA: null,
      accuracyB: null,
      missCountA: null,
      missCountB: null,
      comboA: null,
      comboB: null,
    })
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

  test("replaces a different assigned referee only for an admin creating a lobby", () => {
    expect(resolveLobbyReferees("Assigned Ref", "Admin Ref", true)).toEqual({
      referee: "Admin Ref",
      usernames: ["Admin Ref"],
      adminTookOver: true,
    })
    expect(resolveLobbyReferees("Assigned Ref", "Cover Ref", false)).toEqual({
      referee: "Assigned Ref",
      usernames: ["Assigned Ref", "Cover Ref"],
      adminTookOver: false,
    })
    expect(resolveLobbyReferees("Admin Ref", "Admin Ref", true)).toEqual({
      referee: "Admin Ref",
      usernames: ["Admin Ref"],
      adminTookOver: false,
    })
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

  test("correlates lobby creation announcements by exact title", () => {
    const titleA = "MWSW: (shouponpon) vs (shadevr)"
    const titleB = "MWSW: (John ethken) vs (Flyer)"
    const announcement = `Created the tournament match https://osu.ppy.sh/mp/121808612 ${titleA}`
    expect(parseCreatedLobbyAnnouncement(announcement, titleA)).toBe("121808612")
    expect(parseCreatedLobbyAnnouncement(announcement, titleB)).toBeNull()
  })

  test("prefixes referee chat but leaves BanchoBot commands unchanged", () => {
    expect(formatRefereeIrcMessage("Ref One", "Players ready?")).toBe("<Ref One> Players ready?")
    expect(formatRefereeIrcMessage("Ref One", "  !mp timer 120  ")).toBe("!mp timer 120")
  })
})

describe("match result formatting", () => {
  test("omits the tournament abbreviation from result titles", () => {
    expect(formatMatchResultTitle("Round of 32", "6")).toBe("Round of 32 - Match 6")
    expect(formatMatchResultTitle("", "6")).toBe("Match 6")
  })

  test("formats a minimal forfeit score and default-win message", () => {
    const description = formatForfeitResultDescription("teffek", "Fuma", -1, 0, "Fuma")
    expect(description).toContain("`-1` - `0`")
    expect(description).toContain("**Fuma wins by default.**")
    expect(description).not.toContain("osu.ppy.sh")
  })

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
      [
        { player: "teffek", name: "Crepe", target: "PS3" },
        { player: "Fuma", name: "Caramel", target: "WC", details: "(2025) - HR2 - Wildcard Song" },
      ],
    )).toEqual({
      bans: "🔴 bans `DT1`\n🔵 bans `DT3`",
      homeMods: "🔴 `HR`\n🔵 `PS`",
      rundown: "🔵 picks `FM1` - 🔴 wins!\n🔵 picks `PS3` - 🔵 wins!",
      recipes: "🔴 Crepe `PS3`\n🔵 Caramel `WC` - (2025) - HR2 - Wildcard Song",
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
