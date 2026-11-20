import { QB_COLS } from './QbRoom'
import { HISTORY_TIPS } from './FranchiseHistory'
import { RIVALRY_TIPS, lastMeeting } from './Rivalries'
import { lean, pct0 } from '../../utils/eloLean'
import { pct } from '../../utils/efficiencyMetrics'
import { weekName } from '../../utils/playoffRounds'
import { seasonLabel, seasonNumber } from '../../utils/seasons'
import { signed1, tallyText } from '../../utils/teamProfile'

const n = (label, desc, get, z = '0') => ({ label, desc, text: r => String(get(r)), value: get, z })

export const fingerprintSpec = (team, season, groups) => ({
  name: `${team.displayName} Fingerprint`,
  qualifier: `${seasonLabel(season)} · regular season · percentile against the league`,
  description: 'One row per metric for this team: its value, its percentile against the other teams (100 = best), and its league rank. Defense and points-allowed rows are flipped so a higher percentile is always better.',
  notes: ['Percentile is the share of other teams this one beats, with ties counting half. Rank uses competition ranking, so tied teams share a place.', 'Missing values are empty and are left out of percentiles.'],
  rows: groups.flatMap(g => g.rows.map(r => ({ ...r, group: g.title }))),
  cols: [
    { label: 'Group', desc: 'Offense, Defense, or Team-level.', text: r => r.group },
    { label: 'Metric', desc: 'The statistic. Hover the label on screen for its definition.', text: r => r.label },
    { label: 'Value', desc: 'The team\'s value, formatted as on screen.', text: r => r.text, value: r => r.value },
    { label: 'Better', desc: 'Whether a higher or lower value is better for this metric.', text: r => r.better },
    { label: 'Percentile', desc: '0 to 100; 100 is best in the league.', text: r => String(r.percentile), value: r => r.percentile, z: '0' },
    { label: 'Rank', desc: 'League rank, 1 is best.', text: r => String(r.rank?.rank), value: r => r.rank?.rank ?? null, z: '0' },
    { label: 'Of', desc: 'Teams with a value for this metric.', text: r => String(r.rank?.of), value: r => r.rank?.of ?? null, z: '0' },
  ],
  api: { path: '/efficiency', params: { season, stage: 'regular' }, note: `Team rows also use /api/standings?season=${season} and /api/elo/history?season=${season} (latest week). Percentiles are computed client-side.` },
})

export const truthSpec = (team, season, lanes) => ({
  name: `${team.displayName} Wins vs Expectation`,
  qualifier: `${seasonLabel(season)} · regular season · ${team.gamesPlayed} games`,
  description: 'Actual wins against the two expected-win models.',
  rows: lanes,
  cols: [
    { label: 'Measure', desc: 'Actual wins, PyPAT expected wins, or Elo expected wins.', text: r => r.label },
    { label: 'Wins', desc: 'Wins, one decimal for expectations.', text: r => r.value.toFixed(1), value: r => r.value, z: '0.0' },
    { label: 'Definition', desc: 'How the figure is computed.', text: r => r.tip },
  ],
  api: { path: '/standings', params: { season }, fields: { 'Actual wins': 'wins + ties / 2', 'PyPAT wins': 'pythagoreanPat × gamesPlayed', 'Elo wins': `Sum of this team's pregame win probability over /api/elo/games?teamId=${team.teamId} rows with season=${season} and week < 18` } },
})

export const arcSpec = (team, season, games) => ({
  name: `${team.displayName} Game Log`,
  qualifier: `${seasonLabel(season)} · week order`,
  description: 'Every completed game this season from this team\'s side, with pregame Elo win chance, Elo change and upset flags.',
  rows: games,
  cols: [
    { label: 'Week', desc: 'Week or playoff round.', text: g => weekName(g.week) },
    { label: 'Site', desc: 'Home or away.', text: g => (g.home ? 'Home' : 'Away') },
    { label: 'Opponent', desc: 'Opponent.', text: g => g.opp.displayName, logo: g => g.opp.abbrName },
    { label: 'Result', desc: 'W, L or T.', text: g => g.result },
    n('PF', 'Points scored.', g => g.teamScore),
    n('PA', 'Points allowed.', g => g.oppScore),
    { label: 'Win Prob', desc: 'Pregame Elo win chance.', text: g => pct0(g.winProb), value: g => g.winProb, z: '0%' },
    { label: 'Pregame Elo', desc: 'This team\'s Elo before the game.', text: g => g.preElo.toFixed(0), value: g => g.preElo, z: '0' },
    { label: 'Elo Change', desc: 'Elo points gained or lost in the game.', text: g => signed1(g.eloChange), value: g => g.eloChange, z: '+0.0;-0.0;0.0' },
    { label: 'Upset', desc: 'Upset level from the Elo page ladder, sized by the beaten favorite. "loss" means this team was the favorite that lost.', text: g => (g.upset ? (g.upset.won ? g.upset.label : `${g.upset.label} loss`) : ''), color: g => g.upset?.shade },
  ],
  api: { path: '/elo/games', params: { teamId: team.teamId, season }, fields: { 'Win Prob': 'homeWinProbability or awayWinProbability for this team', 'Elo Change': 'postgame minus pregame Elo for this team' } },
})

