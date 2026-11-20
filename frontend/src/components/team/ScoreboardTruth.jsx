import { TRUTH_EXPLANATION } from '../../utils/teamProfileCopy'
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import InfoTip from '../InfoTip'
import ExportMenu from '../ExportMenu'
import Section, { Empty } from './Section'
import { shortWeekName, weekName } from '../../utils/playoffRounds'

const fmt = v => (Number.isInteger(v) ? String(v) : v.toFixed(1))

function ArcTip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="bg-bg border border-rule rounded-sm px-3 py-2 text-sm num">
      <p className="font-semibold">{weekName(p.week)} · {p.home ? 'vs' : '@'} {p.opp.abbrName} · {p.result} {p.teamScore}–{p.oppScore}</p>
      <p>Wins <span className="font-semibold">{p.cumWins}</span></p>
      <p className="text-muted">Elo expected wins {p.cumExpected.toFixed(1)}</p>
    </div>
  )
}

function CumulativeChart({ games }) {
  const last = games[games.length - 1]
  const gap = last.cumWins - last.cumExpected
  return (
    <figure className="mt-6">
      <figcaption className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-muted mb-2">
        <span className="font-semibold uppercase tracking-wide text-ink">Week by week</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5 bg-ink" /> Actual wins</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-accent" /> Elo expected wins</span>
        <span>{gap >= 0 ? 'Ahead of' : 'Behind'} Elo by {Math.abs(gap).toFixed(1)}</span>
      </figcaption>
      <div className="h-44" role="img" aria-label={`Cumulative wins against Elo expected wins by week: ${last.cumWins} actual against ${last.cumExpected.toFixed(1)} expected.`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={games} margin={{ top: 6, right: 8, bottom: 0, left: -22 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--line))" />
            <XAxis dataKey="week" tickFormatter={shortWeekName} tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} stroke="rgb(var(--line))" />
            <YAxis allowDecimals={false} tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} stroke="rgb(var(--line))" />
            <Tooltip content={<ArcTip />} />
            <Area type="linear" dataKey={g => [g.cumExpected, g.cumWins]} stroke="none" fill={gap >= 0 ? 'rgb(var(--good))' : 'rgb(var(--bad))'} fillOpacity={0.15} isAnimationActive={false} />
            <Line type="linear" dataKey="cumExpected" stroke="rgb(var(--accent))" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line type="linear" dataKey="cumWins" stroke="rgb(var(--ink))" strokeWidth={2.5} dot={{ r: 2.5, fill: 'rgb(var(--ink))' }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

export default function ScoreboardTruth({ lanes, games, arc, spec }) {
  if (!games) {
    return (
      <Section id="truth" kicker="Wins vs expectation" title="Truth Behind the Scoreboard">
        <Empty>No regular-season games played yet.</Empty>
      </Section>
    )
  }
  const actual = lanes[0].value
  const pos = v => `${Math.min(Math.max(v / games, 0), 1) * 100}%`
  return (
    <Section
      id="truth"
      kicker="Wins vs expectation"
      title="Truth Behind the Scoreboard"
      summary={spec.description}
      actions={<ExportMenu spec={spec} />}
    >
      <div className="relative pt-1">
        <div className="absolute top-0 bottom-6 border-l-2 border-dashed border-rule/60 pointer-events-none"
          style={{ left: `calc(7rem + (100% - 10rem) * ${Math.min(actual / games, 1)})` }} aria-hidden="true" />
        <ul className="space-y-3">
          {lanes.map(l => (
            <li key={l.key} className="grid grid-cols-[7rem_1fr_3rem] items-center">
              <span className="text-sm pr-2"><InfoTip text={l.tip}>{l.label}</InfoTip></span>
              <div className="relative h-6" aria-hidden="true">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-line" />
                <div className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full" style={{ left: 0, width: pos(l.value), background: l.color, opacity: 0.35 }} />
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-bg" style={{ left: pos(l.value), background: l.color }} />
              </div>
              <span className="text-right font-display font-extrabold text-2xl leading-none num">{fmt(l.value)}</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-[7rem_1fr_3rem] mt-1 text-[11px] text-muted num" aria-hidden="true">
          <span />
          <div className="flex justify-between"><span>0</span><span>{games} games</span></div>
        </div>
      </div>
      {arc.length > 1 && <CumulativeChart games={arc} />}
      <p className="text-xs text-muted mt-3">
        {TRUTH_EXPLANATION}
      </p>
    </Section>
  )
}
