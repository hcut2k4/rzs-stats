import { Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TeamLogo } from '../TeamLogo'
import ExportMenu from '../ExportMenu'
import Section, { Empty } from './Section'
import { pct0 } from '../../utils/eloLean'
import { weekName } from '../../utils/playoffRounds'
import { pointLabel } from '../../pages/QbPage'

const signed = v => (v > 0 ? '+' : '') + v.toFixed(1)
const shortWeek = w => pointLabel(null, w, false)
const RESULT_TONE = { W: 'bg-good', L: 'bg-bad', T: 'bg-muted' }

function Tile({ g, teamHref }) {
  const upset = g.upset
  return (
    <li className="relative bg-bg border border-line rounded overflow-hidden min-w-0">
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
        <div className="flex items-baseline justify-between mt-1.5 num">
          <span className={`font-display font-extrabold text-2xl leading-none ${g.result === 'W' ? 'text-good' : g.result === 'L' ? 'text-bad' : ''}`}>
            {g.result} <span className="text-ink">{g.teamScore}–{g.oppScore}</span>
          </span>
        </div>
        <div className="flex items-center justify-between mt-1.5 text-xs num">
          <span className="text-muted" title="Pregame win chance from Elo">{pct0(g.winProb)} pre</span>
          <span className={g.eloChange >= 0 ? 'text-good font-semibold' : 'text-bad font-semibold'} title="Elo points gained or lost">{signed(g.eloChange)}</span>
        </div>
      </div>
      {upset && (
        <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide" style={{ backgroundColor: upset.shade }}
          title={upset.won ? `Won as a ${pct0(upset.chance)} underdog` : `Lost as a ${pct0(upset.favChance)} favorite`}>
          {upset.won ? upset.label : `${upset.label} loss`}
        </div>
      )}
    </li>
  )
}

function ArcTip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="bg-bg border border-rule rounded-sm px-3 py-2 text-sm num">
      <p className="font-semibold">{weekName(p.week)} · {p.home ? 'vs' : '@'} {p.opp.abbrName} · {p.result} {p.teamScore}–{p.oppScore}</p>
      <p>Wins <span className="font-semibold">{p.cumWins}</span></p>
      <p className="text-muted">Elo expected {p.cumExpected.toFixed(1)}</p>
    </div>
  )
}

export default function SeasonArc({ games, spec, seasonText, teamHref }) {
  if (!games.length) {
    return (
      <Section id="arc" kicker={seasonText} title="Season Arc">
        <Empty>No completed games this season yet.</Empty>
      </Section>
    )
  }
  const upsetWins = games.filter(g => g.upset?.won).length
  const upsetLosses = games.filter(g => g.upset && !g.upset.won).length
  const regular = games.filter(g => !g.playoff)
  const last = regular[regular.length - 1]
  const parts = [
    upsetWins ? `${upsetWins} upset win${upsetWins > 1 ? 's' : ''}` : null,
    upsetLosses ? `${upsetLosses} upset loss${upsetLosses > 1 ? 'es' : ''}` : null,
  ].filter(Boolean)
  return (
    <Section
      id="arc"
      kicker={seasonText}
      title="Season Arc"
      summary={`Every game, with the pregame Elo win chance and the rating points it moved. ${parts.length ? `${parts.join(' and ')}.` : 'No upsets either way.'}`}
      actions={<ExportMenu spec={spec} />}
    >
      <ol className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-9 gap-2">
        {games.map(g => <Tile key={g.gameId ?? `${g.season}-${g.week}`} g={g} teamHref={teamHref} />)}
      </ol>
      {regular.length > 1 && (
        <figure className="mt-6">
          <figcaption className="flex items-center gap-4 flex-wrap text-xs text-muted mb-2">
            <span className="font-semibold uppercase tracking-wide text-ink">Wins vs Elo expectation</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5 bg-ink" /> Actual wins</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-accent" /> Elo expected wins</span>
            <span>
              {last.cumWins >= last.cumExpected ? 'Ahead' : 'Behind'} of expectation by {Math.abs(last.cumWins - last.cumExpected).toFixed(1)} wins.
            </span>
          </figcaption>
          <div className="h-56" role="img" aria-label={`Cumulative wins against Elo expected wins by week. ${last.cumWins} actual against ${last.cumExpected.toFixed(1)} expected.`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={regular} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--line))" />
                <XAxis dataKey="week" tickFormatter={shortWeek} tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} stroke="rgb(var(--line))" />
                <YAxis allowDecimals={false} tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} stroke="rgb(var(--line))" />
                <Tooltip content={<ArcTip />} />
                <Line type="monotone" dataKey="cumExpected" stroke="rgb(var(--accent))" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="cumWins" stroke="rgb(var(--ink))" strokeWidth={2.5} dot={{ r: 2.5, fill: 'rgb(var(--ink))' }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
      )}
    </Section>
  )
}
