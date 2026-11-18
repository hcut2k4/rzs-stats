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
import { divergeColor } from '../utils/heat'
import { TIERS, lean, pct0 } from '../utils/eloLean'
import { weekLabel } from '../utils/playoffRounds'
import { COLORS } from '../utils/chartColors'
import { seasonLabel, seasonNumber } from '../utils/seasons'

const BASE = 1500

const TABS = [
  { value: 'ratings', label: 'Ratings' },
  { value: 'history', label: 'History' },
  { value: 'matchup', label: 'Matchup' },
  { value: 'games', label: 'Games' },
]
const TAB_VALUES = TABS.map(t => t.value)
const label = w => weekLabel(w >= 18 ? 2 : 1, w)
const signed = (v, d = 1) => (v > 0 ? '+' : '') + v.toFixed(d)
const pct = v => (v * 100).toFixed(1) + '%'

const TIPS = {
  rank: 'Position when all 32 teams are sorted by Elo, highest first.',
  team: 'Team name. Sorts alphabetically.',
  elo: 'The team\'s Elo rating. Higher means a stronger team. 1500 is the average rating every team started from.',
  vs1500: 'How far the rating is from the 1500 average. Blue bars to the right are above average, orange bars to the left are below average.',
  change: 'Elo points gained or lost since the previous week. Zero usually means the team was on a bye.',
  rankMove: 'How many places the team moved in the Elo ranking since the previous week. Green up arrow is a climb, red down arrow is a drop.',
  games: 'Number of games counted toward this rating so far, regular season and playoffs, across all seasons.',
  risers: 'The five teams whose rating rose the most since the previous week.',
  droppers: 'The five teams whose rating fell the most since the previous week.',
  away: 'Away team, its Elo going into the game, and the Elo points it gained (green) or lost (red) from the result. Sorts by Elo.',
  home: 'Home team, its Elo going into the game, and the Elo points it gained (green) or lost (red) from the result. Sorts by Elo.',
  score: 'Final score, away team first.',
  homeProb: 'The chance the home team was expected to win before the game, based only on the two teams\' Elo ratings. 50% is a toss-up.',
  mov: 'Margin-of-victory multiplier. Bigger wins move ratings more, up to a 21-point cap. A heavy favorite winning big gets less credit than an upset winner. 1.00 is a tie.',
  result: 'Flags upsets, sized by how strong the beaten favorite was: a Tilt favorite losing is a Slight upset, then Upset, Big upset, and Stunner when a Solid favorite goes down. Games Elo rated a Toss-up are left blank, because neither side was favored enough for the result to be a surprise. The label shows the winner\'s pregame chance.',
  projWeek: 'The week or playoff round of the unplayed game.',
  projElo: 'Each team\'s current Elo rating, which is used for the projection. Sorts by Elo.',
  projLean: 'Which way Elo leans and by how much. The bar grows out of the center line toward the favored team, and the longer and darker it is, the bigger the edge. Sorts home favorites and away favorites to opposite ends.',
  projFav: 'The team Elo leans toward and its projected chance of winning. Sorts the closest games first.',
  projOutlook: 'How competitive the game should be, read off the favorite\'s win chance: Toss-up under 55%, Tilt under 60%, Lean under 70%, Likely under 80%, Solid above that. Each tier has its own color \u2014 green for a toss-up, then blue, purple, orange and yellow \u2014 running deep at the competitive end of its own band and fading to nearly white at the far end. Sorts the closest games first.',
}

const RED = '220 38 38'

const UPSET_LEVELS = [
  { hi: 0.60, label: 'Slight upset', alpha: 0.12 },
  { hi: 0.70, label: 'Upset', alpha: 0.22 },
  { hi: 0.80, label: 'Big upset', alpha: 0.32 },
  { hi: Infinity, label: 'Stunner', alpha: 0.42 },
]

