import { goodBadColor, tint } from './heat'

export const SEED_COLORS = ['#2453ad', '#2874b5', '#14999b', '#097c6c', '#dfa32b', '#cf7025', '#b33232']

export const probShade = p => goodBadColor(p, [0, 1])
export const chanceShade = p => p == null || !Number.isFinite(p) || p <= 0 ? undefined : tint('22 163 74', Math.min(p, 1))
export const swingShade = points => points == null || !Number.isFinite(points) || points === 0 ? undefined : tint('37 99 235', Math.min(Math.abs(points) / 60, 1))

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

export function formatComputed(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const text = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(date)
  return `${text} ET`
}
