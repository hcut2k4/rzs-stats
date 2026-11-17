import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import {
  getSeasons, getStandings, getAvailableWeeks, getGames,
  getEloHistory, getEloRatings, getQbLeaderboard, getWeeklyTrends,
} from '../api/client'
import { TeamLogo } from '../components/TeamLogo'
import PageHeader from '../components/PageHeader'
import { seasonLabel } from '../utils/seasons'
import { weekLabel } from '../utils/playoffRounds'
import { COLORS } from '../utils/chartColors'

const pct = v => (v == null ? '–' : (v * 100).toFixed(1) + '%')
const signed1 = v => (v == null ? '–' : (v > 0 ? '+' : '') + v.toFixed(1))
const n2 = v => (v == null ? '–' : v.toFixed(2))

function Card({ to, title, blurb, cta, children }) {
  return (
    <Link
      to={to}
      className="group flex flex-col border-t-2 border-rule pt-3 hover:bg-surface transition-colors -mx-2 px-2 pb-2"
    >
      <h2 className="font-display font-bold uppercase text-xl leading-none group-hover:text-accent transition-colors">{title}</h2>
      <p className="text-sm text-muted mt-1 mb-3">{blurb}</p>
      <div className="flex-1">{children}</div>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted group-hover:text-accent transition-colors mt-3">
        {cta} →
      </span>
    </Link>
  )
}

function Rows({ loading, empty, children }) {
  if (loading) return <p className="text-sm text-muted">Loading…</p>
  if (empty) return <p className="text-sm text-muted">No data yet.</p>
  return <div className="divide-y divide-line border-y border-line">{children}</div>
}

const rowClass = 'flex items-center gap-2 py-1.5 text-sm'

function StandingsCard({ season, standings, loading }) {
  const top = [...standings]
    .filter(s => s.pythagoreanPat != null)
    .sort((a, b) => b.pythagoreanPat - a.pythagoreanPat)
    .slice(0, 5)

  return (
    <Card
      to="/standings"
      title="Standings"
      blurb={season == null ? 'PyPAT, Luck and strength of schedule.' : `${seasonLabel(season)} — ranked by PyPAT, not record.`}
      cta="Full standings"
    >
      <Rows loading={loading} empty={!top.length}>
        <div className="flex items-center gap-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
          <span className="w-4">#</span>
          <span className="flex-1">Team</span>
          <span className="w-14 text-right">PyPAT</span>
          <span className="w-12 text-right">Luck</span>
        </div>
        {top.map((s, i) => (
          <div key={s.teamId} className={rowClass}>
            <span className="w-4 text-muted num">{i + 1}</span>
            <TeamLogo abbr={s.abbrName} size={20} />
            <span className="flex-1 font-semibold truncate">{s.displayName}</span>
            <span className="w-14 text-right num font-semibold">{pct(s.pythagoreanPat)}</span>
            <span className={`w-12 text-right num ${s.winDiff > 0 ? 'text-good' : s.winDiff < 0 ? 'text-bad' : 'text-muted'}`}>
              {signed1(s.winDiff)}
            </span>
          </div>
        ))}
      </Rows>
    </Card>
  )
}

function GamesCard({ games, week, loading }) {
  const shown = games.slice(0, 5)

  return (
    <Card
      to="/games"
      title="Games"
      blurb={week == null ? 'Results week by week.' : `Latest results — ${weekLabel(1, week)}.`}
      cta="All games"
    >
      <Rows loading={loading} empty={!shown.length}>
        {shown.map(g => {
          const homeWon = g.homeScore > g.awayScore
          const awayWon = g.awayScore > g.homeScore
          return (
            <div key={g.gameId} className={rowClass}>
              <TeamLogo abbr={g.awayTeam?.abbrName} size={20} />
              <span className={`w-10 ${awayWon ? 'font-bold' : 'text-muted'}`}>{g.awayTeam?.abbrName}</span>
              <span className={`w-7 text-right num ${awayWon ? 'font-bold' : 'text-muted'}`}>{g.awayScore ?? '–'}</span>
              <span className="text-[10px] text-muted">@</span>
              <span className={`w-7 num ${homeWon ? 'font-bold' : 'text-muted'}`}>{g.homeScore ?? '–'}</span>
              <TeamLogo abbr={g.homeTeam?.abbrName} size={20} />
              <span className={`flex-1 ${homeWon ? 'font-bold' : 'text-muted'}`}>{g.homeTeam?.abbrName}</span>
            </div>
          )
        })}
      </Rows>
    </Card>
  )
}