export const roadSpec = (team, season, road, projectedWins) => ({
  name: `${team.displayName} Remaining Schedule`,
  qualifier: `${seasonLabel(season)} · ${road.length} games left · week order`,
  description: 'Unplayed regular-season games with this team\'s Elo win chance from current ratings.',
  notes: [`Projected wins: ${projectedWins.toFixed(1)} (current wins plus the sum of remaining win chances).`],
  rows: road,
  cols: [
    { label: 'Week', desc: 'Week of the game.', text: r => weekName(r.week) },
    { label: 'Site', desc: 'Home or away.', text: r => (r.home ? 'Home' : 'Away') },
    { label: 'Opponent', desc: 'Opponent.', text: r => r.opp.displayName, logo: r => r.opp.abbrName },
    { label: 'Opp Elo', desc: 'Opponent\'s current Elo.', text: r => r.oppElo.toFixed(0), value: r => r.oppElo, z: '0' },
    { label: 'Win Prob', desc: 'This team\'s chance to win from current Elo, home field included.', text: r => pct0(r.winProb), value: r => r.winProb, z: '0%' },
    { label: 'Outlook', desc: 'How competitive the game should be, using the Elo page tiers, read from this team\'s side: "Likely loss" means the opponent is a Likely favorite.', text: r => { const l = lean(r.game); return l.tossUp ? l.tier.label : `${l.tier.label} ${r.winProb >= 0.5 ? 'win' : 'loss'}` } },
  ],
  api: { path: '/elo/upcoming', params: { season }, note: `Filtered to games involving teamId ${team.teamId}.` },
})

export const qbSpec = (team, season, rows, params) => ({
  name: `${team.displayName} QBs`,
  qualifier: `${seasonLabel(season)} · regular season · most attempts first`,
  description: 'Every quarterback who threw a pass for this team this season.',
  rows,
  cols: [
    { label: 'QB', desc: 'Quarterback name.', text: r => r.playerName },
    { label: 'Qualified', desc: 'Whether the QB has enough attempts to be ranked.', text: r => (r.qualified ? 'Yes' : 'No') },
    ...QB_COLS.map(c => ({ label: c.label, desc: c.desc, text: r => String(c.fmt(r[c.key])), value: r => r[c.key], z: c.z })),
  ],
  api: { path: '/qb/leaderboard', params, note: `Filtered to teamAbbr=${team.abbrName}; sorted by passAtt descending.` },
})

export const franchiseSpec = (team, rows) => ({
  name: `${team.displayName} Franchise History`,
  qualifier: 'Every season · newest first',
  description: 'One row per season: regular-season record, PyPAT and Luck, final Elo, Elo rank, peak Elo and playoff record.',
  rows,
  cols: [
    n('Season', HISTORY_TIPS.season, s => seasonNumber(s.season)),
    n('W', 'Regular-season wins.', s => s.wins),
    n('L', 'Regular-season losses.', s => s.losses),
    n('T', 'Regular-season ties.', s => s.ties),
    { label: 'PyPAT', desc: HISTORY_TIPS.pypat, text: s => pct(s.pythagoreanPat), value: s => s.pythagoreanPat, z: '0.0%' },
    { label: 'Luck', desc: HISTORY_TIPS.luck, text: s => signed1(s.winDiff), value: s => s.winDiff, z: '+0.0;-0.0;0.0' },
    { label: 'Final Elo', desc: HISTORY_TIPS.finalElo, text: s => s.finalElo?.toFixed(0), value: s => s.finalElo, z: '0' },
    { label: 'Elo Rank', desc: HISTORY_TIPS.finalRank, text: s => String(s.finalRank), value: s => s.finalRank, z: '0' },
    { label: 'Peak Elo', desc: HISTORY_TIPS.peakElo, text: s => s.peakElo?.toFixed(0), value: s => s.peakElo, z: '0' },
    { label: 'Playoffs', desc: HISTORY_TIPS.playoffs, text: s => (s.playoffs ? tallyText(s.playoffs) : '') },
  ],
  api: { path: '/trends/season', params: {}, note: `Rows filtered to teamId ${team.teamId}. Elo columns come from /api/elo/history; playoff record from /api/elo/games?teamId=${team.teamId} rows with week ≥ 18.` },
})

const RIVALRY_SORTS = { opp: 'Opponent', games: 'G', record: 'Record (win %)', diff: 'Pt Diff', ppg: 'PF–PA / G (differential)', last: 'Last meeting' }

export const rivalrySpec = (team, rows, sort, total) => ({
  name: `${team.displayName} Head to Head`,
  qualifier: `All seasons · regular season and playoffs · ${rows.length < total ? `top ${rows.length} of ${total} opponents` : `all ${total} opponents`} · sorted by ${RIVALRY_SORTS[sort.key]} ${sort.asc ? 'ascending' : 'descending'}`,
  description: 'All-time record against every opponent this team has played.',
  rows,
  cols: [
    { label: 'Opponent', desc: RIVALRY_TIPS.opp, text: r => r.opp.displayName, logo: r => r.opp.abbrName },
    n('G', RIVALRY_TIPS.games, r => r.games),
    n('W', 'Wins against this opponent.', r => r.w),
    n('L', 'Losses against this opponent.', r => r.l),
    n('T', 'Ties against this opponent.', r => r.t),
    { label: 'Pt Diff', desc: RIVALRY_TIPS.diff, text: r => (r.diff > 0 ? '+' : '') + r.diff, value: r => r.diff, z: '+0;-0;0' },
    { label: 'PF/G', desc: 'Points scored per game against this opponent.', text: r => (r.pf / r.games).toFixed(1), value: r => r.pf / r.games, z: '0.0' },
    { label: 'PA/G', desc: 'Points allowed per game against this opponent.', text: r => (r.pa / r.games).toFixed(1), value: r => r.pa / r.games, z: '0.0' },
    { label: 'Last meeting', desc: RIVALRY_TIPS.last, text: lastMeeting },
  ],
  api: { path: '/elo/games', params: { teamId: team.teamId }, note: 'Grouped by opponent client-side. Ties count half in win percentage.' },
})
