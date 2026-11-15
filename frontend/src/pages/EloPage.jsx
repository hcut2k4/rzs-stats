import { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { getEloHistory, getEloRatings, getEloGames, getEloMatchup } from '../api/client'
import PageHeader from '../components/PageHeader'
import Tabs from '../components/Tabs'
import { TeamCell, TeamLogo } from '../components/TeamLogo'
import DivergingBar from '../components/DivergingBar'
import { divergeColor } from '../utils/heat'
import { weekLabel } from '../utils/playoffRounds'
import { COLORS } from '../utils/chartColors'

const BASE = 1500
const label = w => weekLabel(w >= 18 ? 2 : 1, w)
const signed = (v, d = 1) => (v > 0 ? '+' : '') + v.toFixed(d)
const pct = v => (v * 100).toFixed(1) + '%'

function RankMove({ change }) {
  if (!change) return <span className="text-muted">–</span>
  return change > 0
    ? <span className="text-good font-semibold">▲ {change}</span>
    : <span className="text-bad font-semibold">▼ {-change}</span>
}

function Movers({ ratings }) {
  const sorted = [...ratings].sort((a, b) => b.change - a.change)
  const list = (rows, title) => (
    <div>
      <h3 className="th mb-1">{title}</h3>
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
      {list(sorted.slice(0, 5), 'Biggest risers this week')}
      {list(sorted.slice(-5).reverse(), 'Biggest droppers this week')}
    </div>
  )
}

function RatingsTab({ ratings, loading }) {
  if (loading) return <p className="text-muted">Loading...</p>
  if (!ratings.length) return <p className="text-muted">No ratings available.</p>
  const maxDev = Math.max(...ratings.map(r => Math.abs(r.elo - BASE)))
  const maxChange = Math.max(...ratings.map(r => Math.abs(r.change)))
  return (
    <div>
      <div className="overflow-x-auto border-y border-rule">
        <table className="w-full text-sm num">
          <thead>
            <tr className="border-b border-rule">
              <th className="th w-10">#</th>
              <th className="th">Team</th>
              <th className="th text-right">Elo</th>
              <th className="th min-w-[160px]">vs 1500</th>
              <th className="th text-right">Change</th>
              <th className="th text-right">Rank move</th>
              <th className="th text-right">Games</th>
            </tr>
          </thead>
          <tbody>
            {ratings.map((r, i) => (
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
  const seasonOf = key => `Season ${Number(key.split('-')[0]) + 2026}`

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-xs text-muted">
        <span>Click teams to highlight them. The rest fade back. Dotted lines mark season starts.</span>
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
            labelFormatter={k => { const [s, w] = k.split('-').map(Number); return `Season ${s + 2026} · ${label(w)}` }}
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

function MatchupTab({ teams }) {
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
        <label className="flex items-center gap-2 text-sm text-muted">
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
          <div className="flex h-8 w-full text-sm font-bold num" role="img" aria-label="Win probability">
            <div className="flex items-center pl-2" style={{ width: pct(result.teamAWinProbability), background: 'rgb(37 99 235 / 0.55)' }}>{pct(result.teamAWinProbability)}</div>
            <div className="flex items-center justify-end pr-2 flex-1" style={{ background: 'rgb(234 88 12 / 0.55)' }}>{pct(result.teamBWinProbability)}</div>
          </div>
          <p className="text-xs text-muted mt-2">Win probability from current Elo ratings.</p>
        </div>
      )}
    </div>
  )
}

function GamesTab({ season, week }) {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (season == null || week == null) return
    setLoading(true)
    getEloGames(season, week).then(g => { setGames(g); setLoading(false) }).catch(() => setLoading(false))
  }, [season, week])

  if (loading) return <p className="text-muted">Loading...</p>
  if (!games.length) return <p className="text-muted">No games processed for this week.</p>

  const side = (team, elo, delta) => (
    <td className="px-2 py-1.5 whitespace-nowrap">
      <div className="flex items-center gap-2">
        <TeamLogo abbr={team.abbrName} size={20} />
        <span className="font-semibold">{team.abbrName}</span>
        <span className="text-muted">{elo.toFixed(0)}</span>
        <span className={delta >= 0 ? 'text-good' : 'text-bad'}>{signed(delta)}</span>
      </div>
    </td>
  )

  return (
    <div className="overflow-x-auto border-y border-rule">
      <table className="w-full text-sm num">
        <thead>
          <tr className="border-b border-rule">
            <th className="th">Away</th>
            <th className="th">Home</th>
            <th className="th text-right">Score</th>
            <th className="th text-right">Home win prob.</th>
            <th className="th text-right">MOV mult.</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g, i) => (
            <tr key={g.gameId} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
              {side(g.awayTeam, g.awayPregameElo, g.awayPostgameElo - g.awayPregameElo)}
              {side(g.homeTeam, g.homePregameElo, g.homePostgameElo - g.homePregameElo)}
              <td className="px-2 py-1.5 text-right">{g.awayScore}–{g.homeScore}</td>
              <td className="px-2 py-1.5 text-right">{pct(g.homeWinProbability)}</td>
              <td className="px-2 py-1.5 text-right">{g.movMultiplier.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted px-2 py-2">Each team shows its pregame Elo and the points it gained or lost in that game.</p>
    </div>
  )
}

export default function EloPage() {
  const [tab, setTab] = useState('ratings')
  const [history, setHistory] = useState([])
  const [season, setSeason] = useState(null)
  const [week, setWeek] = useState(null)
  const [ratings, setRatings] = useState([])
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
  const teams = useMemo(() => [...ratings].sort((a, b) => a.abbrName.localeCompare(b.abbrName)), [ratings])

  const changeSeason = s => {
    const w = [...new Set(history.filter(r => r.season === s).map(r => r.week))].sort((a, b) => a - b)
    setSeason(s)
    setWeek(w[w.length - 1])
  }

  const showWeek = tab === 'ratings' || tab === 'games'

  return (
    <div>
      <PageHeader
        title="Elo"
        qualifier={season != null && week != null ? `Season ${season + 2026} · ${label(week)} · long-term team strength` : 'Long-term team strength'}
      >
        {showWeek && seasons.length > 0 && (
          <>
            <select className="field" aria-label="Season" value={season ?? ''} onChange={e => changeSeason(Number(e.target.value))}>
              {seasons.map(s => <option key={s} value={s}>Season {s + 2026}</option>)}
            </select>
            <select className="field" aria-label="Week" value={week ?? ''} onChange={e => setWeek(Number(e.target.value))}>
              {weeks.map(w => <option key={w} value={w}>{label(w)}</option>)}
            </select>
          </>
        )}
      </PageHeader>

      {error && <div className="text-bad mb-4">{error}</div>}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'ratings', label: 'Ratings' },
          { value: 'history', label: 'History' },
          { value: 'matchup', label: 'Matchup' },
          { value: 'games', label: 'Games' },
        ]}
      />

      {tab === 'ratings' && <RatingsTab ratings={ratings} loading={loading} />}
      {tab === 'history' && <HistoryTab history={history} teams={teams} />}
      {tab === 'matchup' && <MatchupTab teams={teams} />}
      {tab === 'games' && <GamesTab season={season} week={week} />}
    </div>
  )
}
