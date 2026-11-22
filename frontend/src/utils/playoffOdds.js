export function formatOdds(p, proven = false) {
  if (p == null || !Number.isFinite(p)) return '—'
  if (!proven && p >= 0.995) return '>99%'
  if (!proven && p < 0.005) return '<1%'
  return `${Math.round(p * 100)}%`
}

export const GOALS = [
  { value: 'playoffs', label: 'Playoffs' },
  { value: 'division', label: 'Division' },
  { value: 'oneSeed', label: 'No. 1 seed' },
]
export const LOSS = '234 88 12'
export const WIN = '37 99 235'
export const swingPoints = (row, goal) => (row.ifWin[goal] - row.ifLoss[goal]) * 100
