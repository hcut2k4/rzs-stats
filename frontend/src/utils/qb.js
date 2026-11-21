export const n1 = v => v != null ? v.toFixed(1) : '—'
export const n2 = v => v != null ? v.toFixed(2) : '—'
export const signed2 = v => v != null ? (v > 0 ? '+' : '') + v.toFixed(2) : '—'

export const neonPlayerUrl = rosterId => `https://neonsportz.com/leagues/RZS/players/${rosterId}`

export const TANYA_BENCHMARK = "An average starter is around 6. By the same formula, Peyton Manning's record 2013 season works out to 8.3 and Lamar Jackson's 2019 MVP season to 7.9."
export const TANYA_TIP = `Total adjusted net yards per attempt, where an attempt is every dropback or carry. Touchdowns add 20 yards; interceptions and lost fumbles cost 45. Higher is better. ${TANYA_BENCHMARK}`
export const RUSHPLUS_TIP = "The value a QB's running adds over a 4-yards-per-carry baseline, on the same per-dropback scale as his passing stats. Positive means his running adds value."

export const attemptMinimum = (scope, stage, minAtt) => minAtt != null && minAtt !== ''
  ? `${minAtt} attempts`
  : scope === 'week' ? '10 attempts' : scope === 'alltime' ? `${stage === 'playoffs' ? 50 : 250} attempts` : '10 attempts per team game'
