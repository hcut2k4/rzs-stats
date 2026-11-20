import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getSeasons, getStandings, getEfficiency, getQbLeaderboard, getEloUpcoming, getEloGames, getSeasonTrends, getEloHistory } from '../api/client'
import { useSorter } from '../components/SortTh'
import Masthead from '../components/team/Masthead'
import Fingerprint from '../components/team/Fingerprint'
import ScoreboardTruth from '../components/team/ScoreboardTruth'
import SeasonArc from '../components/team/SeasonArc'
import RoadAhead from '../components/team/RoadAhead'
import LeagueLandscape from '../components/team/LeagueLandscape'
import QbRoom, { QB_COLS } from '../components/team/QbRoom'
import FranchiseHistory, { HISTORY_TIPS } from '../components/team/FranchiseHistory'
import Rivalries, { RIVALRY_TIPS, lastMeeting } from '../components/team/Rivalries'
import { METRICS, pct, signed } from '../utils/efficiencyMetrics'
import { lean, pct0 } from '../utils/eloLean'
import { weekName } from '../utils/playoffRounds'
import { SEASON_OFFSET, seasonLabel, seasonNumber } from '../utils/seasons'
import {
  actualWins, eloExpectedWins, franchiseSeasons, headToHead, ordinal, percentileIn, pypatWins, rankIn, recordText,
  seasonArc, tally, tallyText, teamColorVars, teamGames, teamUpcoming,
} from '../utils/teamProfile'

const flip = better => (better === 'higher' ? 'lower' : 'higher')
const signed1 = v => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1))
const DEFENSE_LABELS = { giveawayRate: 'Takeaways/Drive' }
const SOS_TIP = 'Strength of schedule: average opponent-adjusted PyPAT, with this team\'s own games removed from each opponent. Higher means a harder schedule. Empty means no data, not 0.'

// Data is only handed out for the key it was loaded for, so a slow response for a season or team the user has left never renders.
function useLoad(key, loader) {
  const [state, setState] = useState({ key: null, data: null, error: false })
  useEffect(() => {
    if (key == null) return
    let live = true
    loader()
      .then(data => { if (live) setState({ key, data, error: false }) })
      .catch(() => { if (live) setState({ key, data: null, error: true }) })
    return () => { live = false }
  }, [key])
  const ready = key != null && state.key === key
  return { data: ready ? state.data : null, error: ready && state.error, loading: key != null && !ready }
}

const fingerprintRow = (key, label, tip, value, all, better, text) => ({
  key, label, tip, value, text, percentile: percentileIn(value, all, better), rank: rankIn(value, all, better),
})

