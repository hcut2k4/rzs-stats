export const n1 = v => v != null ? v.toFixed(1) : '—'
export const n2 = v => v != null ? v.toFixed(2) : '—'
export const signed2 = v => v != null ? (v > 0 ? '+' : '') + v.toFixed(2) : '—'

export const neonPlayerUrl = rosterId => `https://neonsportz.com/leagues/RZS/players/${rosterId}`

export const TANYA_TIP = 'Total Adjusted Net Yards per Attempt: overall quarterback efficiency in adjusted yards per play. Higher means more productive passing and rushing after accounting for sacks and turnovers. (PassYds − SackYds + RushYds + 20×(PassTD + RushTD) − 45×(INT + FumblesLost)) ÷ (Att + Sacks + RushAtt). Rushing counts in both the numerator and the denominator, so volume alone does not inflate it.'
export const RUSHPLUS_TIP = 'The rushing contribution to overall quarterback efficiency; higher means more value from rushing. Adjusted QB rushing production above a baseline of 4 yards per carry, including rushing touchdowns and estimated lost fumbles, normalized per passing opportunity. All estimated QB fumbles lost are charged to rushing because passing and rushing fumbles cannot be distinguished.'
