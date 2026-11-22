import { formatOdds, SEED_COLORS } from '../../utils/playoffOdds'

export function SeedBar({ seedOdds, size = 112 }) {
  const label = seedOdds.map((p, i) => `Seed ${i + 1}: ${formatOdds(p)}`).join(', ')
  return <div className="flex h-3 bg-line overflow-hidden rounded" style={{ width: size }} role="img" title={label} aria-label={label}>
    {seedOdds.map((p, i) => <span key={i} title={`Seed ${i + 1}: ${formatOdds(p)}`} style={{ width: `${p * 100}%`, background: SEED_COLORS[i], ...(i === 4 && p > 0 ? { borderLeftWidth: 2, borderLeftStyle: 'solid', borderLeftColor: 'rgb(var(--bg))' } : {}) }} />)}
  </div>
}
