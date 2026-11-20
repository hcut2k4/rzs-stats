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
    off: 'Points the offense scored per play (pass attempts, rushes and sacks taken). The closest stand-in we have for EPA per play. Higher is better.',
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
    off: 'Red-zone trips that ended in a touchdown. Higher is better.',
    def: 'Opposing red-zone trips that ended in a touchdown. Lower is better.',
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
