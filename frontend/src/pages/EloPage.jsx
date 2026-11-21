import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { getEloHistory, getEloRatings, getEloGames, getEloMatchup, getEloUpcoming } from '../api/client'
import PageHeader from '../components/PageHeader'
import Tabs from '../components/Tabs'
import { TeamCell, TeamLogo } from '../components/TeamLogo'
import DivergingBar from '../components/DivergingBar'
import InfoTip from '../components/InfoTip'
import { SortTh, useSorter } from '../components/SortTh'
import LeanBar from '../components/LeanBar'
import ExportMenu from '../components/ExportMenu'
import { divergeColor } from '../utils/heat'
import { lean, pct0, upsetInfo, outlookText, upsetText, LEAN_HOME, LEAN_AWAY } from '../utils/eloLean'
import { weekName as label } from '../utils/playoffRounds'
import { COLORS } from '../utils/chartColors'
import { seasonLabel, seasonNumber } from '../utils/seasons'

const BASE = 1500
const ELO_NOTES = ['Every team starts at 1500, the league average, and is pulled part of the way back toward it between seasons and when it changes owners mid-season. Includes playoffs. Change is since the previous week.']
const sliceLabel = params => `${params.season == null ? 'All seasons' : seasonLabel(params.season)} · ${params.week == null ? 'All weeks' : label(params.week)}`
const sortLabel = (sort, labels, fallback) => sort.key ? `sorted by ${labels[sort.key]} ${sort.asc ? 'ascending' : 'descending'}` : fallback

const TABS = [
  { value: 'ratings', label: 'Ratings' },
  { value: 'history', label: 'History' },
  { value: 'matchup', label: 'Matchup' },
  { value: 'games', label: 'Games' },
]
const TAB_VALUES = TABS.map(t => t.value)
const signed = (v, d = 1) => (v > 0 ? '+' : '') + v.toFixed(d)
const pct = v => (v * 100).toFixed(1) + '%'

const TIPS = {
  rank: 'Position when every team is sorted by Elo, highest first.',
  team: 'Team name. Sorts alphabetically.',
  elo: 'Higher is stronger. 1500 is the league average.',
  vs1500: 'Rating points above or below the league average of 1500.',
  change: 'Elo points gained or lost since the previous week. Zero usually means the team was on a bye.',
  rankMove: 'How many places the team moved in the Elo ranking since the previous week. Green up arrow is a climb, red down arrow is a drop.',
  games: 'Number of games counted toward this rating so far, regular season and playoffs, across all seasons.',
  risers: 'The five teams whose rating rose the most since the previous week.',
  fallers: 'The five teams whose rating fell the most since the previous week.',
  away: 'Away team, its Elo going into the game, and the Elo points it gained (green) or lost (red) from the result. Sorts by Elo.',
  home: 'Home team, its Elo going into the game, and the Elo points it gained (green) or lost (red) from the result. Sorts by Elo.',
  score: 'Final score, away team first.',
  homeProb: 'The home team\'s win probability before the game, from both Elo ratings and home field. Under 55% either way is a Toss-up.',
  mov: 'Scales this game\'s Elo change for both the winner and the loser. Close games shrink it and blowouts grow it, up to the configured margin cap. A favorite\'s blowout counts for less than an underdog\'s. A tie is 1.00.',
  result: upsetText(),
  projWeek: 'The week or playoff round of the unplayed game.',
  projElo: 'Each team\'s current Elo rating, which is used for the projection. Sorts by Elo.',
  projLean: 'The bar grows toward the favorite; longer means a bigger edge. A full half-bar indicates a sure thing (100% win probability).',
  projFav: 'The team Elo favors and its projected win probability. Sorts the closest games first.',
  projOutlook: outlookText(),
}

function RankMove({ change }) {
  if (!change) return <span className="text-muted">–</span>
  return change > 0
    ? <span className="text-good font-semibold">▲ {change}</span>
    : <span className="text-bad font-semibold">▼ {-change}</span>
}

