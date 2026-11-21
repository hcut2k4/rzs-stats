export const n1 = v => v != null ? v.toFixed(1) : '—'
export const n2 = v => v != null ? v.toFixed(2) : '—'
export const signed2 = v => v != null ? (v > 0 ? '+' : '') + v.toFixed(2) : '—'

export const neonPlayerUrl = rosterId => `https://neonsportz.com/leagues/RZS/players/${rosterId}`

export const TANYA_BENCHMARK = 'BENCHMARK_TBD'
export const TANYA_TIP = `Total adjusted net yards per attempt, where an attempt is every dropback or carry. Touchdowns add 20 yards; interceptions and lost fumbles cost 45. Higher is better. ${TANYA_BENCHMARK}`
export const RUSHPLUS_TIP = "The value a QB's running adds over a 4-yards-per-carry baseline, on the same per-dropback scale as his passing stats. Positive means his running adds value."
