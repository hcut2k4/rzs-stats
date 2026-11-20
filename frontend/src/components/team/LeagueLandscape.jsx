import ExportMenu from '../ExportMenu'
import { landscapeSpec } from './specs'
import { Link } from 'react-router-dom'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine, ResponsiveContainer } from 'recharts'
import QuadrantLabel from '../QuadrantLabel'
import Section, { Empty, Loading } from './Section'
import { teamLogoUrl } from '../../utils/teamLogo'
import { halfPointScale, leaguePointsPerDrive, n2, signed, tierPoints } from '../../utils/efficiencyMetrics'
import { quadrant } from '../../utils/teamProfile'

const Logo = ({ cx, cy, payload, logoSize, focus }) => (
  cx == null ? null : (
    <g opacity={focus ? 1 : 0.45} style={focus ? undefined : { filter: 'grayscale(1)' }}>
      {focus && <circle cx={cx} cy={cy} r={logoSize / 2 + 5} fill="rgb(var(--bg))" stroke="var(--team-c)" strokeWidth={3} />}
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

export default function LeagueLandscape({ rows, teamId, loading, season, team }) {
  const points = tierPoints(rows)
  const me = points.find(p => p.id === teamId)
  if (loading || !me) {
    return (
      <Section id="landscape" kicker="Points per drive" title="League Landscape">
        {loading ? <Loading /> : <Empty>No efficiency data for this team yet.</Empty>}
      </Section>
    )
  }
  const league = leaguePointsPerDrive(rows)
  const xs = halfPointScale(points.map(p => p.x))
  const ys = halfPointScale(points.map(p => p.y))
  const q = quadrant(me.x, me.y, league)
  const where = `${q.goodOffense ? 'Good' : 'Bad'} offense, ${q.goodDefense ? 'good' : 'bad'} defense`
  const axis = { type: 'number', tick: { fill: 'rgb(var(--muted))', fontSize: 11 }, stroke: 'rgb(var(--line))', tickFormatter: v => v.toFixed(1) }
  const area = (x1, x2, y1, y2, lines, right, bottom) => (
    <ReferenceArea x1={x1} x2={x2} y1={y1} y2={y2} fill="none" stroke="none" label={<QuadrantLabel lines={lines} right={right} bottom={bottom} />} />
  )
  return (
    <Section
      id="landscape"
      kicker="Points per drive"
      title="League Landscape"
      summary={`${where}: ${n2(me.x)} scored and ${n2(me.y)} allowed per drive, against a league average of ${n2(league)}.`}
      actions={<div className="flex items-center gap-3"><ExportMenu spec={landscapeSpec(rows, teamId, season, team)} /><Link to="/efficiency" className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-ink">Efficiency →</Link></div>}
    >
      <div className="h-80 sm:h-96" role="img" aria-label={`Scatter of every team's offense against defense points per drive. ${me.name} is highlighted: ${where.toLowerCase()}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 22, left: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--line))" />
            <XAxis {...axis} dataKey="x" domain={xs.domain} ticks={xs.ticks} label={{ value: 'Offense →', position: 'insideBottom', offset: -12, fill: 'rgb(var(--muted))', fontSize: 11 }} />
            <YAxis {...axis} dataKey="y" domain={ys.domain} ticks={ys.ticks} reversed width={36} label={{ value: 'Defense →', angle: -90, position: 'insideLeft', offset: 14, fill: 'rgb(var(--muted))', fontSize: 11, style: { textAnchor: 'middle' } }} />
            {area(xs.domain[0], league, ys.domain[0], league, ['Bad O', 'Good D'])}
            {area(league, xs.domain[1], ys.domain[0], league, ['Good O', 'Good D'], true)}
            {area(xs.domain[0], league, league, ys.domain[1], ['Bad O', 'Bad D'], false, true)}
            {area(league, xs.domain[1], league, ys.domain[1], ['Good O', 'Bad D'], true, true)}
            <ReferenceLine x={league} stroke="rgb(var(--muted))" strokeDasharray="4 4" />
            <ReferenceLine y={league} stroke="rgb(var(--muted))" strokeDasharray="4 4" />
            <Tooltip content={<Tip />} cursor={false} />
            <Scatter data={points.filter(p => p.id !== teamId)} shape={<Logo logoSize={22} />} isAnimationActive={false} />
            <Scatter data={[me]} shape={<Logo logoSize={36} focus />} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted mt-1">Up and right is better. Dashed lines mark the league average. Regular season.</p>
    </Section>
  )
}
