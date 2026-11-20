import { FINGERPRINT_SUMMARY, LANDSCAPE_FOOTER, TRUTH_EXPLANATION, UNQUALIFIED_TIP, truthSummary, landscapeSummary, roadSummary, roadFooter, outlookTip, arcSummary, qbSummary, rivalrySummary, count } from '../../utils/teamProfileCopy'
import { headerImage, fingerprintImage, truthImage, arcImage, franchiseImage, landscapeImage, tableWithFooter } from './images'
import { goodBadColor, divergeColor } from '../../utils/heat'
import { halfPointScale, leaguePointsPerDrive, tierPoints } from '../../utils/efficiencyMetrics'
import { quadrant, projectedRecord, recordText, teamColor } from '../../utils/teamProfile'
import { QB_COLS } from './QbRoom'
import { HISTORY_TIPS } from './FranchiseHistory'
import { RIVALRY_TIPS, lastMeeting } from './Rivalries'
import { lean, pct0 } from '../../utils/eloLean'
import { pct } from '../../utils/efficiencyMetrics'
import { weekName } from '../../utils/playoffRounds'
import { seasonLabel, seasonNumber } from '../../utils/seasons'
import { ordinal, signed1, tallyText } from '../../utils/teamProfile'

const n = (label, desc, get, z = '0') => ({ label, desc, text: r => String(get(r)), value: get, z })

