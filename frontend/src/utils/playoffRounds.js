const ROUNDS = { 18: 'Wild Card', 19: 'Divisional', 20: 'Conference', 22: 'Super Bowl' }

export function weekLabel(stage, weekIndex) {
  if (stage === 2) return ROUNDS[weekIndex] ?? `Playoffs Week ${weekIndex + 1}`
  return `Week ${weekIndex + 1}`
}

export const weekName = weekIndex => weekLabel(weekIndex >= 18 ? 2 : 1, weekIndex)

const ROUND_ABBR = { 18: 'WC', 19: 'DIV', 20: 'CONF', 22: 'SB' }

export const shortWeekName = weekIndex => (weekIndex >= 18 ? ROUND_ABBR[weekIndex] ?? `P${weekIndex - 17}` : `W${weekIndex + 1}`)
