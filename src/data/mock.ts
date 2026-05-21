import type { Inventory, IrcEntry, Match, PoolMap } from "@/types"

export const scheduleMatches: Match[] = [
  { id: "m1", round: "Round of 16",   playerA: "Strawberry_Jam",  playerB: "Blueberries_osu",  date: "May 23, 2026", time: "10:00 UTC", status: "live"      },
  { id: "m2", round: "Round of 16",   playerA: "CroissantFC",     playerB: "MochiMeltdown",    date: "May 23, 2026", time: "11:30 UTC", status: "upcoming"  },
  { id: "m3", round: "Round of 16",   playerA: "GlazedDonuts",    playerB: "BaguetteBoys",     date: "May 23, 2026", time: "13:00 UTC", status: "upcoming"  },
  { id: "m4", round: "Round of 16",   playerA: "SourdoughSquad",  playerB: "PretzelPals",      date: "May 23, 2026", time: "14:30 UTC", status: "upcoming"  },
  { id: "m5", round: "Round of 16",   playerA: "EclairElites",    playerB: "TartTroopers",     date: "May 23, 2026", time: "16:00 UTC", status: "scheduled" },
  { id: "m6", round: "Quarterfinals", playerA: "TBD",             playerB: "TBD",              date: "May 24, 2026", time: "10:00 UTC", status: "scheduled" },
  { id: "m7", round: "Quarterfinals", playerA: "TBD",             playerB: "TBD",              date: "May 24, 2026", time: "12:00 UTC", status: "scheduled" },
]

export const MATCH = {
  playerA:    "Strawberry_Jam",
  playerB:    "Blueberries_osu",
  scoreA:     2,
  scoreB:     1,
  bestOf:     9,
  winsNeeded: 5,
  lobbyUrl:   "mp/123456",
}

export const INVENTORY_A: Inventory = { egg: 2, sugar: 1, butter: 2, flour: 0, milk: 1 }
export const INVENTORY_B: Inventory = { egg: 1, sugar: 0, butter: 0, flour: 2, milk: 1 }

export const MAPPOOL: PoolMap[] = [
  { slot: "NM1", pool: "NM", map: "seatrus - TEMP3ST [D3ATH TWC VER.] (.mtk)",                               bpm: 244, ar: 5,  cs: 5, status: "available"                                             },
  { slot: "NM2", pool: "NM", map: "Skybreak - NOLIGHT (feat. HeyBela) [INNERONI] (rubies87)",                 bpm: 140, ar: 10, cs: 2, status: "completed", pickedBy: "Strawberry_Jam",  winner: "Blueberries_osu"   },
  { slot: "NM3", pool: "NM", map: "BlackY - ULTIMATE END (Cut Ver.) [explode] (JarvisGaming)",                bpm: 300, ar: 5,  cs: 5, status: "available"                                              },
  { slot: "NM4", pool: "NM", map: "pa-o-mu99999 - Bobobo-bo Bo-bobo [!!! ? ? !!] (Jayceko)",                 bpm: 160, ar: 10, cs: 5, status: "available"                                              },
  { slot: "NM5", pool: "NM", map: "Fallujah - Carved From Stone (2024 Remaster) [Eternal] (Heavys)",          bpm: 240, ar: 10, cs: 2, status: "in-progress", pickedBy: "Strawberry_Jam"               },
  { slot: "NM6", pool: "NM", map: "ALEPH - SIGNALBURNERRR [CODE: FUZE] (Z419)",                              bpm: 170, ar: 10, cs: 2, status: "available"                                              },
  { slot: "HD1", pool: "HD", map: "Riya - IMPULSE [Inner Oni] (Quorum)",                                      bpm: 145, ar: 5,  cs: 5, status: "completed", pickedBy: "Strawberry_Jam",  winner: "Strawberry_Jam"    },
  { slot: "HD2", pool: "HD", map: "Xyris - Terrablazer [Laevatain] (Alwaysyukaz)",                            bpm: 260, ar: 0,  cs: 2, status: "banned",    bannedBy: "Strawberry_Jam"               },
  { slot: "HR1", pool: "HR", map: "Toromaru - Erinyes [Retaliation] (tasuke912)",                             bpm: 195, ar: 5,  cs: 5, status: "completed", pickedBy: "Blueberries_osu", winner: "Strawberry_Jam"    },
  { slot: "HR2", pool: "HR", map: "MITCH DOWNVELL - not sakura [Neue] (roufou)",                              bpm: 227, ar: 5,  cs: 5, status: "banned",    bannedBy: "Blueberries_osu"              },
  { slot: "DT1", pool: "DT", map: "Camellia - Maze of Vignere Square [Inner Oni] (Undead Alice)",             bpm: 150, ar: 10, cs: 2, status: "available"                                             },
  { slot: "DT2", pool: "DT", map: "Aiobahn feat. KOTOKO - INTERNET YAMERO [GLORP YAMERO] (Yasuho)",          bpm: 185, ar: 5,  cs: 5, status: "available"                                             },
  { slot: "FM1", pool: "FM", map: "MetaHumanBoi - ILLUSTRIOUS DRIFTERS [RACE!] (miyagishima)",                bpm: 185, ar: 5,  cs: 5, status: "available"                                             },
  { slot: "FM2", pool: "FM", map: "Aiyru - Elevator [Inner Oni] (Grape_Tea)",                                 bpm: 190, ar: 10, cs: 5, status: "available"                                             },
  { slot: "FM3", pool: "FM", map: "fool - TO THE NEXT [Inner Oni] (Greenshell)",                              bpm: 175, ar: 10, cs: 3, status: "available"                                             },
  { slot: "TB1", pool: "TB", map: "Laur - SEV-26 [Malignant Madness] (uone)",                                 bpm: 220, ar: 9,  cs: 3, status: "available"                                             },
]

