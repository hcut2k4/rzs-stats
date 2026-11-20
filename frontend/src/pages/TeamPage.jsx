import { useEffect, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getSeasons, getStandings, getEfficiency, getQbLeaderboard, getEloUpcoming, getEloGames, getSeasonTrends, getEloHistory } from '../api/client'
import { useSorter } from '../components/SortTh'
import Masthead from '../components/team/Masthead'
import Fingerprint from '../components/team/Fingerprint'
import ScoreboardTruth from '../components/team/ScoreboardTruth'
import SeasonArc from '../components/team/SeasonArc'
import RoadAhead from '../components/team/RoadAhead'
import LeagueLandscape from '../components/team/LeagueLandscape'
import QbRoom from '../components/team/QbRoom'
import FranchiseHistory from '../components/team/FranchiseHistory'
import Rivalries from '../components/team/Rivalries'
import { arcSpec, fingerprintSpec, franchiseSpec, qbSpec, rivalrySpec, roadSpec, truthSpec } from '../components/team/specs'
import { pct, signed } from '../utils/efficiencyMetrics'
import { useLoad } from '../utils/useLoad'
import { SEASON_OFFSET, seasonLabel, seasonNumber } from '../utils/seasons'
import {
  actualWins, eloExpectedWins, fingerprint, franchiseSeasons, headToHead, lastWeekRows, luckLean, ordinal, projectedRecord,
  pypatWins, rankIn, recordText, seasonArc, signed1, sosVariant, tally, tallyText, teamColorVars, teamGames, teamUpcoming,
} from '../utils/teamProfile'

const SOS_TIP = 'Strength of schedule: average opponent-adjusted PyPAT, with this team\'s own games removed from each opponent. Higher means a harder schedule. Empty means no data, not 0.'
const LUCK_WORD = { 1: 'Lucky', 0: 'Even', '-1': 'Unlucky' }

function delta(diff, minor, text, title) {
  return { up: diff >= 0, minor: Math.abs(diff) < minor, text, title }
}

function SectionNav({ links }) {
  return (
    <nav aria-label="Profile sections" className="sticky top-14 z-20 -mx-4 px-4 mb-8 bg-bg/95 backdrop-blur border-b border-line overflow-x-auto">
      <ul className="flex gap-5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap">
        {links.map(([id, label]) => <li key={id}><a href={`#${id}`} className="block py-2.5 text-muted hover:text-ink">{label}</a></li>)}
      </ul>
    </nav>
  )
}

