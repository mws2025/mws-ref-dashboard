import type { RuleItem } from "./components/RuleList"
import { Highlight } from "./components/Highlight"

export const GENERAL_INFO: RuleItem[] = [
  {
    text: (
      <>
        MWS Whisked is a <Highlight>1v1, International Tournament</Highlight>
      </>
    ),
    children: [
      <>
        BWS Rank <Highlight>#1,000 - #10,000</Highlight>
      </>,
    ],
  },
  <>
    All scheduling will be done in <Highlight>UTC</Highlight>
  </>,
  <>
    All matches take place between <Highlight>Thursday 00:00 UTC</Highlight> and{" "}
    <Highlight>Monday 00:00 UTC</Highlight>
  </>,
  {
    text: (
      <>
        Staff are <Highlight>prohibited</Highlight> from playing with the
        exception of streamers and commentators.
      </>
    ),
    children: [
      "Eliminated players may enlist as referees, mappool playtesters, and/or replayers.",
    ],
  },
  <>
    Trolling and Cheating are both <Highlight>prohibited</Highlight>. Offenders
    will be reported to the osu! Tournament Staff.
  </>,
  "If a referee is late to a qualifier or bracket match, give them a ping. If no one shows up past the 10 minute mark of a match, notify a host or admin.",
]

export const QUALIFIER_STAGE: RuleItem[] = [
  <>
    The <Highlight>top 32 players from qualifiers</Highlight> will advance to
    the bracket stage. All other players will be eliminated.
  </>,
  "Qualifier lobbies will be held once screening is complete. This duration typically lasts 1-2 weeks.",
  "Set times for qualifier lobbies will be shown on the Mainsheet and website, each player can only register for one lobby. If none of the preset times work, players can create custom lobbies. Please ensure your custom lobby is approved by a referee.",
  {
    text: (
      <>
        In the event that a player missed their scheduled lobby, they may{" "}
        <Highlight>reschedule</Highlight> for the duration of the Qualifier
        stage.
      </>
    ),
    children: [
      "Any reschedules past the Qualifier Stage time frame will result in the player forfeiting.",
    ],
  },
  <>
    <Highlight>A 15 minute</Highlight> heads up will be sent to all players
    signed up for a specific lobby. At <Highlight>5 minutes</Highlight> before
    the designated qualifier start time, all players will be invited to their
    lobby.
  </>,
  "Each map will be played in the order shown on the Main Sheet",
  "Seeding will be determined by the sum of the percentiles assuming a normal curve (z-percentile).",
  <>
    All scores are locked after playing,{" "}
    <Highlight color="cherry">no retries</Highlight>.
  </>,
]

export const BRACKET_SCHEDULING: RuleItem[] = [
  "Matches will have a default schedule, these dates and times can be changed if both parties agree and fall within the bracket schedule.",
  <>
    Matches can be scheduled from <Highlight>Thursday 00:00 UTC</Highlight> to{" "}
    <Highlight>Monday 00:00 UTC</Highlight>.
  </>,
  "Players are responsible to communicate to their opponent to find a time that works best.",
  "When a reschedule is agreed, only one player sends a screenshot or link to the match channel in #reschedule.",
]

export const BRACKET_MATCH_PROCEDURES: RuleItem[] = [
  "NoFail and ScoreV2 are required for all maps.",
  "Players are notified 15 minutes before the match and invited 10 minutes before start.",
  {
    text: "Warmups (max 5 minutes) require both player's consent and are played before rolls.",
    children: [
      {
        text: "Warmups cannot be in the current mappool.",
        children: ["Referees will allow warmups to be played as FreeMod."],
      },
    ],
  },
  "Double bans and double picks are allowed.",
  "Players have 120 seconds for each ban/pick. Inaction results in forfeiting the turn to the opponent.",
  {
    text: "Each player gets 1 timeout per match.",
    children: ["Duration is 5 minutes."],
  },
  {
    text: "If a player disconnected within 30 seconds of the start of the map, they may replay the chosen map.",
    children: [
      {
        text: "If they disconnect after the 30 second grace period, the point will be given to the opponent.",
        children: [
          "This can only happen once per match.",
          {
            text: "If both players disconnect the player with the highest score at the time of disconnection will be given the point.",
            children: ["If the map is past 30 seconds, the map is replayed."],
          },
        ],
      },
    ],
  },
  {
    text: "Tiebreakers (TB) enforce NF; players may use any mods, but none are required.",
    children: ["Recipes may overwrite chosen Mods."],
  },
]

export const BRACKET_BANS_PICKS: RuleItem[] = [
  "Highest roll will choose who picks first and bans last or bans first and picks last (ABAB).",
  {
    text: "Each will have 120 seconds to ban or pick a map.",
    children: [
      "If the bracket stage has 2+ bans, the ABAB format will be used.",
    ],
  },
]

export const BRACKET_TIEBREAKER: RuleItem[] = [
  "If both players are one point away from the required amount to win the round, the Tiebreaker map will be played.",
  {
    text: "If a recipe is not used on the TB, any mod combinations are acceptable for all players.",
    children: [
      <>
        You cannot enable <Highlight color="cherry">DT/NC</Highlight> as a mod,
        even if both players agree.
      </>,
    ],
  },
  "EZ will be based on the map selected, and will be given a custom EZ multiplier.",
]

export const BRACKET_SCREENING: RuleItem[] = [
  "Screening will be conducted by the osu! staff.",
  "BWS will be enforced.",
  "There will be no rank buffer.",
]