function Movers({ ratings, params }) {
  const sorted = [...ratings].sort((a, b) => b.change - a.change)
  const risers = sorted.slice(0, 5)
  const fallers = sorted.slice(-5).reverse()
  const spec = {
    name: 'Elo Movers', qualifier: `${sliceLabel(params)} · risers by Change descending, fallers by Change ascending`,
    description: 'The biggest weekly Elo risers followed by the biggest fallers.', notes: ELO_NOTES,
    rows: [...risers.map(r => ({ ...r, direction: 'Riser' })), ...fallers.map(r => ({ ...r, direction: 'Faller' }))],
    cols: [
      { label: 'Direction', desc: `${TIPS.risers} ${TIPS.fallers}`, text: r => r.direction },
      { label: 'Team', desc: TIPS.team, text: r => r.displayName, logo: r => r.abbrName },
      { label: 'Change', desc: TIPS.change, text: r => signed(r.change), value: r => r.change, z: '+0.0;-0.0;0.0' },
    ],
    api: { path: '/elo/ratings', params, note: 'Sort by change; take the first five descending for risers, then the first five ascending for fallers.' },
  }
  const list = (rows, title, tip) => (
    <div>
      <h3 className="th mb-1"><InfoTip text={tip}>{title}</InfoTip></h3>
      <ul className="border-t border-rule">
        {rows.map(r => (
          <li key={r.teamId} className="flex items-center justify-between border-b border-line py-1.5 text-sm num">
            <TeamCell abbr={r.abbrName} name={r.displayName} size={20} />
            <span className="font-semibold">{signed(r.change)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8 max-w-3xl">
      <div className="sm:col-span-2 flex justify-end"><ExportMenu spec={spec} /></div>
      {list(risers, `Biggest risers · ${label(params.week)}`, TIPS.risers)}
      {list(fallers, `Biggest fallers · ${label(params.week)}`, TIPS.fallers)}
    </div>
  )
}

function RatingsTab({ ratings, loading, params }) {
  const sort = useSorter({ key: null, asc: false })
  if (loading) return <p className="text-muted">Loading…</p>
  if (!ratings.length) return <p className="text-muted">No ratings available.</p>
  const maxDev = Math.max(...ratings.map(r => Math.abs(r.elo - BASE)))
  const maxChange = Math.max(...ratings.map(r => Math.abs(r.change)))
  const sorted = sort.apply(ratings, {
    rank: r => r.rank,
    team: r => r.displayName,
    elo: r => r.elo,
    vs1500: r => r.elo - BASE,
    change: r => r.change,
    rankMove: r => r.rankChange,
    games: r => r.gamesCounted,
  })
  const spec = {
    name: 'Elo Ratings', qualifier: `${sliceLabel(params)} · ${sortLabel(sort.sort, { rank: '#', team: 'Team', elo: 'Elo', vs1500: 'vs avg', change: 'Change', rankMove: 'Rank change', games: 'Games' }, 'sorted by # ascending (API order)')}`,
    description: 'Team Elo ratings, weekly changes and rank movement. Elo is rolling strength that carries across seasons.', notes: ELO_NOTES,
    rows: sorted,
    cols: [
      { label: '#', desc: TIPS.rank, text: r => String(r.rank), value: r => r.rank, z: '0' },
      { label: 'Team', desc: TIPS.team, text: r => r.displayName, logo: r => r.abbrName },
      { label: 'Elo', desc: TIPS.elo, text: r => r.elo.toFixed(0), value: r => r.elo, z: '0' },
      { label: 'vs avg', desc: TIPS.vs1500, text: r => signed(r.elo - BASE, 0), barWidth: 120, bar: r => ({ value: r.elo - BASE, max: maxDev, color: r.elo >= BASE ? 'rgb(37 99 235 / 0.55)' : 'rgb(234 88 12 / 0.55)', text: false }), value: r => r.elo - BASE, z: '+0;-0;0' },
      { label: 'Change', desc: TIPS.change, text: r => signed(r.change), value: r => r.change, z: '+0.0;-0.0;0.0', color: r => divergeColor(r.change, maxChange || 1) },
      { label: 'Rank change', desc: TIPS.rankMove, text: r => r.rankChange == null ? '–' : signed(r.rankChange, 0), value: r => r.rankChange, z: '+0;-0;0' },
      { label: 'Games', desc: TIPS.games, text: r => String(r.gamesCounted), value: r => r.gamesCounted, z: '0' },
    ],
    api: { path: '/elo/ratings', params, fields: { 'vs avg': 'elo - 1500', 'Rank change': 'rankChange' }, note: 'Rows use the selected client-side sort; default is API ranking order.' },
  }
  return (
    <div>
      <div className="flex justify-end mb-2"><ExportMenu spec={spec} /></div>
      <div className="overflow-x-auto border-y border-rule">
        <table className="w-full text-sm num">
          <thead>
            <tr className="border-b border-rule">
              <SortTh tip={TIPS.rank} sortKey="rank" state={sort.sort} onSort={sort.click} className="w-10">#</SortTh>
              <SortTh tip={TIPS.team} sortKey="team" state={sort.sort} onSort={sort.click}>Team</SortTh>
              <SortTh tip={TIPS.elo} sortKey="elo" state={sort.sort} onSort={sort.click} className="text-right">Elo</SortTh>
              <SortTh tip={TIPS.vs1500} sortKey="vs1500" state={sort.sort} onSort={sort.click} className="min-w-[160px]">vs avg</SortTh>
              <SortTh tip={TIPS.change} sortKey="change" state={sort.sort} onSort={sort.click} className="text-right">Change</SortTh>
              <SortTh tip={TIPS.rankMove} sortKey="rankMove" state={sort.sort} onSort={sort.click} className="text-right">Rank change</SortTh>
              <SortTh tip={TIPS.games} sortKey="games" state={sort.sort} onSort={sort.click} className="text-right">Games</SortTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.teamId} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
                <td className="px-2 py-1.5">{r.rank}</td>
                <td className="px-2 py-1.5 font-semibold whitespace-nowrap"><TeamCell abbr={r.abbrName} name={r.displayName} /></td>
                <td className="px-2 py-1.5 text-right font-semibold">{r.elo.toFixed(0)}</td>
                <td className="px-2 py-1.5"><DivergingBar value={r.elo - BASE} max={maxDev} /></td>
                <td className="px-2 py-1.5 text-right" style={{ backgroundColor: divergeColor(r.change, maxChange || 1) }}>{signed(r.change)}</td>
                <td className="px-2 py-1.5 text-right"><RankMove change={r.rankChange} /></td>
                <td className="px-2 py-1.5 text-right text-muted">{r.gamesCounted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted mt-2">
        {ELO_NOTES[0]}
      </p>
      <Movers ratings={ratings} params={params} />
    </div>
  )
}

function HistoryTab({ history, teams, params }) {
  const [focus, setFocus] = useState(new Set())
  const [hover, setHover] = useState(null)

  const { data, boundaries, ticks } = useMemo(() => {
    const keys = []
    const byKey = new Map()
    for (const r of history) {
      const key = `${r.season}-${r.week}`
      if (!byKey.has(key)) { byKey.set(key, { key, season: r.season, week: r.week }); keys.push(key) }
      byKey.get(key)[r.teamId] = r.endElo
    }
    const rows = keys.map(k => byKey.get(k))
    const starts = rows.filter(r => r.week === Math.min(...rows.filter(x => x.season === r.season).map(x => x.week)))
    return { data: rows, boundaries: starts.map(r => r.key), ticks: starts.map(r => r.key) }
  }, [history])

  if (!data.length) return <p className="text-muted">No history available.</p>

  const elos = history.map(r => r.endElo)
  const yDomain = [Math.floor(Math.min(...elos) / 100) * 100, Math.ceil(Math.max(...elos) / 100) * 100]
  const emphasised = id => focus.has(id) || hover === id
  const anyEmphasis = focus.size > 0 || hover != null
  const toggle = id => setFocus(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const seasonOf = key => seasonLabel(Number(key.split('-')[0]))
  const spec = {
    name: 'Elo History', qualifier: `${sliceLabel(params)} · teams by abbreviation ascending · week points in chart order`,
    description: 'One row per chart team, with end-of-week Elo at every season and week point. Highlighting teams only changes chart emphasis.',
    notes: [...ELO_NOTES, 'Dotted lines mark season starts, when ratings are pulled toward the league average of 1500.'],
    rows: teams,
    cols: [
      { label: 'Team', desc: TIPS.team, text: r => r.displayName },
      ...data.map(point => ({
        label: `S${seasonNumber(point.season)} ${point.week < 18 ? `W${point.week + 1}` : label(point.week)}`,
        desc: 'End-of-week Elo. Ratings are pulled toward the league average of 1500 at each season start.',
        text: r => point[r.teamId]?.toFixed(0) ?? '–', value: r => point[r.teamId], z: '0',
      })),
    ],
    api: { path: '/elo/history', params, fields: { Team: 'teamId joined to /elo/ratings for displayName', 'Week points': 'Pivot by teamId and season/week; each value is endElo.' }, note: 'All chart teams are included; highlighting does not filter rows.' },
  }

  return (
    <div>
      {teams.length > 0 && <div className="flex justify-end mb-2"><ExportMenu spec={spec} /></div>}
      <div className="flex items-center gap-3 mb-2 text-xs text-muted">
        <span title="Each line is one team's Elo after every week. Click a team below to highlight it. Dotted vertical lines mark the start of a season, where ratings are pulled part of the way back toward 1500.">Click teams to highlight them. The rest fade back. Dotted lines mark season starts, when ratings are pulled toward the league average of 1500.</span>
        <button onClick={() => setFocus(new Set())} className="text-ink font-medium hover:text-accent">Clear</button>
      </div>
      <div className="flex flex-wrap gap-1 mb-4">
        {teams.map((t, i) => (
          <button
            key={t.teamId}
            onClick={() => toggle(t.teamId)}
            onMouseEnter={() => setHover(t.teamId)}
            onMouseLeave={() => setHover(null)}
            aria-pressed={focus.has(t.teamId)}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border transition-colors ${
              focus.has(t.teamId) ? 'border-rule bg-surface font-semibold' : 'border-line text-muted hover:text-ink'
            }`}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            {t.abbrName}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={460}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--line))" />
          <XAxis dataKey="key" ticks={ticks} tickFormatter={seasonOf} tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} stroke="rgb(var(--line))" />
          <YAxis domain={yDomain} tickCount={(yDomain[1] - yDomain[0]) / 100 + 1} allowDecimals={false} tickFormatter={v => v.toFixed(0)} tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} stroke="rgb(var(--line))" />
          <ReferenceLine y={BASE} stroke="rgb(var(--rule))" />
          {boundaries.map(k => <ReferenceLine key={k} x={k} stroke="rgb(var(--muted))" strokeDasharray="3 3" />)}
          <Tooltip
            contentStyle={{ background: 'rgb(var(--bg))', border: '1px solid rgb(var(--rule))', borderRadius: 3 }}
            labelFormatter={k => { const [s, w] = k.split('-').map(Number); return `${seasonLabel(s)} · ${label(w)}` }}
            itemSorter={item => -item.value}
            formatter={(v, id) => [v.toFixed(1), teams.find(t => String(t.teamId) === String(id))?.abbrName ?? id]}
          />
          {teams.map((t, i) => (
            <Line
              key={t.teamId}
              type="monotone"
              dataKey={String(t.teamId)}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
              strokeWidth={emphasised(t.teamId) ? 3 : 1.5}
              strokeOpacity={anyEmphasis && !emphasised(t.teamId) ? 0.12 : 1}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export const homeTeamForSide = (side, a, b) => side === 'a' ? a : side === 'b' ? b : undefined

export function MatchupTab({ ratedTeams }) {
  const teams = useMemo(() => [...ratedTeams].sort((x, y) => x.displayName.localeCompare(y.displayName)), [ratedTeams])
  const [a, setA] = useState(null)
  const [b, setB] = useState(null)
  const [home, setHome] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (teams.length > 1) { setA(teams[0].teamId); setB(teams[1].teamId) }
  }, [teams])

  useEffect(() => {
    if (a == null || b == null || a === b) { setResult(null); return }
    let current = true
    getEloMatchup(a, b, homeTeamForSide(home, a, b)).then(r => { if (current) setResult(r) }).catch(() => { if (current) setResult(null) })
    return () => { current = false }
  }, [a, b, home])

  const select = (value, onChange, aria) => (
    <select className="field" aria-label={aria} value={value ?? ''} onChange={e => onChange(Number(e.target.value))}>
      {teams.map(t => <option key={t.teamId} value={t.teamId}>{t.displayName}</option>)}
    </select>
  )

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {select(a, setA, 'Team A')}
        <span className="text-muted text-sm">vs</span>
        {select(b, setB, 'Team B')}
        <label className="flex items-center gap-2 text-sm text-muted" title="Choose which team has home field, or Neutral for no home-field effect.">
          Home team
          <select className="field" aria-label="Home team" value={home} onChange={e => setHome(e.target.value)}>
            <option value="">Neutral</option>
            <option value="a">{teams.find(t => t.teamId === a)?.displayName ?? 'Team A'}</option>
            <option value="b">{teams.find(t => t.teamId === b)?.displayName ?? 'Team B'}</option>
          </select>
        </label>
      </div>
      {a === b && <p className="text-muted text-sm">Pick two different teams.</p>}
      {result && a !== b && (
        <div>
          <div className="flex justify-between items-end mb-2">
            <div>
              <TeamCell abbr={result.teamA.abbrName} name={result.teamA.displayName} size={32} />
              <p className="text-xs text-muted num mt-1">Elo {result.eloA.toFixed(0)}</p>
            </div>
            <div className="text-right">
              <div className="flex justify-end"><TeamCell abbr={result.teamB.abbrName} name={result.teamB.displayName} size={32} /></div>
              <p className="text-xs text-muted num mt-1">Elo {result.eloB.toFixed(0)}</p>
            </div>
          </div>
          <div className="flex h-8 w-full text-sm font-bold num" role="img" aria-label="Win probability" title="Each team's win probability if they played today, from current Elo ratings. The two add up to 100%.">
            <div className="flex items-center pl-2" style={{ width: pct(result.teamAWinProbability), background: 'rgb(37 99 235 / 0.55)' }}>{pct(result.teamAWinProbability)}</div>
            <div className="flex items-center justify-end pr-2 flex-1" style={{ background: 'rgb(234 88 12 / 0.55)' }}>{pct(result.teamBWinProbability)}</div>
          </div>
          <p className="text-xs text-muted mt-2">Each team's win probability if they played today, from current Elo ratings. The two add up to 100%.</p>
        </div>
      )}
    </div>
  )
}

function GamesTab({ season, week, upcoming }) {
  const [{ rows: games, params: gamesParams }, setGames] = useState({ rows: [], params: {} })
  const [loading, setLoading] = useState(false)
  const played = useSorter({ key: null, asc: false })
  const [scope, setScope] = useState('week')
  const proj = useSorter({ key: 'tier', asc: true })

  useEffect(() => {
    if (season == null || week == null) return
    let current = true
    const params = { season, week }
    setLoading(true)
    getEloGames(season, week).then(g => { if (current) { setGames({ rows: g, params }); setLoading(false) } }).catch(() => { if (current) { setGames({ rows: [], params }); setLoading(false) } })
    return () => { current = false }
  }, [season, week])

  const projected = useMemo(() => upcoming.filter(u => u.season === season && (scope === 'season' || u.week === week)), [upcoming, season, week, scope])

  if (loading) return <p className="text-muted">Loading…</p>
  if (!games.length && !upcoming.some(u => u.season === season)) return <p className="text-muted">No games for this week.</p>

  const sortedGames = played.apply(games, {
    away: g => g.awayPregameElo,
    home: g => g.homePregameElo,
    margin: g => g.margin,
    homeProb: g => g.homeWinProbability,
    mov: g => g.movMultiplier,
    upset: g => { const u = upsetInfo(g); return u ? u.favChance : 0 },
  })
  const projRows = projected.map(game => ({ game, l: lean(game) }))
  const tossUps = projRows.filter(r => r.l.tossUp).length
  const sortedProjected = proj.apply(projRows, {
    week: r => r.game.week,
    away: r => r.game.awayElo,
    home: r => r.game.homeElo,
    lean: r => r.game.homeWinProbability,
    prob: r => r.l.prob,
    tier: r => r.l.prob,
  })

  const playedSpec = {
    name: 'Elo Played Games', qualifier: `${sliceLabel(gamesParams)} · ${sortLabel(played.sort, { away: 'Away', home: 'Home', margin: 'Score (margin)', homeProb: 'Home Win Prob', mov: 'Margin mult.', upset: 'Result' }, 'API game order')}`,
    description: 'Completed games with pregame Elo, rating changes and upset results.', notes: ELO_NOTES,
    rows: sortedGames,
    cols: [
      { label: 'Away', desc: TIPS.away, text: g => g.awayTeam.abbrName, logo: g => g.awayTeam.abbrName, image: { text: g => `${g.awayTeam.abbrName} ${g.awayPregameElo.toFixed(0)} ${signed(g.awayPostgameElo - g.awayPregameElo)}` } },
      { label: 'Away Elo', imageHidden: true, desc: 'Away team Elo before the game.', text: g => g.awayPregameElo.toFixed(0), value: g => g.awayPregameElo, z: '0' },
      { label: 'Away Elo Change', imageHidden: true, desc: 'Away team postgame Elo minus pregame Elo.', text: g => signed(g.awayPostgameElo - g.awayPregameElo), value: g => g.awayPostgameElo - g.awayPregameElo, z: '+0.0;-0.0;0.0' },
      { label: 'Home', desc: TIPS.home, text: g => g.homeTeam.abbrName, logo: g => g.homeTeam.abbrName, image: { text: g => `${g.homeTeam.abbrName} ${g.homePregameElo.toFixed(0)} ${signed(g.homePostgameElo - g.homePregameElo)}` } },
      { label: 'Home Elo', imageHidden: true, desc: 'Home team Elo before the game.', text: g => g.homePregameElo.toFixed(0), value: g => g.homePregameElo, z: '0' },
      { label: 'Home Elo Change', imageHidden: true, desc: 'Home team postgame Elo minus pregame Elo.', text: g => signed(g.homePostgameElo - g.homePregameElo), value: g => g.homePostgameElo - g.homePregameElo, z: '+0.0;-0.0;0.0' },
      { label: 'Away Score', desc: TIPS.score, text: g => String(g.awayScore), value: g => g.awayScore, z: '0' },
      { label: 'Home Score', desc: TIPS.score, text: g => String(g.homeScore), value: g => g.homeScore, z: '0' },
      { label: 'Home Win Prob', desc: TIPS.homeProb, text: g => pct(g.homeWinProbability), value: g => g.homeWinProbability, z: '0.0%' },
      { label: 'Margin mult.', desc: TIPS.mov, text: g => g.movMultiplier.toFixed(2), value: g => g.movMultiplier, z: '0.00' },
      { label: 'Result', desc: TIPS.result, text: g => { const u = upsetInfo(g); return u ? `${u.label} · ${pct0(u.chance)}` : '' }, color: g => upsetInfo(g)?.shade },
    ],
    api: { path: '/elo/games', params: gamesParams, fields: { 'Away Elo Change': 'awayPostgameElo - awayPregameElo', 'Home Elo Change': 'homePostgameElo - homePregameElo', Result: 'Compare scores to find winner; use winner pregame probability and beaten favorite probability to determine upset tier.' }, note: 'Rows use the selected client-side sort; Score sorts by margin.' },
  }
  const projectedSpec = {
    name: 'Elo Projected', qualifier: `${seasonLabel(season)} · ${scope === 'season' ? 'Rest of season' : label(week)} · ${sortLabel(proj.sort, { week: 'Week', away: 'Away', home: 'Home', lean: 'Edge (home win probability)', prob: 'Favored Win Prob', tier: 'Outlook (favored win probability)' })}`,
    description: 'Unplayed games in the selected week or remaining season, projected from current Elo.',
    notes: [...ELO_NOTES, 'Win probabilities use today\'s ratings and don\'t account for how ratings change before each game.'],
    rows: sortedProjected,
    cols: [
      ...(scope === 'season' ? [{ label: 'Week', desc: TIPS.projWeek, text: r => label(r.game.week) }] : []),
      { label: 'Away', desc: TIPS.projElo, text: r => r.game.awayTeam.abbrName, logo: r => r.game.awayTeam.abbrName, image: { text: r => `${r.game.awayTeam.abbrName} ${r.game.awayElo.toFixed(0)}` } },
      { label: 'Away Elo', imageHidden: true, desc: TIPS.projElo, text: r => r.game.awayElo.toFixed(0), value: r => r.game.awayElo, z: '0' },
      { label: 'Home', desc: TIPS.projElo, text: r => r.game.homeTeam.abbrName, logo: r => r.game.homeTeam.abbrName, image: { text: r => `${r.game.homeTeam.abbrName} ${r.game.homeElo.toFixed(0)}` } },
      { label: 'Home Elo', imageHidden: true, desc: TIPS.projElo, text: r => r.game.homeElo.toFixed(0), value: r => r.game.homeElo, z: '0' },
      { label: 'Edge', desc: TIPS.projLean, text: r => r.l.edge.toFixed(2), align: 'center', image: { label: 'Away ◀ Edge ▶ Home' }, bar: r => ({ value: r.l.homeFav ? r.l.edge : -r.l.edge, max: 1, color: `rgb(${r.l.homeFav ? LEAN_HOME : LEAN_AWAY} / ${(0.25 + r.l.edge * 0.45).toFixed(2)})`, text: false }), value: r => r.l.edge, z: '0.00' },
      { label: 'Favored', desc: TIPS.projFav, text: r => r.l.leansTo.abbrName, image: { text: r => `${r.l.leansTo.abbrName} ${pct0(r.l.prob)}`, align: 'right' } },
      { label: 'Favored Win Prob', imageHidden: true, desc: TIPS.projFav, text: r => pct0(r.l.prob), value: r => r.l.prob, z: '0%' },
      { label: 'Outlook', desc: TIPS.projOutlook, text: r => r.l.tier.label, color: r => r.l.shade },
    ],
    api: { path: '/elo/upcoming', params: {}, fields: { Edge: 'min((max(homeWinProbability, awayWinProbability) - 0.5) * 2, 1)', Favored: 'abbrName of the team with the larger win probability; home wins ties.', 'Favored Win Prob': 'max(homeWinProbability, awayWinProbability)', Outlook: 'Favorite probability tier: <55% Toss-up, <60% Tilt, <70% Lean, <80% Likely, otherwise Solid.' }, note: `With no season the endpoint returns the latest season's unplayed games. This view shows ${scope === 'week' ? `week ${week + 1} only (add week=${week} to reproduce it)` : 'the rest of the season'}. Sort is client-side.` },
  }

  const side = (team, elo, delta, fav = null) => (
    <td className="px-2 py-1.5 whitespace-nowrap">
      <div className={`flex items-center gap-2 ${fav === false ? 'opacity-60' : ''}`}>
        <TeamLogo abbr={team.abbrName} size={20} />
        <span className={fav === false ? 'text-muted' : 'font-semibold'}>{team.abbrName}</span>
        <span className="text-muted">{elo.toFixed(0)}</span>
        {delta != null && <span className={delta >= 0 ? 'text-good' : 'text-bad'}>{signed(delta)}</span>}
      </div>
    </td>
  )

  return (
    <div className="space-y-8">
      {games.length > 0 && (
        <div>
          <div className="flex justify-end mb-2"><ExportMenu spec={playedSpec} /></div>
          <div className="overflow-x-auto border-y border-rule">
            <table className="w-full text-sm num">
              <thead>
                <tr className="border-b border-rule">
                  <SortTh tip={TIPS.away} sortKey="away" state={played.sort} onSort={played.click}>Away</SortTh>
                  <SortTh tip={TIPS.home} sortKey="home" state={played.sort} onSort={played.click}>Home</SortTh>
                  <SortTh tip={TIPS.score} sortKey="margin" state={played.sort} onSort={played.click} className="text-right">Score</SortTh>
                  <SortTh tip={TIPS.homeProb} sortKey="homeProb" state={played.sort} onSort={played.click} className="text-right">Home win prob.</SortTh>
                  <SortTh tip={TIPS.mov} sortKey="mov" state={played.sort} onSort={played.click} className="text-right">Margin mult.</SortTh>
                  <SortTh tip={TIPS.result} sortKey="upset" state={played.sort} onSort={played.click}>Result</SortTh>
                </tr>
              </thead>
              <tbody>
                {sortedGames.map((g, i) => (
                  <tr key={g.gameId} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
                    {side(g.awayTeam, g.awayPregameElo, g.awayPostgameElo - g.awayPregameElo)}
                    {side(g.homeTeam, g.homePregameElo, g.homePostgameElo - g.homePregameElo)}
                    <td className="px-2 py-1.5 text-right">{g.awayScore}–{g.homeScore}</td>
                    <td className="px-2 py-1.5 text-right">{pct(g.homeWinProbability)}</td>
                    <td className="px-2 py-1.5 text-right">{g.movMultiplier.toFixed(2)}</td>
                    {(() => {
                      const upset = upsetInfo(g)
                      return upset
                        ? <td className="px-2 py-1.5 whitespace-nowrap font-semibold" style={{ backgroundColor: upset.shade }}
                            title={`${upset.winner.displayName} had a ${pct(upset.chance)} win probability before the game`}>
                            {upset.label} · {Math.round(upset.chance * 100)}%
                          </td>
                        : <td className="px-2 py-1.5" />
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted px-2 py-2">{TIPS.result}</p>
          </div>
        </div>
      )}
      {upcoming.some(u => u.season === season) && (
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display font-bold uppercase text-xl leading-none">Projected</h2>
            <div className="flex border border-line rounded overflow-hidden">
              {[['week', 'This week'], ['season', 'Rest of season']].map(([value, text]) => (
                <button key={value} onClick={() => setScope(value)} aria-pressed={scope === value}
                  className={`px-2 py-1 text-xs font-medium ${scope === value ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}>
                  {text}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted mt-1 mb-2">
            Who Elo favors in each unplayed game, and by how much.{' '}
            {tossUps > 0
              ? <span className="text-ink font-medium">{tossUps} toss-up{tossUps > 1 ? 's' : ''} {scope === 'week' ? 'this week' : 'remaining this season'}. Projections default to closest first.</span>
              : <span>No toss-ups {scope === 'week' ? 'this week' : 'remaining this season'}.</span>}
          </p>
          {sortedProjected.length > 0 && <div className="flex justify-end mb-2"><ExportMenu spec={projectedSpec} /></div>}
          <div className="overflow-x-auto border-y border-rule">
            <table className="w-full text-sm num">
              <thead>
                <tr className="border-b border-rule">
                  {scope === 'season' && <SortTh tip={TIPS.projWeek} sortKey="week" state={proj.sort} onSort={proj.click}>Week</SortTh>}
                  <SortTh tip={TIPS.projElo} sortKey="away" state={proj.sort} onSort={proj.click}>Away</SortTh>
                  <SortTh tip={TIPS.projElo} sortKey="home" state={proj.sort} onSort={proj.click}>Home</SortTh>
                  <SortTh tip={TIPS.projLean} sortKey="lean" state={proj.sort} onSort={proj.click} className="min-w-[200px] text-center">Away ◀ Edge ▶ Home</SortTh>
                  <SortTh tip={TIPS.projFav} sortKey="prob" state={proj.sort} onSort={proj.click} className="text-right">Favored</SortTh>
                  <SortTh tip={TIPS.projOutlook} sortKey="tier" state={proj.sort} onSort={proj.click}>Outlook</SortTh>
                </tr>
              </thead>
              <tbody>
                {sortedProjected.map(({ game: g, l }, i) => (
                  <tr key={g.gameId} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
                    {scope === 'season' && <td className="px-2 py-1.5 whitespace-nowrap">{label(g.week)}</td>}
                    {side(g.awayTeam, g.awayElo, null, l.tossUp ? null : !l.homeFav)}
                    {side(g.homeTeam, g.homeElo, null, l.tossUp ? null : l.homeFav)}
                    <td className="px-2 py-1.5"><LeanBar homeFav={l.homeFav} edge={l.edge} /></td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <span className="font-semibold">{l.leansTo.abbrName}</span>{' '}
                      <span className="text-muted">{pct0(l.prob)}</span>
                    </td>
                    <td
                      className={`px-2 py-1.5 whitespace-nowrap text-xs uppercase tracking-wide ${l.tossUp ? 'font-bold' : 'font-semibold'}`}
                      style={{ backgroundColor: l.shade }}
                    >
                      {l.tier.label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted px-2 py-2">
              {TIPS.projOutlook} Win probabilities use today's ratings and don't account for how ratings change before each game.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function EloPage() {
  const [params, setParams] = useSearchParams()
  const tab = TAB_VALUES.includes(params.get('tab')) ? params.get('tab') : 'ratings'
  // replace: switching tabs shouldn't make Back walk through every tab visited
  const setTab = next => setParams(prev => {
    const p = new URLSearchParams(prev)
    next === 'ratings' ? p.delete('tab') : p.set('tab', next)
    return p
  }, { replace: true })
  const [{ rows: history, params: historyParams }, setHistory] = useState({ rows: [], params: {} })
  const [season, setSeason] = useState(null)
  const [week, setWeek] = useState(null)
  const [{ rows: ratings, params: ratingsParams }, setRatings] = useState({ rows: [], params: {} })
  const [upcoming, setUpcoming] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let current = true
    getEloHistory()
      .then(h => {
        if (!current) return
        setHistory({ rows: h, params: {} })
        if (h.length) {
          const last = h.reduce((m, r) => (r.season > m.season || (r.season === m.season && r.week > m.week) ? r : m))
          setSeason(last.season)
          setWeek(last.week)
        } else setLoading(false)
      })
      .catch(() => { if (current) { setError("Couldn't load Elo ratings. Try again in a moment."); setLoading(false) } })
    return () => { current = false }
  }, [])

  useEffect(() => {
    let current = true
    getEloUpcoming().then(rows => { if (current) setUpcoming(rows) }).catch(() => { if (current) setUpcoming([]) })
    return () => { current = false }
  }, [])

  useEffect(() => {
    if (season == null || week == null) return
    let current = true
    const params = { season, week }
    setLoading(true)
    getEloRatings(season, week)
      .then(r => { if (current) { setRatings({ rows: r, params }); setLoading(false) } })
      .catch(() => { if (current) { setError("Couldn't load Elo ratings. Try again in a moment."); setLoading(false) } })
    return () => { current = false }
  }, [season, week])

  const seasons = useMemo(() => [...new Set(history.map(r => r.season))].sort((a, b) => a - b), [history])
  const weeks = useMemo(
    () => [...new Set(history.filter(r => r.season === season).map(r => r.week))].sort((a, b) => a - b),
    [history, season])
  const futureWeeks = useMemo(
    () => [...new Set(upcoming.filter(u => u.season === season).map(u => u.week))].filter(w => !weeks.includes(w)).sort((a, b) => a - b),
    [upcoming, season, weeks])
  const teams = useMemo(() => [...ratings].sort((a, b) => a.abbrName.localeCompare(b.abbrName)), [ratings])

  const changeSeason = s => {
    const w = [...new Set(history.filter(r => r.season === s).map(r => r.week))].sort((a, b) => a - b)
    setSeason(s)
    setWeek(w[w.length - 1])
  }

  const showWeek = tab === 'ratings' || tab === 'games'
  const weekOptions = tab === 'games' ? [...weeks, ...futureWeeks] : weeks

  useEffect(() => {
    if (weeks.length && !weekOptions.includes(week)) setWeek(weeks[weeks.length - 1])
  }, [tab])

  return (
    <div>
      <PageHeader
        title="Elo"
        qualifier={season != null && week != null ? `${seasonLabel(season)} · ${label(week)} · long-term team strength` : 'Long-term team strength'}
      >
        {showWeek && seasons.length > 0 && (
          <>
            <select className="field" aria-label="Season" value={season ?? ''} onChange={e => changeSeason(Number(e.target.value))}>
              {seasons.map(s => <option key={s} value={s}>Season {seasonNumber(s)}</option>)}
            </select>
            <select className="field" aria-label="Week" value={week ?? ''} onChange={e => setWeek(Number(e.target.value))}>
              {weekOptions.map(w => <option key={w} value={w}>{label(w)}{weeks.includes(w) ? '' : ' (projected)'}</option>)}
            </select>
          </>
        )}
      </PageHeader>

      {error && <div className="text-bad mb-4">{error}</div>}

      <Tabs value={tab} onChange={setTab} tabs={TABS} />

      {tab === 'ratings' && <RatingsTab ratings={ratings} loading={loading} params={ratingsParams} />}
      {tab === 'history' && <HistoryTab history={history} teams={teams} params={historyParams} />}
      {tab === 'matchup' && <MatchupTab ratedTeams={teams} />}
      {tab === 'games' && <GamesTab season={season} week={week} upcoming={upcoming} />}
    </div>
  )
}