export default function TeamPage() {
  const { abbr = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const seasons = useLoad('seasons', getSeasons)
  const seasonList = seasons.data ?? []
  const latest = seasonList.length ? seasonList[seasonList.length - 1] : null
  const requested = Number(params.get('season')) - SEASON_OFFSET
  const season = seasonList.includes(requested) ? requested : latest
  const setSeason = s => setParams(prev => {
    const p = new URLSearchParams(prev)
    s === latest ? p.delete('season') : p.set('season', String(seasonNumber(s)))
    return p
  }, { replace: true })

  const seasonKey = name => (season == null ? null : `${name}-${season}`)
  const standings = useLoad(seasonKey('standings'), () => getStandings(season))
  const efficiency = useLoad(seasonKey('efficiency'), () => getEfficiency(season, 'regular'))
  const qbParams = { scope: 'season', season, stage: 'regular', includeUnqualified: true }
  const qbs = useLoad(seasonKey('qb'), () => getQbLeaderboard(qbParams))
  const upcoming = useLoad(seasonKey('upcoming'), () => getEloUpcoming(season))
  const trends = useLoad('trends', getSeasonTrends)
  const history = useLoad('history', () => getEloHistory())

  const team = standings.data?.find(r => r.abbrName?.toUpperCase() === abbr.toUpperCase()) ?? null
  const teamId = team?.teamId ?? null
  const eloGames = useLoad(teamId == null ? null : `games-${teamId}`, () => getEloGames(undefined, undefined, teamId))

  useEffect(() => { window.scrollTo(0, 0) }, [abbr])

  const rivalrySort = useSorter({ key: 'games', asc: false })
  const allGames = useMemo(() => (eloGames.data && teamId != null ? teamGames(eloGames.data, teamId) : []), [eloGames.data, teamId])
  const franchise = useMemo(() => (teamId == null ? [] : franchiseSeasons(trends.data ?? [], history.data ?? [], allGames, teamId)), [trends.data, history.data, allGames, teamId])
  const points = useMemo(() => (history.data ?? []).filter(h => h.teamId === teamId).sort((a, b) => a.season - b.season || a.week - b.week), [history.data, teamId])
  const rivals = useMemo(() => headToHead(allGames), [allGames])

  if (seasons.error || standings.error) return <p className="text-bad">Could not load this team. Try again in a moment.</p>
  if (seasons.data && !seasonList.length) return <p className="text-muted">No seasons have been synced yet.</p>
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
  const playedRows = all.filter(r => r.gamesPlayed)
  const prevLabel = `S${seasonNumber(season - 1)}`

  const sos = sosVariant(season, latest)
  const sosSource = sos === 'Prev' ? 'previous-season opponent quality' : 'current-season opponent quality'
  const playedField = `oppPyPat${sos}`
  const leftField = `oppPyPatRemaining${sos}`
  const sosText = field => (team[field] == null ? '—' : pct(team[field]))
  const divRank = rankIn(team.winPct, all.filter(r => r.division === team.division).map(r => r.winPct))

  const kpis = [
    { label: 'Record', value: recordText(team), note: played ? `${ordinal(divRank.rank)} in ${team.division}` : 'No games yet', tip: 'Regular-season record. Division place is by win percentage; ties share a place.' },
    {
      label: 'PyPAT', value: played ? pct(team.pythagoreanPat) : '—', tip: 'PythagoreanPAT win expectancy from points scored and allowed. 50% is break-even.',
      rank: played ? rankIn(team.pythagoreanPat, playedRows.map(r => r.pythagoreanPat)) : null,
      delta: played && prevStanding?.gamesPlayed ? (d => delta(d, 0.01, `${Math.abs(d * 100).toFixed(1)} vs ${prevLabel}`, `Change from ${seasonLabel(season - 1)} PyPAT, in percentage points`))(team.pythagoreanPat - prevStanding.pythagoreanPat) : null,
    },
    {
      label: 'Luck', value: played ? signed1(team.winDiff) : '—', tip: 'Actual wins minus PyPAT-expected wins. Positive means more wins than scoring margin justifies.',
      rank: played ? rankIn(team.winDiff, playedRows.map(r => r.winDiff)) : null, rankWord: ' luckiest', neutral: true,
      note: played ? LUCK_WORD[luckLean(team.winDiff)] : null,
    },
    {
      label: 'Elo', value: myElo ? myElo.endElo.toFixed(0) : '—', tip: 'Long-term strength rating, carried across seasons. 1500 is average.',
      rank: myElo ? { rank: myElo.rank, of: eloNow.length } : null,
      delta: myElo && prevElo ? (d => delta(d, 15, `${Math.abs(d).toFixed(0)} vs ${prevLabel}`, `Change from the end of ${seasonLabel(season - 1)}`))(myElo.endElo - prevElo.endElo) : null,
    },
    {
      label: 'Net Pts/Drive', value: signed(eff?.netPointsPerDrive ?? null), tip: 'Offense points per drive minus defense points per drive, regular season.',
      rank: rankIn(eff?.netPointsPerDrive, effRows.map(r => r.netPointsPerDrive)),
    },
    {
      label: 'SoS Played', value: sosText(playedField), tip: `${SOS_TIP} Uses ${sosSource}.`, neutral: true,
      rank: rankIn(team[playedField], all.map(r => r[playedField])), rankWord: ' hardest',
    },
  ]

  const groups = fingerprint(team, all, effRows)
  const seasonGames = seasonArc(allGames.filter(g => g.season === season))
  const regularArc = seasonArc(seasonGames.filter(g => !g.playoff))
  const lanes = [
    { key: 'actual', label: 'Actual wins', tip: 'Wins, with a tie counted as half.', value: actualWins(team), color: 'rgb(var(--ink))' },
    { key: 'pypat', label: 'PyPAT wins', tip: 'PyPAT win expectancy times games played: the wins scoring margin justifies.', value: pypatWins(team), color: 'rgb(var(--muted))' },
    ...(eloGames.data ? [{ key: 'elo', label: 'Elo wins', tip: 'The pregame Elo win chance added up over every game played. It accounts for opponent strength and home field.', value: eloExpectedWins(regularArc), color: 'rgb(var(--accent))' }] : []),
  ]

  const road = teamUpcoming(upcoming.data ?? [], teamId)
  const remaining = road.reduce((s, r) => s + r.winProb, 0)
  const projectedWins = actualWins(team) + remaining
  const leftRank = rankIn(team[leftField], all.map(r => r[leftField]))
  const showRoad = upcoming.loading || road.length > 0

  const myQbs = (qbs.data ?? []).filter(q => q.teamAbbr === team.abbrName).sort((a, b) => b.passAtt - a.passAtt)

  const regAll = tally(allGames.filter(g => !g.playoff))
  const postAll = tally(allGames.filter(g => g.playoff))
  const allTimeText = allGames.length
    ? `All-time ${tallyText(regAll)} in the regular season${postAll.w + postAll.l + postAll.t ? ` and ${tallyText(postAll)} in the playoffs` : ', no playoff games yet'}.`
    : null

  const h2h = rivalrySort.apply(rivals, {
    opp: r => r.opp.displayName,
    games: r => r.games,
    record: r => r.winPct,
    diff: r => r.diff,
    ppg: r => (r.pf - r.pa) / r.games,
    last: r => r.last.season * 100 + r.last.week,
  })

  const failed = [
    efficiency.error && 'efficiency', qbs.error && 'quarterbacks', upcoming.error && 'remaining schedule',
    eloGames.error && 'game log', trends.error && 'season history', history.error && 'Elo history',
  ].filter(Boolean)

  const qbRoom = <QbRoom rows={myQbs} league={qbs.data ?? []} spec={qbSpec(team, season, myQbs, qbParams)} loading={qbs.loading} />
  const nav = [
    ['fingerprint', 'Fingerprint'], ['landscape', 'Landscape'], ['truth', 'Wins vs expectation'],
    ...(showRoad ? [['road', 'Road ahead']] : []), ['arc', 'Season arc'], ['qbs', 'QBs'], ['franchise', 'History'], ['rivalries', 'Rivalries'],
  ]

  return (
    <div className="team-scope" style={teamColorVars(team.primaryColor)}>
      <Masthead team={team} season={season} seasons={seasonList} onSeason={setSeason} kpis={kpis} />
      <SectionNav links={nav} />
      {failed.length > 0 && <p className="text-sm text-bad mb-6">Some sections could not load: {failed.join(', ')}.</p>}
      <div className="space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-10 items-start">
          <Fingerprint groups={groups} spec={fingerprintSpec(team, season, groups)} loading={efficiency.loading} />
          <LeagueLandscape rows={effRows} teamId={teamId} loading={efficiency.loading} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <ScoreboardTruth lanes={lanes} games={team.gamesPlayed} arc={regularArc} spec={truthSpec(team, season, lanes)} />
          {showRoad
            ? <RoadAhead rows={road} loading={upcoming.loading} teamHref={teamHref} spec={roadSpec(team, season, road, projectedWins)}
                projection={{ wins: projectedWins, remaining, record: recordText(projectedRecord(team, road)) }}
                sosLeft={{ text: sosText(leftField), tip: `${SOS_TIP} Remaining games only. Uses ${sosSource}.`, rank: leftRank ? `${ordinal(leftRank.rank)} hardest of ${leftRank.of}` : null }} />
            : qbRoom}
        </div>
        <SeasonArc games={seasonGames} spec={arcSpec(team, season, seasonGames)} teamHref={teamHref} loading={eloGames.loading} />
        {showRoad && qbRoom}
        <FranchiseHistory points={points} seasons={franchise} allTime={allTimeText} spec={franchiseSpec(team, franchise)} loading={trends.loading || history.loading || eloGames.loading} />
        <Rivalries rows={h2h} sorter={rivalrySort} specFor={shown => rivalrySpec(team, shown, rivalrySort.sort, h2h.length)} loading={eloGames.loading} />
      </div>
    </div>
  )
}
