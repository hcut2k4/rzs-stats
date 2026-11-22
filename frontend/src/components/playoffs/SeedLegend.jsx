import { SEED_COLORS } from '../../utils/playoffOdds'

export default function SeedLegend() {
  const swatches = seeds => seeds.map(seed => <span key={seed} className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: SEED_COLORS[seed - 1] }} aria-hidden="true" />{seed}</span>)
  return <div className="flex flex-wrap items-center gap-2 text-xs text-muted my-2" aria-label="Seed colours">
    <span>Division winners</span>{swatches([1, 2, 3, 4])}<span>·</span><span>Wild cards</span>{swatches([5, 6, 7])}
  </div>
}