function upsetInfo(g) {
  if (g.homeScore === g.awayScore) return null
  const homeWon = g.homeScore > g.awayScore
  const chance = homeWon ? g.homeWinProbability : g.awayWinProbability
  const favChance = homeWon ? g.awayWinProbability : g.homeWinProbability
  if (favChance < TIERS[0].hi) return null
  const level = UPSET_LEVELS.find(l => favChance < l.hi)
  return {
    chance,
    favChance,
    winner: homeWon ? g.homeTeam : g.awayTeam,
    label: level.label,
    shade: `rgb(${RED} / ${level.alpha.toFixed(2)})`,
  }
}

function RankMove({ change }) {
  if (!change) return <span className="text-muted">–</span>
  return change > 0
    ? <span className="text-good font-semibold">▲ {change}</span>
    : <span className="text-bad font-semibold">▼ {-change}</span>
}

function Movers({ ratings }) {
  const sorted = [...ratings].sort((a, b) => b.change - a.change)
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
      {list(sorted.slice(0, 5), 'Biggest risers this week', TIPS.risers)}
      {list(sorted.slice(-5).reverse(), 'Biggest droppers this week', TIPS.droppers)}
    </div>
  )
}

function RatingsTab({ ratings, loading }) {
  const sort = useSorter({ key: null, asc: false })
  if (loading) return <p className="text-muted">Loading...</p>
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
  return (
    <div>
      <div className="overflow-x-auto border-y border-rule">
        <table className="w-full text-sm num">
          <thead>
            <tr className="border-b border-rule">
              <SortTh tip={TIPS.rank} sortKey="rank" state={sort.sort} onSort={sort.click} className="w-10">#</SortTh>
              <SortTh tip={TIPS.team} sortKey="team" state={sort.sort} onSort={sort.click}>Team</SortTh>
              <SortTh tip={TIPS.elo} sortKey="elo" state={sort.sort} onSort={sort.click} className="text-right">Elo</SortTh>
              <SortTh tip={TIPS.vs1500} sortKey="vs1500" state={sort.sort} onSort={sort.click} className="min-w-[160px]">vs 1500</SortTh>
              <SortTh tip={TIPS.change} sortKey="change" state={sort.sort} onSort={sort.click} className="text-right">Change</SortTh>
              <SortTh tip={TIPS.rankMove} sortKey="rankMove" state={sort.sort} onSort={sort.click} className="text-right">Rank move</SortTh>
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
        Elo measures long-term strength from every game, playoffs included. Every team starts at 1500 and 10% of the gap back to 1500 is lost between seasons. Change is versus the previous week.
      </p>
      <Movers ratings={ratings} />
    </div>
  )
}

function HistoryTab({ history, teams }) {
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

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-xs text-muted">
        <span title="Each line is one team's Elo after every week. Click a team below to highlight it. Dotted vertical lines mark the start of a season, where ratings are pulled 10% back toward 1500.">Click teams to highlight them. The rest fade back. Dotted lines mark season starts.</span>
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

function MatchupTab({ ratedTeams }) {
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
    getEloMatchup(a, b, home || undefined).then(setResult).catch(() => setResult(null))
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
        <label className="flex items-center gap-2 text-sm text-muted" title="Choose which team has home field, or Neutral for no home-field effect. Home field only matters if the home-field advantage setting is above zero.">
          Home team
          <select className="field" aria-label="Home team" value={home} onChange={e => setHome(e.target.value)}>
            <option value="">Neutral</option>
            <option value={a ?? ''}>Team A</option>
            <option value={b ?? ''}>Team B</option>
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
          <div className="flex h-8 w-full text-sm font-bold num" role="img" aria-label="Win probability" title="Each team's chance of winning if they played today, from their current Elo ratings.">
            <div className="flex items-center pl-2" style={{ width: pct(result.teamAWinProbability), background: 'rgb(37 99 235 / 0.55)' }}>{pct(result.teamAWinProbability)}</div>
            <div className="flex items-center justify-end pr-2 flex-1" style={{ background: 'rgb(234 88 12 / 0.55)' }}>{pct(result.teamBWinProbability)}</div>
          </div>
          <p className="text-xs text-muted mt-2">Win probability from current Elo ratings.</p>
        </div>
      )}
    </div>
  )
}

