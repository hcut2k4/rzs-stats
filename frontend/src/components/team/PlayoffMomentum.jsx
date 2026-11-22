import { weekLabel } from '../../utils/playoffRounds'

export const snapshotLabel = week => week == null ? 'Final' : weekLabel(1, week)

export default function PlayoffMomentum({ points }) {
  if (points.length < 2) return null
  const coords = points.map((s, i) => [12 + i / (points.length - 1) * 296, 108 - s.p * 78])
  const jump = points.slice(1).reduce((best, p, i) => {
    const change = p.p - points[i].p
    return Math.abs(change) > Math.abs(best.change) ? { index: i + 1, change } : best
  }, { index: 1, change: points[1].p - points[0].p })
  const [x, y] = coords[jump.index]
  const label = `Biggest weekly jump: ${jump.change >= 0 ? '+' : ''}${Math.round(jump.change * 100)} pp · ${snapshotLabel(points[jump.index].week)}`
  return <div>
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Momentum</h3>
    <svg className="w-full mt-1" viewBox="0 0 320 138" role="img" aria-label={`Playoff probability went from ${Math.round(points[0].p * 100)}% to ${Math.round(points.at(-1).p * 100)}% over ${points.length} snapshots. ${label}`}>
      <path d={`M${coords.map(p => p.join(',')).join(' L')} L308,112 L12,112 Z`} fill="var(--team-c)" fillOpacity="0.14" />
      <polyline points={coords.map(p => p.join(',')).join(' ')} fill="none" stroke="var(--team-c)" strokeWidth="2.5" />
      <circle cx={x} cy={y} r="4" fill="var(--team-c)" />
      <text x={Math.min(274, Math.max(46, x))} y={Math.max(16, y - 10)} textAnchor="middle" fill="currentColor" fontSize="12">{jump.change >= 0 ? '+' : ''}{Math.round(jump.change * 100)} pp</text>
      <text x="12" y="132" fill="currentColor" fontSize="11">{snapshotLabel(points[0].week)}</text>
      <text x="308" y="132" textAnchor="end" fill="currentColor" fontSize="11">{snapshotLabel(points.at(-1).week)}</text>
    </svg>
    <p className="text-xs text-muted mt-1">{label}</p>
  </div>
}