function EloCard({ ratings, loading }) {
  const top = [...ratings].sort((a, b) => b.elo - a.elo).slice(0, 5)
  const riser = [...ratings].sort((a, b) => b.change - a.change)[0]

  return (
    <Card to="/elo" title="Elo" blurb="Team strength carried across seasons." cta="Elo ratings">
      <Rows loading={loading} empty={!top.length}>
        <div className="flex items-center gap-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
          <span className="w-4">#</span>
          <span className="flex-1">Team</span>
          <span className="w-14 text-right">Elo</span>
          <span className="w-12 text-right">Chg</span>
        </div>
        {top.map((r, i) => (
          <div key={r.teamId ?? r.abbrName} className={rowClass}>
            <span className="w-4 text-muted num">{i + 1}</span>
            <TeamLogo abbr={r.abbrName} size={20} />
            <span className="flex-1 font-semibold truncate">{r.displayName ?? r.abbrName}</span>
            <span className="w-14 text-right num font-semibold">{Math.round(r.elo)}</span>
            <span className={`w-12 text-right num ${r.change > 0 ? 'text-good' : r.change < 0 ? 'text-bad' : 'text-muted'}`}>
              {signed1(r.change)}
            </span>
          </div>
        ))}
        {riser && riser.change > 0 && (
          <p className="text-xs text-muted pt-1.5">
            Biggest riser: <span className="text-ink font-semibold">{riser.abbrName}</span> {signed1(riser.change)}
          </p>
        )}
      </Rows>
    </Card>
  )
}

function QbCard({ season, qbs, loading }) {
  const top = qbs.slice(0, 5)

  return (
    <Card
      to="/qb"
      title="QBs"
      blurb={season == null ? 'Quarterbacks ranked by TANY/A.' : `${seasonLabel(season)} quarterbacks by TANY/A.`}
      cta="QB leaderboard"
    >
      <Rows loading={loading} empty={!top.length}>
        <div className="flex items-center gap-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
          <span className="w-4">#</span>
          <span className="flex-1">QB</span>
          <span className="w-14 text-right">TANY/A</span>
        </div>
        {top.map((r, i) => (
          <div key={r.rosterId} className={rowClass}>
            <span className="w-4 text-muted num">{r.rank ?? i + 1}</span>
            <TeamLogo abbr={r.teamAbbr} size={20} />
            <span className="flex-1 font-semibold truncate">{r.playerName}</span>
            <span className="w-14 text-right num font-semibold">{n2(r.tanya)}</span>
          </div>
        ))}
      </Rows>
    </Card>
  )
}