function GamesTab({ season, week, upcoming }) {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(false)
  const played = useSorter({ key: null, asc: false })
  const [scope, setScope] = useState('week')
  const proj = useSorter({ key: 'tier', asc: true })

  useEffect(() => {
    if (season == null || week == null) return
    setLoading(true)
    getEloGames(season, week).then(g => { setGames(g); setLoading(false) }).catch(() => setLoading(false))
  }, [season, week])

  const projected = useMemo(() => upcoming.filter(u => u.season === season && (scope === 'season' || u.week === week)), [upcoming, season, week, scope])

  if (loading) return <p className="text-muted">Loading...</p>
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
        <div className="overflow-x-auto border-y border-rule">
          <table className="w-full text-sm num">
            <thead>
              <tr className="border-b border-rule">
                <SortTh tip={TIPS.away} sortKey="away" state={played.sort} onSort={played.click}>Away</SortTh>
                <SortTh tip={TIPS.home} sortKey="home" state={played.sort} onSort={played.click}>Home</SortTh>
                <SortTh tip={TIPS.score} sortKey="margin" state={played.sort} onSort={played.click} className="text-right">Score</SortTh>
                <SortTh tip={TIPS.homeProb} sortKey="homeProb" state={played.sort} onSort={played.click} className="text-right">Home win prob.</SortTh>
                <SortTh tip={TIPS.mov} sortKey="mov" state={played.sort} onSort={played.click} className="text-right">MOV mult.</SortTh>
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
                          title={`${upset.winner.displayName} had a ${pct(upset.chance)} chance before the game`}>
                          {upset.label} · {Math.round(upset.chance * 100)}%
                        </td>
                      : <td className="px-2 py-1.5" />
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted px-2 py-2">Each team shows its pregame Elo and the points it gained or lost in that game. Upsets are sized by the favorite they beat &mdash; Slight upset, Upset, Big upset, Stunner &mdash; and games Elo rated a Toss-up are left blank, since neither side was favored enough to be upset. Click any heading to sort; Score sorts by margin.</p>
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
              Projected from each team&rsquo;s current Elo. The bar leans toward the favored team and grows with the edge. Outlook rates how competitive the game should be &mdash; Toss-up under 55%, Tilt under 60%, Lean under 70%, Likely under 80%, Solid above that. Each tier has its own color &mdash; green for a toss-up, then blue, purple, orange and yellow &mdash; deep at the competitive end of its band and fading to nearly white at the far end. Click any heading to sort. Ratings change as games are played, so projections for later weeks are less certain.
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
  const [history, setHistory] = useState([])
  const [season, setSeason] = useState(null)
  const [week, setWeek] = useState(null)
  const [ratings, setRatings] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getEloHistory()
      .then(h => {
        setHistory(h)
        if (h.length) {
          const last = h.reduce((m, r) => (r.season > m.season || (r.season === m.season && r.week > m.week) ? r : m))
          setSeason(last.season)
          setWeek(last.week)
        } else setLoading(false)
      })
      .catch(() => { setError('Failed to load Elo ratings'); setLoading(false) })
  }, [])

  useEffect(() => {
    getEloUpcoming().then(setUpcoming).catch(() => setUpcoming([]))
  }, [])

  useEffect(() => {
    if (season == null || week == null) return
    setLoading(true)
    getEloRatings(season, week)
      .then(r => { setRatings(r); setLoading(false) })
      .catch(() => { setError('Failed to load Elo ratings'); setLoading(false) })
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

      {tab === 'ratings' && <RatingsTab ratings={ratings} loading={loading} />}
      {tab === 'history' && <HistoryTab history={history} teams={teams} />}
      {tab === 'matchup' && <MatchupTab ratedTeams={teams} />}
      {tab === 'games' && <GamesTab season={season} week={week} upcoming={upcoming} />}
    </div>
  )
}