export const AUDIT_LOG = [
  { time: "10:14", actor: "RefA",   msg: "Lobby mp/123456 set. Status → warmup." },
  { time: "10:19", actor: "System", msg: "Strawberry Jam banned HD2." },
  { time: "10:22", actor: "System", msg: "Blueberries banned HR2." },
  { time: "10:25", actor: "System", msg: "Strawberry Jam picked HD1." },
  { time: "10:37", actor: "System", msg: "HD1 done. Winner: Strawberry Jam. +1 Sugar." },
  { time: "10:42", actor: "System", msg: "Blueberries picked HR1." },
  { time: "10:55", actor: "System", msg: "HR1 done. Winner: Strawberry Jam. +1 Butter." },
  { time: "11:01", actor: "System", msg: "Strawberry Jam picked NM2." },
  { time: "11:14", actor: "System", msg: "NM2 done. Winner: Blueberries. +1 Egg." },
  { time: "11:20", actor: "System", msg: "Strawberry Jam picked NM5. In progress." },
]

export const DECISION_QUEUE = [
  { label: "Record NM5 scores and winner", status: "Pending" },
  { label: "Check Bubble Tea eligibility if score gap ≤10k", status: "Queued" },
  { label: "Lock match after 5th win confirmed", status: "Later" },
]

export const IRC_BOT = "Hoaq"

export const IRC_LOG: IrcEntry[] = [
  { time: "10:14", sender: "BanchoBot",          msg: "Created the tournament match https://osu.ppy.sh/mp/123456",             type: "bancho" },
  { time: "10:15", sender: IRC_BOT, ref: "RefA", msg: "!mp invite Strawberry_Jam a3f9k2lx",                                   type: "ref"    },
  { time: "10:15", sender: IRC_BOT, ref: "RefA", msg: "!mp invite Blueberries_osu q7m1np4w",                                  type: "ref"    },
  { time: "10:16", sender: "BanchoBot",          msg: "Strawberry_Jam joined in slot 1.",                                     type: "bancho" },
  { time: "10:17", sender: "BanchoBot",          msg: "Blueberries_osu joined in slot 2.",                                   type: "bancho" },
  { time: "10:17", sender: IRC_BOT, ref: "RefA", msg: "!mp set 0 0 2 bz8xr5ej",                                              type: "ref"    },
  { time: "10:18", sender: "BanchoBot",          msg: "Changed match settings to TeamVs, ScoreV2, Size: 2",                  type: "bancho" },
  { time: "10:18", sender: IRC_BOT, ref: "RefA", msg: "!mp timer 120 t4vhn9ks",                                              type: "ref"    },
  { time: "10:18", sender: "BanchoBot",          msg: "Countdown ends in 120 seconds.",                                      type: "bancho" },
  { time: "10:19", sender: "Strawberry_Jam",     msg: "ready",                                                               type: "player" },
  { time: "10:20", sender: IRC_BOT, ref: "RefA", msg: "!mp start 10 yw6cd3mf",                                              type: "ref"    },
  { time: "10:20", sender: "BanchoBot",          msg: "The match has started!",                                              type: "bancho" },
  { time: "10:37", sender: "BanchoBot",          msg: "Strawberry_Jam finished playing (Score: 987,432, PASSED).",           type: "bancho" },
  { time: "10:37", sender: "BanchoBot",          msg: "Blueberries_osu finished playing (Score: 854,201, PASSED).",         type: "bancho" },
  { time: "10:38", sender: IRC_BOT, ref: "RefA", msg: "!mp timer 120 p2rx7qnb",                                             type: "ref"    },
  { time: "10:55", sender: IRC_BOT, ref: "RefB", msg: "good luck both",                                                     type: "ref"    },
]

export const BANCHO_COMMANDS = [
  { label: "Start 10s", cmd: "!mp start 10"  },
  { label: "Timer 120", cmd: "!mp timer 120" },
  { label: "Abort",     cmd: "!mp abort"     },
  { label: "Invite A",  cmd: `!mp invite ${MATCH.playerA}` },
  { label: "Invite B",  cmd: `!mp invite ${MATCH.playerB}` },
]