function TrendsCard({ season, weekly, loading }) {
  const names = weekly.length
    ? [...(weekly[weekly.length - 1].standings ?? [])]
        .filter(s => s.pythagoreanPat != null)
        .sort((a, b) => b.pythagoreanPat - a.pythagoreanPat)
        .slice(0, 4)
        .map(s => s.displayName)
    : []

  const chartData = weekly.map(d => {
    const point = { week: d.weekIndex + 1 }
    d.standings.forEach(s => { if (names.includes(s.displayName)) point[s.displayName] = s.pythagoreanPat })
    return point
  })

  return (
    <Card
      to="/trends"
      title="Trends"
      blurb={season == null ? 'Season history and weekly progression.' : `${seasonLabel(season)} PyPAT, week by week.`}
      cta="All trends"
    >
      <Rows loading={loading} empty={chartData.length < 2}>
        <div className="h-36 py-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="week" tick={{ fill: 'rgb(var(--muted))', fontSize: 10 }} stroke="rgb(var(--line))" />
              <YAxis
                domain={[0, 1]}
                width={32}
                tickFormatter={v => v.toFixed(1)}
                tick={{ fill: 'rgb(var(--muted))', fontSize: 10 }}
                stroke="rgb(var(--line))"
              />
              {names.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1.5 text-xs">
          {names.map((name, i) => (
            <span key={name} className="flex items-center gap-1 text-muted">
              <span className="w-2.5 h-0.5" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              {name}
            </span>
          ))}
        </div>
      </Rows>
    </Card>
  )
}

const DEFINITIONS = [
  ['PyPAT', 'Win expectancy from scoring margin, not W-L record.'],
  ['Luck', 'Wins above or below what the scoring margin predicted.'],
  ['SoS', 'Opponent PyPAT with head-to-head games removed.'],
  ['Elo', 'Rolling team strength that carries between seasons.'],
  ['TANY/A', 'QB efficiency across passing, sacks and rushing.'],
]

function AboutCard() {
  return (
    <Card to="/about" title="About" blurb="What every number on this site means." cta="Stat definitions">
      <div className="divide-y divide-line border-y border-line">
        {DEFINITIONS.map(([name, def]) => (
          <div key={name} className="py-1.5 text-sm">
            <span className="font-semibold">{name}</span>
            <span className="text-muted"> — {def}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default function HomePage() {
  const [season, setSeason] = useState(null)
  const [standings, setStandings] = useState([])
  const [games, setGames] = useState([])
  const [week, setWeek] = useState(null)
  const [ratings, setRatings] = useState([])
  const [qbs, setQbs] = useState([])
  const [weekly, setWeekly] = useState([])
  const [pending, setPending] = useState({ standings: true, games: true, elo: true, qb: true, trends: true })

  const done = key => setPending(p => ({ ...p, [key]: false }))

  useEffect(() => {
    let live = true
    getSeasons()
      .then(s => {
        if (!live || !s.length) {
          if (live) setPending({ standings: false, games: false, elo: false, qb: false, trends: false })
          return
        }
        const latest = s[s.length - 1]
        setSeason(latest)

        getStandings(latest).then(d => { if (live) setStandings(d) }).finally(() => live && done('standings'))

        getAvailableWeeks(latest, 1)
          .then(w => {
            if (!live) return
            const last = w.length ? w[w.length - 1] : null
            setWeek(last)
            if (last == null) { done('games'); return }
            return getGames(latest, 1, last).then(g => { if (live) setGames(g) })
          })
          .finally(() => live && done('games'))

        getQbLeaderboard({ scope: 'season', season: latest, stage: 1 })
          .then(d => { if (live) setQbs(d) })
          .finally(() => live && done('qb'))

        getWeeklyTrends(latest).then(d => { if (live) setWeekly(d) }).finally(() => live && done('trends'))
      })
      .catch(() => live && setPending({ standings: false, games: false, elo: false, qb: false, trends: false }))

    getEloHistory()
      .then(h => {
        if (!live || !h.length) { if (live) done('elo'); return }
        const last = h.reduce((m, r) => (r.season > m.season || (r.season === m.season && r.week > m.week) ? r : m))
        return getEloRatings(last.season, last.week).then(r => { if (live) setRatings(r) })
      })
      .finally(() => live && done('elo'))

    return () => { live = false }
  }, [])

  return (
    <div>
      <PageHeader
        title="RZS Stats"
        qualifier={season == null ? 'Red Zone Sports' : `Red Zone Sports — ${seasonLabel(season)}`}
        takeaway="W-L records are noisy — one-score games are largely random. PyPAT, Elo and strength of schedule cut through that noise to show who is actually playing well and who has just been lucky."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8">
        <StandingsCard season={season} standings={standings} loading={pending.standings} />
        <GamesCard games={games} week={week} loading={pending.games} />
        <EloCard ratings={ratings} loading={pending.elo} />
        <QbCard season={season} qbs={qbs} loading={pending.qb} />
        <TrendsCard season={season} weekly={weekly} loading={pending.trends} />
        <AboutCard />
      </div>
    </div>
  )
}