function buildFingerprint(team, standings, efficiency, eloRows) {
  const eff = efficiency.find(r => r.teamId === team.teamId)
  const side = (name, better, tipKey) => METRICS.map(m => {
    const b = better(m.better)
    const all = efficiency.map(r => r[name][m.key])
    const label = name === 'defense' ? DEFENSE_LABELS[m.key] ?? m.label : m.label
    return fingerprintRow(`${name}.${m.key}`, label, m[tipKey], eff?.[name][m.key] ?? null, all, b, m.fmt(eff?.[name][m.key] ?? null))
  })
  const perGame = (r, k) => (r.gamesPlayed ? r[k] / r.gamesPlayed : null)
  const elo = eloRows.find(r => r.teamId === team.teamId)?.endElo ?? null
  return [
    { title: 'Offense', rows: side('offense', b => b, 'off') },
    { title: 'Defense', rows: side('defense', flip, 'def') },
    {
      title: 'Team',
      rows: [
        fingerprintRow('winPct', 'Win %', 'Winning percentage, ties as half a win.', team.gamesPlayed ? team.winPct : null, standings.filter(r => r.gamesPlayed).map(r => r.winPct), 'higher', team.gamesPlayed ? team.winPct.toFixed(3) : '—'),
        fingerprintRow('pypat', 'PyPAT', 'PythagoreanPAT win expectancy from points scored and allowed.', team.gamesPlayed ? team.pythagoreanPat : null, standings.filter(r => r.gamesPlayed).map(r => r.pythagoreanPat), 'higher', team.gamesPlayed ? pct(team.pythagoreanPat) : '—'),
        fingerprintRow('elo', 'Elo', 'Long-term strength rating after the latest week. 1500 is average.', elo, eloRows.map(r => r.endElo), 'higher', elo?.toFixed(0) ?? '—'),
        fingerprintRow('net', 'Net Pts/Drive', 'Offense points per drive minus defense points per drive.', eff?.netPointsPerDrive ?? null, efficiency.map(r => r.netPointsPerDrive), 'higher', signed(eff?.netPointsPerDrive ?? null)),
        fingerprintRow('pf', 'Avg PF', 'Points scored per game.', perGame(team, 'pointsFor'), standings.map(r => perGame(r, 'pointsFor')), 'higher', perGame(team, 'pointsFor')?.toFixed(1) ?? '—'),
        fingerprintRow('pa', 'Avg PA', 'Points allowed per game. Fewer is better.', perGame(team, 'pointsAgainst'), standings.map(r => perGame(r, 'pointsAgainst')), 'lower', perGame(team, 'pointsAgainst')?.toFixed(1) ?? '—'),
      ],
    },
  ]
}

function lastWeekRows(history, season) {
  const rows = history.filter(h => h.season === season)
  if (!rows.length) return []
  const week = Math.max(...rows.map(h => h.week))
  return rows.filter(h => h.week === week)
}