export const fingerprintSpec = (team, season, groups) => ({
  name: `${team.displayName} Fingerprint`,
  qualifier: `${seasonLabel(season)}. ${FINGERPRINT_SUMMARY}`,
  description: FINGERPRINT_SUMMARY,
  notes: ['Percentile is the share of other teams this one beats, with ties counting half. Rank uses competition ranking, so tied teams share a place.', 'Missing values are empty and are left out of percentiles.'],
  image: fingerprintImage(groups),
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

export const truthSpec = (team, season, lanes, arc = []) => ({
  name: `${team.displayName} Wins vs Expectation`,
  qualifier: `${seasonLabel(season)}. ${truthSummary(team.displayName, lanes)}`,
  description: truthSummary(team.displayName, lanes),
  notes: [TRUTH_EXPLANATION],
  image: truthImage(lanes, team.gamesPlayed, arc),
  rows: lanes,
  cols: [
    { label: 'Measure', desc: 'Actual wins, PyPAT expected wins, or Elo expected wins.', text: r => r.label },
    { label: 'Wins', desc: 'Wins, one decimal for expectations.', text: r => r.value.toFixed(1), value: r => r.value, z: '0.0' },
    { label: 'Definition', desc: 'How the figure is computed.', text: r => r.tip },
  ],
  api: { path: '/standings', params: { season }, fields: { 'Actual wins': 'wins + ties / 2', 'PyPAT wins': 'pythagoreanPat × gamesPlayed', 'Elo wins': `Sum of this team's pregame win probability over /api/elo/games?teamId=${team.teamId} rows with season=${season} and week < 18` } },
})

export const arcSpec = (team, season, games, inProgress = false) => ({
  name: `${team.displayName} Game Log`,
  qualifier: `${seasonLabel(season)}. ${arcSummary(team.displayName, games, inProgress)}`,
  description: arcSummary(team.displayName, games, inProgress),
  image: arcImage(team, games),
  rows: games,
  cols: [
    { label: 'Week', desc: 'Week or playoff round.', text: g => weekName(g.week) },
    { label: 'Site', desc: 'Home or away.', text: g => (g.home ? 'Home' : 'Away') },
    { label: 'Opponent', desc: 'Opponent.', text: g => g.opp.displayName, logo: g => g.opp.abbrName },
    { label: 'Result', desc: 'W, L or T.', text: g => g.result },
    n('PF', 'Points scored.', g => g.teamScore),
    n('PA', 'Points allowed.', g => g.oppScore),
    { label: 'Win probability', desc: 'Pregame win probability from Elo.', text: g => pct0(g.winProb), value: g => g.winProb, z: '0%' },
    { label: 'Pregame Elo', desc: 'This team\'s Elo before the game.', text: g => g.preElo.toFixed(0), value: g => g.preElo, z: '0' },
    { label: 'Elo Change', desc: 'Elo points gained or lost in the game.', text: g => signed1(g.eloChange), value: g => g.eloChange, z: '+0.0;-0.0;0.0' },
    { label: 'Upset', desc: 'Upset level from the Elo page ladder, sized by the beaten favorite. "loss" means this team was the favorite that lost.', text: g => (g.upset ? (g.upset.won ? g.upset.label : `${g.upset.label} loss`) : ''), color: g => g.upset?.shade },
  ],
  api: { path: '/elo/games', params: { teamId: team.teamId, season }, fields: { 'Win probability': 'homeWinProbability or awayWinProbability for this team', 'Elo Change': 'postgame minus pregame Elo for this team' } },
})

export const roadSpec = (team, season, road, sosLeft = {}) => {
  const spec = {
    name: `${team.displayName} Remaining Schedule`,
    qualifier: `${seasonLabel(season)} · ${count(road.length, 'game')} left. ${roadSummary(team, road)}`,
    description: roadSummary(team, road),
    notes: [roadFooter(team.displayName)],
    tiles: [
      { label: 'Projected record', value: recordText(projectedRecord(team, road)) },
      { label: 'Favored in', value: `${road.filter(r => r.winProb >= 0.5).length} of ${road.length}` },
      { label: 'Remaining SoS', value: sosLeft.text, note: sosLeft.rank },
    ],
    rows: road,
    cols: [
      { label: 'Week', desc: 'Week of the game.', text: r => weekName(r.week) },
      { label: 'Site', desc: 'Home or away.', text: r => (r.home ? 'Home' : 'Away') },
      { label: 'Opponent', desc: 'Opponent.', text: r => r.opp.displayName, logo: r => r.opp.abbrName },
      { label: 'Opp Elo', desc: 'Opponent\'s current Elo.', text: r => r.oppElo.toFixed(0), value: r => r.oppElo, z: '0' },
      { label: 'Win probability', desc: 'This team\'s win probability from current Elo, home field included.', chance: r => r.winProb, text: r => pct0(r.winProb), value: r => r.winProb, z: '0%' },
      { label: 'Outlook', desc: outlookTip(), pill: () => true, text: r => { const l = lean(r.game); return l.tossUp ? l.tier.label : `${l.tier.label} ${r.winProb >= 0.5 ? 'win' : 'loss'}` } },
    ],
    api: { path: '/elo/upcoming', params: { season }, note: `Filtered to games involving teamId ${team.teamId}.` },
  }
  spec.image = tableWithFooter(spec, roadFooter(team.displayName))
  return spec
}

export const qbSpec = (team, season, rows, params, league = rows) => ({
  name: `${team.displayName} QBs`,
  rowMuted: r => r && !r.qualified,
  qualifier: `${seasonLabel(season)}. ${qbSummary(team.displayName)} Regular season only.`,
  description: qbSummary(team.displayName),
  rows,
  cols: [
    { label: 'QB', desc: 'Quarterback name.', text: r => r.playerName },
    { label: 'Qualified', desc: UNQUALIFIED_TIP, text: r => (r.qualified ? 'Yes' : 'No') },
    ...QB_COLS.map(c => ({ label: c.label, desc: c.desc, text: r => String(c.fmt(r[c.key])), value: r => r[c.key], z: c.z, color: r => c.heat && r.qualified ? goodBadColor(r[c.key], league.filter(q => q.qualified).map(q => q[c.key]), c.heat) : undefined })),
  ],
  api: { path: '/qb/leaderboard', params, note: `Filtered to teamAbbr=${team.abbrName}; sorted by passAtt descending.` },
})

export const franchiseSpec = (team, rows, points = [], summary = '') => {
  const spec = {
    name: `${team.displayName} Franchise History`,
    qualifier: `Every season · newest first. ${summary}`,
    description: summary,
    rows,
    cols: [
      n('Season', HISTORY_TIPS.season, s => seasonNumber(s.season)),
      n('W', 'Regular-season wins.', s => s.wins),
      n('L', 'Regular-season losses.', s => s.losses),
      n('T', 'Regular-season ties.', s => s.ties),
      { label: 'PyPAT', desc: HISTORY_TIPS.pypat, color: s => goodBadColor(s.pythagoreanPat, [0.2, 0.8, ...rows.map(r => r.pythagoreanPat)]), text: s => pct(s.pythagoreanPat), value: s => s.pythagoreanPat, z: '0.0%' },
      { label: 'Luck', desc: HISTORY_TIPS.luck, color: s => divergeColor(s.winDiff, Math.max(2, ...rows.map(r => Math.abs(r.winDiff ?? 0)))), text: s => signed1(s.winDiff), value: s => s.winDiff, z: '+0.0;-0.0;0.0' },
      { label: 'Final Elo', desc: HISTORY_TIPS.finalElo, text: s => s.finalElo?.toFixed(0), value: s => s.finalElo, z: '0' },
      { label: 'Elo Rank', desc: HISTORY_TIPS.finalRank, text: s => String(s.finalRank), value: s => s.finalRank, z: '0' },
      { label: 'Peak Elo', desc: HISTORY_TIPS.peakElo, text: s => s.peakElo?.toFixed(0), value: s => s.peakElo, z: '0' },
      { label: 'Playoffs', desc: HISTORY_TIPS.playoffs, text: s => (s.playoffs ? tallyText(s.playoffs) : '') },
    ],
    api: { path: '/trends/season', params: {}, note: `Rows filtered to teamId ${team.teamId}. Elo columns come from /api/elo/history; playoff record from /api/elo/games?teamId=${team.teamId} rows with week ≥ 18.` },
  }
  spec.image = franchiseImage(team, points, spec)
  return spec
}

const RIVALRY_SORTS = { opp: 'Opponent', games: 'GP', record: 'Record (win %)', diff: 'Point Diff', ppg: 'Pts/G For–Against (differential)', last: 'Last meeting' }

export const rivalrySpec = (team, rows, sort, total) => ({
  name: `${team.displayName} Head to Head`,
  qualifier: `All seasons · regular season and playoffs · ${rows.length < total ? `top ${rows.length} of ${total} opponents` : `all ${total} opponents`} · sorted by ${RIVALRY_SORTS[sort.key]} ${sort.asc ? 'ascending' : 'descending'}. ${rivalrySummary(team.displayName, total)}`,
  description: rivalrySummary(team.displayName, total),
  rows,
  cols: [
    { label: 'Opponent', desc: RIVALRY_TIPS.opp, text: r => r.opp.displayName, logo: r => r.opp.abbrName },
    n('GP', RIVALRY_TIPS.games, r => r.games),
    n('W', 'Wins against this opponent.', r => r.w),
    n('L', 'Losses against this opponent.', r => r.l),
    n('T', 'Ties against this opponent.', r => r.t),
    { label: 'Point Diff', desc: RIVALRY_TIPS.diff, text: r => (r.diff > 0 ? '+' : '') + r.diff, value: r => r.diff, z: '+0;-0;0' },
    { label: 'Pts/G For–Against', desc: RIVALRY_TIPS.ppg, text: r => `${(r.pf / r.games).toFixed(1)}–${(r.pa / r.games).toFixed(1)}` },
    { label: 'Last meeting', desc: RIVALRY_TIPS.last, text: lastMeeting },
  ],
  api: { path: '/elo/games', params: { teamId: team.teamId }, note: 'Grouped by opponent client-side. Ties count half in win percentage.' },
})

export const headerSpec = (team, season, kpis) => ({
  name: `${team.displayName} Profile`,
  qualifier: `${seasonLabel(season)}`,
  rows: kpis,
  cols: [
    { label: 'Label', desc: 'Headline statistic.', text: r => r.label },
    { label: 'Value', desc: 'Displayed statistic.', text: r => r.value },
    { label: 'Rank', desc: 'League rank and number of teams.', text: r => r.rank ? `${ordinal(r.rank.rank)}${r.rankWord ?? ''} of ${r.rank.of}` : '' },
    { label: 'Note', desc: 'Context for the statistic.', text: r => r.note },
    { label: 'Delta', desc: 'Change from the previous season.', text: r => r.delta ? `${r.delta.minor ? '' : r.delta.up ? '▲ ' : '▼ '}${r.delta.text}` : '' },
  ],
  image: headerImage(team, season, kpis),
  api: { path: '/standings', params: { season }, note: 'Elo uses /api/elo/history; net points per drive uses /api/efficiency with stage=regular.' },
})

export function landscapeSpec(rows, teamId, season, team) {
  const points = tierPoints(rows)
  const league = leaguePointsPerDrive(rows)
  const chart = { points, league, xScale: halfPointScale(points.map(p => p.x)), yScale: halfPointScale(points.map(p => p.y)), focus: teamId, focusColor: teamColor(team?.primaryColor) ?? '#1d4ed8' }
  return {
    name: `${team?.displayName ?? 'Team'} League Landscape`,
    qualifier: `${seasonLabel(season)}. ${points.some(p => p.id === teamId) ? landscapeSummary(team.displayName, points.find(p => p.id === teamId).x, points.find(p => p.id === teamId).y, league) : ''}`,
    description: points.some(p => p.id === teamId) ? landscapeSummary(team.displayName, points.find(p => p.id === teamId).x, points.find(p => p.id === teamId).y, league) : '',
    notes: [LANDSCAPE_FOOTER],
    rows: points,
    cols: [
      { label: 'Team', desc: 'Team name.', text: r => r.name, logo: r => r.abbr },
      n('Offense', 'Offense points per drive.', r => r.x, '0.00'),
      n('Defense', 'Defense points allowed per drive.', r => r.y, '0.00'),
      n('Net', 'Offense minus defense points per drive.', r => r.x - r.y, '0.00'),
      { label: 'Quadrant', desc: 'Offense and defense compared with the league average.', text: r => { const q = quadrant(r.x, r.y, league); return `${q.goodOffense ? 'Good' : 'Bad'} offense, ${q.goodDefense ? 'good' : 'bad'} defense` } },
    ],
    image: landscapeImage(chart),
    api: { path: '/efficiency', params: { season, stage: 'regular' } },
  }
}
