import { trajectoryCopy } from '../../utils/teamProfileCopy'
import { Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { TeamLogo } from '../TeamLogo'
import ExportMenu from '../ExportMenu'
import Section, { Empty, Loading } from './Section'
import { pct0 } from '../../utils/eloLean'
import { shortWeekName, weekName } from '../../utils/playoffRounds'
import { signed1 } from '../../utils/teamProfile'

const RESULT_TONE = { W: 'bg-good', L: 'bg-bad', T: 'bg-muted' }

const upsetStyle = u => ({ backgroundColor: `rgb(var(--${u.won ? 'good' : 'bad'}) / ${u.alpha})` })

function Tile({ g, teamHref }) {
  const upset = g.upset
  return (
    <li className="relative bg-bg border border-line rounded overflow-hidden min-w-[8.5rem] snap-start sm:min-w-0">
      <div className={`h-1 ${RESULT_TONE[g.result]}`} aria-hidden="true" />
      <div className="px-2.5 pt-1.5 pb-2">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted">
          <span className="font-semibold">{weekName(g.week)}</span>
          <span>{g.home ? 'Home' : 'Away'}</span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <TeamLogo abbr={g.opp.abbrName} size={26} />
          <Link to={teamHref(g.opp.abbrName)} className="text-sm font-semibold hover:text-accent truncate">
            {g.home ? 'vs' : '@'} {g.opp.abbrName}
          </Link>
        </div>
        <p className={`font-display font-extrabold text-2xl leading-none mt-1.5 num ${g.result === 'W' ? 'text-good' : g.result === 'L' ? 'text-bad' : ''}`}>
          {g.result} <span className="text-ink">{g.teamScore}–{g.oppScore}</span>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-x-1 mt-1.5 text-xs num">
          <span className="text-muted" title="Pregame win probability from Elo">{pct0(g.winProb)} win probability</span>
          <span className={`font-semibold ${g.eloChange >= 0 ? 'text-good' : 'text-bad'}`} title="Elo points gained or lost">{signed1(g.eloChange)} Elo</span>
        </div>
      </div>
      {upset && (
        <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide" style={upsetStyle(upset)}
          title={upset.won ? `Won as a ${pct0(upset.chance)} underdog` : `Lost as a ${pct0(upset.favChance)} favorite`}>
          {upset.label} {upset.won ? 'win' : 'loss'}
        </div>
      )}
    </li>
  )
}

function EloTip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="bg-bg border border-rule rounded-sm px-3 py-2 text-sm num">
      <p className="font-semibold">{p.title}</p>
      <p>Elo <span className="font-semibold">{p.elo.toFixed(0)}</span>{p.change != null && <span className="text-muted"> ({signed1(p.change)})</span>}</p>
    </div>
  )
}

function EloTrajectory({ games }) {
  const data = [
    { key: 'start', label: 'Start', title: 'Season start', elo: games[0].preElo, change: null },
    ...games.map(g => ({ key: String(g.week), label: shortWeekName(g.week), title: `${weekName(g.week)} · ${g.result} ${g.teamScore}–${g.oppScore} ${g.home ? 'vs' : '@'} ${g.opp.abbrName}`, elo: g.postElo, change: g.eloChange })),
  ]
  const elos = data.map(d => d.elo)
  const step = Math.max(...elos, 1500) - Math.min(...elos, 1500) > 200 ? 100 : 50
  const lo = Math.floor((Math.min(1500, ...elos) - 10) / step) * step
  const hi = Math.ceil((Math.max(1500, ...elos) + 10) / step) * step
  const ticks = Array.from({ length: (hi - lo) / step + 1 }, (_, i) => lo + i * step)
  const moved = data[data.length - 1].elo - data[0].elo
  const labels = Object.fromEntries(data.map(d => [d.key, d.label]))
  return (
    <figure className="mt-6">
      <figcaption className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-muted mb-2">
        <span className="font-semibold uppercase tracking-wide text-ink">Elo through the season</span>
        <span>{trajectoryCopy(moved)}</span>
      </figcaption>
      <div className="h-44" role="img" aria-label={`Elo after every game this season, from ${data[0].elo.toFixed(0)} to ${data[data.length - 1].elo.toFixed(0)}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--line))" />
            <XAxis dataKey="key" tickFormatter={k => labels[k]} tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} stroke="rgb(var(--line))" />
            <YAxis domain={[lo, hi]} ticks={ticks} allowDecimals={false} tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} stroke="rgb(var(--line))" />
            <ReferenceLine y={1500} stroke="rgb(var(--rule))" strokeOpacity={0.5} />
            <Tooltip content={<EloTip />} />
            <Line type="linear" dataKey="elo" stroke="var(--team-c)" strokeWidth={2.5} dot={{ r: 2.5, fill: 'var(--team-c)' }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

export default function SeasonArc({ games, spec, teamHref, loading }) {
  if (loading || !games.length) {
    return (
      <Section id="arc" kicker="Game by game" title="Season Arc">
        {loading ? <Loading /> : <Empty>No completed games this season yet.</Empty>}
      </Section>
    )
  }
  return (
    <Section
      id="arc"
      kicker="Game by game"
      title="Season Arc"
      summary={spec.description}
      actions={<ExportMenu spec={spec} />}
    >
      <ol className="flex overflow-x-auto snap-x gap-2 -mx-4 px-4 pb-1 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-9">
        {games.map(g => <Tile key={g.gameId ?? `${g.season}-${g.week}`} g={g} teamHref={teamHref} />)}
      </ol>
      <EloTrajectory games={games} />
    </Section>
  )
}
