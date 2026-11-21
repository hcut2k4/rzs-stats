export const DASH = '—'
export const n2 = v => (v == null ? DASH : v.toFixed(2))
export const pct = v => (v == null ? DASH : (v * 100).toFixed(1) + '%')
export const signed = v => (v == null ? DASH : (v > 0 ? '+' : '') + v.toFixed(2))
export const perGame = (v, g) => (g ? (v / g).toFixed(1) : DASH)

export const METRICS = [
  {
    key: 'pointsPerDrive', label: 'Pts/Drive', fmt: n2, better: 'higher',
    off: 'Points the offense scored per drive. Only the offense\'s own points count: touchdowns, field goals and the extra points that followed its touchdowns. Higher is better. Drives are estimated, see About.',
    def: 'Points opposing offenses scored per drive against this defense. Defensive and return touchdowns are not charged to it. Lower is better.',
  },
  {
    key: 'pointsPerPlay', label: 'Pts/Play', fmt: n2, better: 'higher',
    off: 'Points scored per offensive play (passes, runs and sacks). Measures scoring efficiency per play rather than per drive. Higher is better.',
    def: 'Points opposing offenses scored per play against this defense. Lower is better.',
  },
  {
    key: 'yardsPerPlay', label: 'Yds/Play', fmt: n2, better: 'higher',
    off: 'Net yards gained per play. Higher is better.',
    def: 'Net yards opposing offenses gained per play. Lower is better.',
  },
  {
    key: 'seriesRate', label: 'Series %', fmt: pct, better: 'higher',
    off: 'Share of series that kept the chains moving or scored. Every first down and every drive\'s final series counts as a series; first downs and touchdowns are the successes. Higher is better.',
    def: 'Share of opposing series that kept the chains moving or scored. Lower is better.',
  },
  {
    key: 'thirdDownRate', label: '3rd %', fmt: pct, better: 'higher',
    off: 'Third downs converted divided by third downs attempted. Higher is better.',
    def: 'Third downs opponents converted against this defense. Lower is better.',
  },
  {
    key: 'redZoneTdRate', label: 'RZ TD %', fmt: pct, better: 'higher',
    off: 'Red-zone trips (inside the 20) that ended in a touchdown. Higher is better.',
    def: 'Opposing red-zone trips (inside the 20) that ended in a touchdown. Lower is better.',
  },
  {
    key: 'giveawayRate', label: 'TO/Drive', fmt: n2, better: 'lower',
    off: 'Interceptions plus lost fumbles per drive. Lower is better.',
    def: 'Takeaways per opposing drive: interceptions plus fumbles recovered by this defense. Higher is better.',
  },
  {
    key: 'sackRate', label: 'Sack %', fmt: pct, better: 'lower',
    off: 'Share of dropbacks that ended in a sack taken. Lower is better.',
    def: 'Share of opposing dropbacks this defense sacked. Higher is better.',
  },
]

export function tierPoints(rows) {
  return rows
    .filter(r => r.offense.pointsPerDrive != null && r.defense.pointsPerDrive != null)
    .map(r => ({ id: r.teamId, x: r.offense.pointsPerDrive, y: r.defense.pointsPerDrive, abbr: r.abbrName, name: r.displayName }))
}

// Every point scored is a point allowed, so one league figure (total points over total drives) is both the offense and the defense average.
export function leaguePointsPerDrive(rows) {
  const totals = rows.reduce((t, r) => (r.offense.pointsPerDrive == null ? t : { points: t.points + r.offense.pointsPerDrive * r.offense.drives, drives: t.drives + r.offense.drives }), { points: 0, drives: 0 })
  return totals.points / totals.drives
}

export function halfPointScale(vals) {
  const lo = Math.floor((Math.min(...vals) - 0.1) * 2) / 2
  const hi = Math.ceil((Math.max(...vals) + 0.1) * 2) / 2
  const ticks = []
  for (let t = lo; t <= hi + 1e-9; t += 0.5) ticks.push(t)
  return { domain: [lo, hi], ticks }
}
