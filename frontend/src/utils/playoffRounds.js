const ROUNDS = { 18: 'Wild Card', 19: 'Divisional', 20: 'Conference', 22: 'Super Bowl' }

export function weekLabel(stage, weekIndex) {
  if (stage === 2) return ROUNDS[weekIndex] ?? `Playoffs Week ${weekIndex + 1}`
  return `Week ${weekIndex + 1}`
}
