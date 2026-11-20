import { Link } from 'react-router-dom'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import Section, { Empty } from './Section'
import { teamLogoUrl } from '../../utils/teamLogo'
import { n2, signed } from '../../utils/efficiencyMetrics'

const Logo = ({ cx, cy, payload, logoSize, focus, ring }) => (
  cx == null ? null : (
    <g opacity={focus ? 1 : 0.28}>
      {focus && <circle cx={cx} cy={cy} r={logoSize / 2 + 5} fill="rgb(var(--bg))" stroke={ring} strokeWidth={3} />}
      <image href={teamLogoUrl(payload.abbr)} x={cx - logoSize / 2} y={cy - logoSize / 2} width={logoSize} height={logoSize} />
    </g>
  )
)

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null
  const t = payload[0].payload
  return (
    <div className="bg-bg border border-rule rounded-sm px-3 py-2 text-sm num">
      <p className="font-semibold">{t.name}</p>
      <p>Offense <span className="font-semibold">{n2(t.x)}</span> pts/drive</p>
      <p>Defense <span className="font-semibold">{n2(t.y)}</span> allowed</p>
      <p className="text-muted">Net {signed(t.x - t.y)}</p>
    </div>
  )
}

function scale(vals) {
  const lo = Math.floor((Math.min(...vals) - 0.1) * 2) / 2
  const hi = Math.ceil((Math.max(...vals) + 0.1) * 2) / 2
  const ticks = []
  for (let t = lo; t <= hi + 1e-9; t += 0.5) ticks.push(t)
  return { domain: [lo, hi], ticks }
}

export default function LeagueLandscape({ rows, teamId, seasonText }) {
  const points = rows
    .filter(r => r.offense.pointsPerDrive != null && r.defense.pointsPerDrive != null)
    .map(r => ({ id: r.teamId, x: r.offense.pointsPerDrive, y: r.defense.pointsPerDrive, abbr: r.abbrName, name: r.displayName }))
  const me = points.find(p => p.id === teamId)
  if (!me) {
    return (
      <Section id="landscape" kicker={seasonText} title="League Landscape">
        <Empty>No efficiency data for this team yet.</Empty>
      </Section>
    )
  }
  // Every point scored is a point allowed, so one league figure is both averages (same as the Efficiency page).
  const totals = rows.reduce((t, r) => (r.offense.pointsPerDrive == null ? t : { points: t.points + r.offense.pointsPerDrive * r.offense.drives, drives: t.drives + r.offense.drives }), { points: 0, drives: 0 })
  const league = totals.points / totals.drives
  const xs = scale(points.map(p => p.x))
  const ys = scale(points.map(p => p.y))
  const quadrant = `${me.x >= league ? 'Good' : 'Bad'} offense, ${me.y <= league ? 'good' : 'bad'} defense`
  const axis = { type: 'number', tick: { fill: 'rgb(var(--muted))', fontSize: 11 }, stroke: 'rgb(var(--line))', tickFormatter: v => v.toFixed(1) }
  return (
    <Section
      id="landscape"
      kicker={seasonText}
      title="League Landscape"
      summary={`${quadrant}: ${n2(me.x)} points per drive scored and ${n2(me.y)} allowed, against a league average of ${n2(league)}.`}
      actions={<Link to="/efficiency" className="text-xs text-muted hover:text-ink">Efficiency page →</Link>}
    >
      <div className="h-80 sm:h-96" role="img" aria-label={`Scatter of every team's offense against defense points per drive. ${me.name} is highlighted: ${quadrant.toLowerCase()}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 16, bottom: 22, left: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--line))" />
            <XAxis {...axis} dataKey="x" domain={xs.domain} ticks={xs.ticks} label={{ value: 'Offense pts/drive → better', position: 'insideBottom', offset: -12, fill: 'rgb(var(--muted))', fontSize: 11 }} />
            <YAxis {...axis} dataKey="y" domain={ys.domain} ticks={ys.ticks} reversed label={{ value: 'Defense pts/drive → better', angle: -90, position: 'insideLeft', offset: 16, fill: 'rgb(var(--muted))', fontSize: 11, style: { textAnchor: 'middle' } }} />
            <ReferenceLine x={league} stroke="rgb(var(--muted))" strokeDasharray="4 4" />
            <ReferenceLine y={league} stroke="rgb(var(--muted))" strokeDasharray="4 4" />
            <Tooltip content={<Tip />} cursor={false} />
            <Scatter data={points.filter(p => p.id !== teamId)} shape={<Logo logoSize={24} />} isAnimationActive={false} />
            <Scatter data={[me]} shape={<Logo logoSize={40} focus ring="var(--team-c)" />} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted mt-1">Up and to the right is better on both sides of the ball. Dashed lines mark the league average. Regular season.</p>
    </Section>
  )
}