export default function TeamPage() {
  const { abbr = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const seasons = useLoad('seasons', getSeasons)
  const seasonList = seasons.data ?? []
  const requested = Number(params.get('season')) - SEASON_OFFSET
  const season = seasonList.includes(requested) ? requested : seasonList.length ? seasonList[seasonList.length - 1] : null
  const latest = seasonList.length ? seasonList[seasonList.length - 1] : null
  const setSeason = s => setParams(prev => {
    const p = new URLSearchParams(prev)
    s === latest ? p.delete('season') : p.set('season', String(seasonNumber(s)))
    return p
  }, { replace: true })

  const standings = useLoad(season == null ? null : `standings-${season}`, () => getStandings(season))
  const efficiency = useLoad(season == null ? null : `efficiency-${season}`, () => getEfficiency(season, 'regular'))
  const qbParams = season == null ? null : { scope: 'season', season, stage: 'regular', includeUnqualified: true }
  const qbs = useLoad(season == null ? null : `qb-${season}`, () => getQbLeaderboard(qbParams))
  const upcoming = useLoad(season == null ? null : `upcoming-${season}`, () => getEloUpcoming(season))
  const trends = useLoad('trends', getSeasonTrends)
  const history = useLoad('history', () => getEloHistory())

  const team = standings.data?.find(r => r.abbrName?.toUpperCase() === abbr.toUpperCase()) ?? null
  const teamId = team?.teamId ?? null
  const eloGames = useLoad(teamId == null ? null : `games-${teamId}`, () => getEloGames(undefined, undefined, teamId))

  useEffect(() => { window.scrollTo(0, 0) }, [abbr])

  const rivalrySort = useSorter({ key: 'games', asc: false })

  const allGames = useMemo(() => (eloGames.data && teamId != null ? teamGames(eloGames.data, teamId) : []), [eloGames.data, teamId])

  if (seasons.error || standings.error) {
    return <p className="text-bad">Could not load this team. Try again in a moment.</p>
  }
  if (!standings.data) return <p className="text-muted">Loading…</p>
  if (!team) {
    return (
      <div className="py-12 text-center">
        <p className="font-display font-extrabold uppercase text-3xl">Team not found</p>
        <p className="text-sm text-muted mt-2">No team uses the abbreviation “{abbr}”.</p>
        <Link to="/teams" className="btn mt-4">Browse all teams</Link>
      </div>
    )
  }

  const seasonText = seasonLabel(season)
  const teamHref = a => `/teams/${a}${season !== latest ? `?season=${seasonNumber(season)}` : ''}`
  const all = standings.data
  const historyRows = history.data ?? []
  const eloNow = lastWeekRows(historyRows, season)
  const myElo = eloNow.find(r => r.teamId === teamId)
  const prevElo = season > 0 ? lastWeekRows(historyRows, season - 1).find(r => r.teamId === teamId) : null
  const prevStanding = trends.data?.find(t => t.seasonIndex === season - 1)?.standings.find(r => r.teamId === teamId)
  const effRows = efficiency.data ?? []
  const eff = effRows.find(r => r.teamId === teamId)
  const played = team.gamesPlayed > 0

  const sosReady = all.some(r => r.gamesPlayed >= 3)
  const sosMode = season === latest || !sosReady ? 'Prev' : 'Curr'
  const sosField = kind => {
    const primary = `oppPyPat${kind}${sosMode}`
    return team[primary] != null ? primary : `oppPyPat${kind}${sosMode === 'Prev' ? 'Curr' : 'Prev'}`
  }
  const sosText = field => (team[field] == null ? '—' : pct(team[field]))
  const sosSource = field => (field.endsWith('Prev') ? 'previous-season opponent quality' : 'current-season opponent quality')
  const playedField = sosField('')
  const leftField = sosField('Remaining')

  const division = all.filter(r => r.division === team.division)
  const divRank = rankIn(team.winPct, division.map(r => r.winPct))

  const kpis = [
    { label: 'Record', value: recordText(team), note: played ? `${ordinal(divRank.rank)} in ${team.division}` : 'No games yet', tip: 'Regular-season record. Division place is by win percentage; ties share a place.' },
    {
      label: 'PyPAT', value: played ? pct(team.pythagoreanPat) : '—', tip: 'PythagoreanPAT win expectancy from points scored and allowed. 50% is break-even.',
      rank: played ? rankIn(team.pythagoreanPat, all.filter(r => r.gamesPlayed).map(r => r.pythagoreanPat)) : null,
      delta: played && prevStanding?.gamesPlayed ? (d => ({ up: d >= 0, text: `${Math.abs(d * 100).toFixed(1)} vs S${seasonNumber(season - 1)}`, title: `Change from ${seasonLabel(season - 1)} PyPAT` }))(team.pythagoreanPat - prevStanding.pythagoreanPat) : null,
    },
    {
      label: 'Luck', value: played ? signed1(team.winDiff) : '—', tip: 'Actual wins minus PyPAT-expected wins. Positive means more wins than scoring margin justifies.',
      note: played ? (team.winDiff > 0.5 ? 'Lucky' : team.winDiff < -0.5 ? 'Unlucky' : 'Even') : null,
    },
    {
      label: 'Elo', value: myElo ? myElo.endElo.toFixed(0) : '—', tip: 'Long-term strength rating, carried across seasons. 1500 is average.',
      rank: myElo ? { rank: myElo.rank, of: eloNow.length } : null,
      delta: myElo && prevElo ? (d => ({ up: d >= 0, text: `${Math.abs(d).toFixed(0)} vs S${seasonNumber(season - 1)}`, title: `Change from the end of ${seasonLabel(season - 1)}` }))(myElo.endElo - prevElo.endElo) : null,
    },
    {
      label: 'Net Pts/Drive', value: signed(eff?.netPointsPerDrive ?? null), tip: 'Offense points per drive minus defense points per drive, regular season.',
      rank: rankIn(eff?.netPointsPerDrive, effRows.map(r => r.netPointsPerDrive)),
    },
    {
      label: 'SoS Played', value: sosText(playedField), tip: `${SOS_TIP} Uses ${sosSource(playedField)}.`, neutral: true,
      rank: rankIn(team[playedField], all.map(r => r[playedField])), rankWord: ' hardest',
    },
  ]

  const groups = buildFingerprint(team, all, effRows, eloNow)
  const fingerprintSpec = {
    name: `${team.displayName} Fingerprint`,
    qualifier: `${seasonText} · regular season · percentile against the league`,
    description: 'One row per metric for this team: its value, its percentile against the other teams (100 = best), and its league rank. Defense and points-allowed rows are flipped so a higher percentile is always better.',
    notes: ['Percentile is the share of other teams this one beats, with ties counting half. Rank uses competition ranking, so tied teams share a place.', 'Missing values are empty and are left out of percentiles.'],
    rows: groups.flatMap(g => g.rows.map(r => ({ ...r, group: g.title }))),
    cols: [
      { label: 'Group', desc: 'Offense, Defense, or Team-level.', text: r => r.group },
      { label: 'Metric', desc: 'The statistic. Hover the label on screen for its definition.', text: r => r.label },
      { label: 'Value', desc: 'The team\'s value, formatted as on screen.', text: r => r.text, keepText: true },
      { label: 'Percentile', desc: '0 to 100; 100 is best in the league.', text: r => (r.percentile == null ? '' : String(r.percentile)), value: r => r.percentile, z: '0' },
      { label: 'Rank', desc: 'League rank, 1 is best.', text: r => (r.rank ? String(r.rank.rank) : ''), value: r => r.rank?.rank ?? null, z: '0' },
      { label: 'Of', desc: 'Teams with a value for this metric.', text: r => (r.rank ? String(r.rank.of) : ''), value: r => r.rank?.of ?? null, z: '0' },
    ],
    api: { path: '/efficiency', params: { season, stage: 'regular' }, note: `Team rows also use /api/standings?season=${season} and /api/elo/history?season=${season} (latest week). Percentiles are computed client-side.` },
  }

  const seasonGames = seasonArc(allGames.filter(g => g.season === season))
  const regularGames = seasonGames.filter(g => !g.playoff)
  const lanes = [
    { key: 'actual', label: 'Actual wins', tip: 'Wins, with a tie counted as half.', value: actualWins(team), color: 'rgb(var(--ink))' },
    { key: 'pypat', label: 'PyPAT wins', tip: 'PyPAT win expectancy times games played: the wins scoring margin justifies.', value: pypatWins(team), color: 'rgb(var(--accent))' },
    ...(eloGames.data ? [{ key: 'elo', label: 'Elo wins', tip: 'The sum of the pregame Elo win chance across every game played. It accounts for opponent strength and home field.', value: eloExpectedWins(regularGames), color: '#d97706' }] : []),
  ]
  const truthSpec = {
    name: `${team.displayName} Wins vs Expectation`,
    qualifier: `${seasonText} · regular season · ${team.gamesPlayed} games`,
    description: 'Actual wins against the two expected-win models.',
    rows: lanes,
    cols: [
      { label: 'Measure', desc: 'Actual wins, PyPAT expected wins, or Elo expected wins.', text: r => r.label },
      { label: 'Wins', desc: 'Wins, one decimal for expectations.', text: r => r.value.toFixed(1), value: r => r.value, z: '0.0' },
      { label: 'Definition', desc: 'How the figure is computed.', text: r => r.tip },
    ],
    api: { path: '/standings', params: { season }, fields: { 'PyPAT wins': 'pythagoreanPat × gamesPlayed', 'Actual wins': 'wins + ties / 2', 'Elo wins': `Sum of this team's pregame win probability over /api/elo/games?teamId=${teamId} rows with season=${season} and week < 18` } },
  }

  const arcSpec = {
    name: `${team.displayName} Game Log`,
    qualifier: `${seasonText} · week order`,
    description: 'Every completed game this season from this team\'s side, with pregame Elo win chance, Elo change and upset flags.',
    rows: seasonGames,
    cols: [
      { label: 'Week', desc: 'Week or playoff round.', text: g => weekName(g.week) },
      { label: 'Site', desc: 'Home or away.', text: g => (g.home ? 'Home' : 'Away') },
      { label: 'Opponent', desc: 'Opponent.', text: g => g.opp.displayName, logo: g => g.opp.abbrName },
      { label: 'Result', desc: 'W, L or T.', text: g => g.result },
      { label: 'PF', desc: 'Points scored.', text: g => String(g.teamScore), value: g => g.teamScore, z: '0' },
      { label: 'PA', desc: 'Points allowed.', text: g => String(g.oppScore), value: g => g.oppScore, z: '0' },
      { label: 'Win Prob', desc: 'Pregame Elo win chance.', text: g => pct0(g.winProb), value: g => g.winProb, z: '0%' },
      { label: 'Pregame Elo', desc: 'This team\'s Elo before the game.', text: g => g.preElo.toFixed(0), value: g => g.preElo, z: '0' },
      { label: 'Elo Change', desc: 'Elo points gained or lost in the game.', text: g => signed1(g.eloChange), value: g => g.eloChange, z: '+0.0;-0.0;0.0' },
      { label: 'Upset', desc: 'Upset level from the Elo page ladder, sized by the beaten favorite. "loss" means this team was the favorite that lost.', text: g => (g.upset ? (g.upset.won ? g.upset.label : `${g.upset.label} loss`) : ''), color: g => g.upset?.shade },
    ],
    api: { path: '/elo/games', params: { teamId, season }, fields: { 'Win Prob': 'homeWinProbability or awayWinProbability for this team', 'Elo Change': 'postgame minus pregame Elo for this team' } },
  }

  const road = teamUpcoming(upcoming.data ?? [], teamId)
  const remaining = road.reduce((s, r) => s + r.winProb, 0)
  const projWins = actualWins(team) + remaining
  const totalGames = team.gamesPlayed + road.length
  const projW = Math.round(projWins)
  const leftRank = rankIn(team[leftField], all.map(r => r[leftField]))
  const roadSpec = {
    name: `${team.displayName} Remaining Schedule`,
    qualifier: `${seasonText} · ${road.length} games left · week order`,
    description: 'Unplayed regular-season games with this team\'s Elo win chance from current ratings.',
    notes: [`Projected wins: ${projWins.toFixed(1)} (current wins plus the sum of remaining win chances).`],
    rows: road,
    cols: [
      { label: 'Week', desc: 'Week of the game.', text: r => weekName(r.week) },
      { label: 'Site', desc: 'Home or away.', text: r => (r.home ? 'Home' : 'Away') },
      { label: 'Opponent', desc: 'Opponent.', text: r => r.opp.displayName, logo: r => r.opp.abbrName },
      { label: 'Opp Elo', desc: 'Opponent\'s current Elo.', text: r => r.oppElo.toFixed(0), value: r => r.oppElo, z: '0' },
      { label: 'Win Prob', desc: 'This team\'s chance to win from current Elo, home field included.', text: r => pct0(r.winProb), value: r => r.winProb, z: '0%' },
      { label: 'Outlook', desc: 'How competitive the game should be, using the Elo page tiers.', text: r => lean(r.game).tier.label, color: r => lean(r.game).shade },
    ],
    api: { path: '/elo/upcoming', params: { season }, note: `Filtered to games involving teamId ${teamId}.` },
  }

  const myQbs = (qbs.data ?? []).filter(q => q.teamAbbr === team.abbrName).sort((a, b) => b.passAtt - a.passAtt)
  const qbSpec = {
    name: `${team.displayName} QBs`,
    qualifier: `${seasonText} · regular season · most attempts first`,
    description: 'Every quarterback who threw a pass for this team this season.',
    rows: myQbs,
    cols: [
      { label: 'QB', desc: 'Quarterback name.', text: r => r.playerName },
      { label: 'Qualified', desc: 'Whether the QB has enough attempts to be ranked.', text: r => (r.qualified ? 'Yes' : 'No') },
      ...QB_COLS.map(c => ({ label: c.label, desc: c.desc, text: r => String(c.fmt(r[c.key])), value: r => r[c.key], z: c.z })),
    ],
    api: { path: '/qb/leaderboard', params: qbParams ?? {}, note: `Filtered to teamAbbr=${team.abbrName}; sorted by passAtt descending.` },
  }

  const franchise = franchiseSeasons(trends.data ?? [], historyRows, allGames, teamId)
  const points = historyRows.filter(h => h.teamId === teamId).sort((a, b) => a.season - b.season || a.week - b.week)
  const regAll = tally(allGames.filter(g => !g.playoff))
  const postAll = tally(allGames.filter(g => g.playoff))
  const allTimeText = allGames.length
    ? `All-time ${tallyText(regAll)} in the regular season${postAll.w + postAll.l + postAll.t ? ` and ${tallyText(postAll)} in the playoffs` : ', no playoff games yet'}.`
    : null
  const franchiseSpec = {
    name: `${team.displayName} Franchise History`,
    qualifier: 'Every season · oldest first',
    description: 'One row per season: regular-season record, PyPAT and Luck, final Elo, Elo rank and playoff record.',
    rows: franchise,
    cols: [
      { label: 'Season', desc: HISTORY_TIPS.season, text: s => String(seasonNumber(s.season)), value: s => seasonNumber(s.season), z: '0' },
      { label: 'W', desc: 'Regular-season wins.', text: s => String(s.wins), value: s => s.wins, z: '0' },
      { label: 'L', desc: 'Regular-season losses.', text: s => String(s.losses), value: s => s.losses, z: '0' },
      { label: 'T', desc: 'Regular-season ties.', text: s => String(s.ties), value: s => s.ties, z: '0' },
      { label: 'PyPAT', desc: HISTORY_TIPS.pypat, text: s => pct(s.pythagoreanPat), value: s => s.pythagoreanPat, z: '0.0%' },
      { label: 'Luck', desc: HISTORY_TIPS.luck, text: s => signed1(s.winDiff), value: s => s.winDiff, z: '+0.0;-0.0;0.0' },
      { label: 'Final Elo', desc: HISTORY_TIPS.finalElo, text: s => s.finalElo?.toFixed(0) ?? '', value: s => s.finalElo, z: '0' },
      { label: 'Elo Rank', desc: HISTORY_TIPS.finalRank, text: s => (s.finalRank == null ? '' : String(s.finalRank)), value: s => s.finalRank, z: '0' },
      { label: 'Peak Elo', desc: HISTORY_TIPS.peakElo, text: s => s.peakElo?.toFixed(0) ?? '', value: s => s.peakElo, z: '0' },
      { label: 'Playoffs', desc: HISTORY_TIPS.playoffs, text: s => (s.playoffs ? tallyText(s.playoffs) : '') },
    ],
    api: { path: '/trends/season', params: {}, note: `Rows filtered to teamId ${teamId}. Elo columns come from /api/elo/history; playoff record from /api/elo/games?teamId=${teamId} rows with week ≥ 18.` },
  }

  const h2h = rivalrySort.apply(headToHead(allGames), {
    opp: r => r.opp.displayName,
    games: r => r.games,
    record: r => r.winPct,
    diff: r => r.diff,
    ppg: r => (r.pf - r.pa) / r.games,
    last: r => r.last.season * 100 + r.last.week,
  })
  const sortNames = { opp: 'Opponent', games: 'G', record: 'Record (win %)', diff: 'Pt Diff', ppg: 'PF–PA / G (differential)', last: 'Last meeting' }
  const rivalrySpec = {
    name: `${team.displayName} Head to Head`,
    qualifier: `All seasons · regular season and playoffs · sorted by ${sortNames[rivalrySort.sort.key]} ${rivalrySort.sort.asc ? 'ascending' : 'descending'}`,
    description: 'All-time record against every opponent this team has played.',
    rows: h2h,
    cols: [
      { label: 'Opponent', desc: RIVALRY_TIPS.opp, text: r => r.opp.displayName, logo: r => r.opp.abbrName },
      { label: 'G', desc: RIVALRY_TIPS.games, text: r => String(r.games), value: r => r.games, z: '0' },
      { label: 'W', desc: 'Wins against this opponent.', text: r => String(r.w), value: r => r.w, z: '0' },
      { label: 'L', desc: 'Losses against this opponent.', text: r => String(r.l), value: r => r.l, z: '0' },
      { label: 'T', desc: 'Ties against this opponent.', text: r => String(r.t), value: r => r.t, z: '0' },
      { label: 'Pt Diff', desc: RIVALRY_TIPS.diff, text: r => (r.diff > 0 ? '+' : '') + r.diff, value: r => r.diff, z: '+0;-0;0' },
      { label: 'PF/G', desc: 'Points scored per game against this opponent.', text: r => (r.pf / r.games).toFixed(1), value: r => r.pf / r.games, z: '0.0' },
      { label: 'PA/G', desc: 'Points allowed per game against this opponent.', text: r => (r.pa / r.games).toFixed(1), value: r => r.pa / r.games, z: '0.0' },
      { label: 'Last meeting', desc: RIVALRY_TIPS.last, text: lastMeeting },
    ],
    api: { path: '/elo/games', params: { teamId }, note: 'Grouped by opponent client-side. Ties count half in win percentage.' },
  }

  const failed = [
    efficiency.error && 'efficiency', qbs.error && 'quarterbacks', upcoming.error && 'remaining schedule',
    eloGames.error && 'game log', trends.error && 'season history', history.error && 'Elo history',
  ].filter(Boolean)

  return (
    <div className="team-scope" style={teamColorVars(team.primaryColor)}>
      <Masthead team={team} season={season} seasons={seasonList} onSeason={setSeason} kpis={kpis} />
      {failed.length > 0 && <p className="text-sm text-bad mb-6">Some sections could not load: {failed.join(', ')}.</p>}
      <div className="space-y-10">
        <Fingerprint groups={groups} spec={fingerprintSpec} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <ScoreboardTruth lanes={lanes} games={team.gamesPlayed} spec={truthSpec} />
          {road.length > 0
            ? <RoadAhead rows={road} projection={{ wins: projWins, remaining, record: `${projW}-${totalGames - projW}` }} teamHref={teamHref} sosLeft={{ text: sosText(leftField), tip: `${SOS_TIP} Remaining games only. Uses ${sosSource(leftField)}.`, rank: leftRank ? `${ordinal(leftRank.rank)} hardest of ${leftRank.of}` : null }} spec={roadSpec} />
            : <LeagueLandscape rows={effRows} teamId={teamId} seasonText={seasonText} />}
        </div>
        <SeasonArc games={seasonGames} spec={arcSpec} seasonText={seasonText} teamHref={teamHref} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {road.length > 0 && <LeagueLandscape rows={effRows} teamId={teamId} seasonText={seasonText} />}
          <div className={road.length > 0 ? '' : 'lg:col-span-2'}>
            <QbRoom rows={myQbs} league={qbs.data ?? []} spec={qbSpec} seasonText={seasonText} />
          </div>
        </div>
        <FranchiseHistory points={points} seasons={franchise} allTime={allTimeText} spec={franchiseSpec} />
        <Rivalries rows={h2h} sorter={rivalrySort} spec={rivalrySpec} />
      </div>
    </div>
  )
}
