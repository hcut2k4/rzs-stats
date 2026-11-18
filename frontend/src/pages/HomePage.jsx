import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import {
  getSeasons, getStandings, getAvailableWeeks, getGames,
  getEloHistory, getEloRatings, getEfficiency, getEloUpcoming, getQbLeaderboard, getWeeklyTrends,
} from '../api/client'
import { TeamLogo } from '../components/TeamLogo'
import PageHeader from '../components/PageHeader'
import ExportMenu from '../components/ExportMenu'
import { seasonLabel } from '../utils/seasons'
import { weekLabel } from '../utils/playoffRounds'
import { COLORS } from '../utils/chartColors'
import { lean, pct0, TIERS } from '../utils/eloLean'

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

function EfficiencyCard({ season, rows, loading }) {
  const top = rows.slice(0, 5)

  return (
    <Card
      to="/efficiency"
      title="Efficiency"
      blurb={season == null ? 'Points per drive, offense minus defense.' : `${seasonLabel(season)} teams by net points per drive.`}
      cta="Team efficiency"
    >
      <Rows loading={loading} empty={!top.length}>
        <div className="flex items-center gap-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
          <span className="w-4">#</span>
          <span className="flex-1">Team</span>
          <span className="w-14 text-right">Net PPD</span>
        </div>
        {top.map((r, i) => (
          <div key={r.teamId} className={rowClass}>
            <span className="w-4 text-muted num">{i + 1}</span>
            <TeamLogo abbr={r.abbrName} size={20} />
            <span className="flex-1 font-semibold truncate">{r.displayName}</span>
            <span className="w-14 text-right num font-semibold">{r.netPointsPerDrive == null ? '\u2014' : (r.netPointsPerDrive > 0 ? '+' : '') + r.netPointsPerDrive.toFixed(2)}</span>
          </div>
        ))}
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
      to="/standings?tab=weekly"
      title="Trends"
      blurb={season == null ? 'Season history and weekly progression.' : `${seasonLabel(season)} PyPAT, week by week.`}
      cta="Week by week"
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

const bestGrid = 'grid grid-cols-[2.25rem_minmax(0,1fr)_2.5rem_4.5rem] items-center gap-2'

const shortWeek = w => (w >= 18 ? weekLabel(2, w) : `Wk ${w + 1}`)

function BestGames({ upcoming, loading }) {
  const season = Math.max(...upcoming.map(g => g.season))
  const seasonGames = upcoming.filter(g => g.season === season)
  const week = Math.min(...seasonGames.map(g => g.week))
  const best = seasonGames
    .filter(g => g.week === week || g.week === week + 1)
    .map(game => ({ game, l: lean(game) }))
    .sort((a, b) => a.l.prob - b.l.prob || a.game.week - b.game.week)
    .slice(0, 5)

  const exportSpec = {
    name: 'Best Games Ahead',
    qualifier: `${seasonLabel(season)} · ${shortWeek(week)}–${shortWeek(week + 1)} · ${best.length} games · closest first`,
    description: 'The five closest unplayed games in the next two weeks of the latest season. Games are ranked by the favorite’s win probability, closest to a coin flip first.',
    rows: best,
    cols: [
      { label: 'Week', desc: 'The scheduled week or playoff round.', text: ({ game }) => shortWeek(game.week) },
      { label: 'Away', desc: 'The visiting team abbreviation.', text: ({ game }) => game.awayTeam.abbrName },
      { label: 'Home', desc: 'The home team abbreviation.', text: ({ game }) => game.homeTeam.abbrName },
      { label: 'Favored', desc: 'The abbreviation of the team with the higher win probability; the home team wins a tie.', text: ({ l }) => l.leansTo.abbrName },
      { label: 'Favored Win Prob', desc: 'The favored team’s Elo win probability.', text: ({ l }) => pct0(l.prob), value: ({ l }) => l.prob, z: '0%' },
      { label: 'Outlook', desc: `The tier of the favorite’s win probability: ${TIERS.map((t, i) => `${t.label} ${i === TIERS.length - 1 ? `at least ${pct0(t.lo)}` : `below ${pct0(t.hi)}`}`).join('; ')}.`, text: ({ l }) => l.tier.label, color: ({ l }) => l.shade },
    ],
    api: {
      path: '/elo/upcoming', params: {},
      note: 'This card shows the 5 closest games in the next two weeks of the latest season, computed client-side from the full upcoming list. To reproduce it, fetch /api/elo/upcoming, keep the latest season and the earliest unplayed week plus the following week, sort by closeness (|home win prob - 0.5|), then week ascending for ties, and take 5 games.',
      fields: {
        Week: 'week formatted as a week label or playoff round.',
        Away: 'awayTeam.abbrName', Home: 'homeTeam.abbrName',
        Favored: 'homeTeam.abbrName when homeWinProbability >= awayWinProbability; otherwise awayTeam.abbrName.',
        'Favored Win Prob': 'max(homeWinProbability, awayWinProbability).',
        Outlook: 'Apply the documented probability tiers to the favored win probability.',
      },
    },
  }

  return (
    <Card to="/elo?tab=games" title="Best Games Ahead" blurb="The closest unplayed games over the next two weeks." cta="All projected games">
      {!loading && best.length > 0 && <div className="flex justify-end"><ExportMenu spec={exportSpec} /></div>}
      <Rows loading={loading} empty={!best.length}>
        <div className={`${bestGrid} py-1 text-xs font-semibold uppercase tracking-wide text-muted`}>
          <span>Wk</span>
          <span>Matchup</span>
          <span className="text-right">Fav</span>
          <span className="text-center">Outlook</span>
        </div>
        {best.map(({ game: g, l }) => (
          <div key={g.gameId} className={`${bestGrid} py-1.5 text-sm`}>
            <span className="text-muted text-xs tabular-nums">{shortWeek(g.week)}</span>
            <span className="flex items-center gap-1.5 min-w-0">
              <TeamLogo abbr={g.awayTeam.abbrName} size={18} />
              <span className={l.tossUp ? 'font-semibold' : !l.homeFav ? 'font-semibold' : 'text-muted'}>{g.awayTeam.abbrName}</span>
              <span className="text-muted text-[10px] shrink-0">@</span>
              <TeamLogo abbr={g.homeTeam.abbrName} size={18} />
              <span className={l.tossUp ? 'font-semibold' : l.homeFav ? 'font-semibold' : 'text-muted'}>{g.homeTeam.abbrName}</span>
            </span>
            <span className="text-right num">{pct0(l.prob)}</span>
            <span
              className="rounded text-center text-[10px] font-semibold uppercase tracking-wide leading-tight px-1 py-1 whitespace-nowrap"
              style={{ backgroundColor: l.shade }}
            >
              {l.tier.label}
            </span>
          </div>
        ))}
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
  const [efficiency, setEfficiency] = useState([])
  const [weekly, setWeekly] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [pending, setPending] = useState({ standings: true, games: true, elo: true, qb: true, efficiency: true, trends: true, upcoming: true })

  const done = key => setPending(p => ({ ...p, [key]: false }))

  useEffect(() => {
    let live = true
    getSeasons()
      .then(s => {
        if (!live || !s.length) {
          if (live) setPending(p => ({ ...p, standings: false, games: false, qb: false, efficiency: false, trends: false }))
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

        getQbLeaderboard({ scope: 'season', season: latest, stage: 'regular' })
          .then(d => { if (live) setQbs(d) })
          .finally(() => live && done('qb'))

        getEfficiency(latest, 'regular')
          .then(d => { if (live) setEfficiency(d) })
          .catch(() => { if (live) setEfficiency([]) })
          .finally(() => live && done('efficiency'))

        getWeeklyTrends(latest).then(d => { if (live) setWeekly(d) }).finally(() => live && done('trends'))
      })
      .catch(() => live && setPending(p => ({ ...p, standings: false, games: false, qb: false, efficiency: false, trends: false })))

    getEloUpcoming()
      .then(u => { if (live) setUpcoming(u) })
      .catch(() => { if (live) setUpcoming([]) })
      .finally(() => live && done('upcoming'))

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
        <BestGames upcoming={upcoming} loading={pending.upcoming} />
        <StandingsCard season={season} standings={standings} loading={pending.standings} />
        <EfficiencyCard season={season} rows={efficiency} loading={pending.efficiency} />
        <GamesCard games={games} week={week} loading={pending.games} />
        <EloCard ratings={ratings} loading={pending.elo} />
        <QbCard season={season} qbs={qbs} loading={pending.qb} />
        <TrendsCard season={season} weekly={weekly} loading={pending.trends} />
        <AboutCard />
      </div>
    </div>
  )
}
