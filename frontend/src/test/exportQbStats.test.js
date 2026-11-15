import { describe, it, expect } from 'vitest'
import { buildQbRows, pointLabel, chartNames, weekOptionLabel, neonPlayerUrl } from '../pages/QbPage'

const sampleRows = [
  {
    rosterId: '555223472', playerName: 'Max White', teamAbbr: 'MIA', teamName: 'Miami Dolphins',
    gamesPlayed: 4, tanya: 8.4123, rushValue: -2.25, anya: 7.9,
    passerRating: 151.92, passAtt: 26, passComp: 21, passYds: 285, passTd: 4, passInt: 0,
    tdPct: 0.1538, intPct: 0, tdToInt: null, passSacks: 3, sackYardsLost: 18.5, fumblesLost: 0.6667,
    rushAtt: 0, rushYds: 0, rushTd: 0, rushYdsPerAtt: null, qualified: true, rank: 1, rankChange: 2,
  },
  {
    rosterId: '555223913', playerName: 'Caleb Williams', teamAbbr: 'CHI', teamName: 'Chicago Bears',
    gamesPlayed: 4, tanya: 6.0, rushValue: 1.2345, anya: 5.4,
    passerRating: 92.1, passAtt: 120, passComp: 70, passYds: 880, passTd: 6, passInt: 3,
    tdPct: 0.05, intPct: 0.025, tdToInt: 2.0, passSacks: 8, sackYardsLost: 52.0, fumblesLost: 1.25,
    rushAtt: 30, rushYds: 190, rushTd: 2, rushYdsPerAtt: 6.33, qualified: true, rank: 2, rankChange: null,
  },
]

describe('buildQbRows', () => {
  it('puts a header row first and one row per quarterback', () => {
    const rows = buildQbRows(sampleRows)
    expect(rows).toHaveLength(3)
    expect(rows[0][0]).toBe('Rank')
    expect(rows[1][1]).toBe('Max White')
    expect(rows[2][1]).toBe('Caleb Williams')
  })

  it('formats TANY/A to two decimals and signs RUSH+ both ways', () => {
    const header = buildQbRows(sampleRows)[0]
    const [, first, second] = buildQbRows(sampleRows)
    expect(first[header.indexOf('TANY/A')]).toBe('8.41')
    expect(first[header.indexOf('RUSH+')]).toBe('-2.25')
    expect(second[header.indexOf('RUSH+')]).toBe('+1.23')
  })

  it('writes n/a for a TD:INT ratio with no interceptions', () => {
    const header = buildQbRows(sampleRows)[0]
    const [, first, second] = buildQbRows(sampleRows)
    expect(first[header.indexOf('TD:INT')]).toBe('n/a')
    expect(second[header.indexOf('TD:INT')]).toBe('2.0')
  })

  it('keeps estimated sack yards and fumbles lost to one decimal', () => {
    const header = buildQbRows(sampleRows)[0]
    const [, first] = buildQbRows(sampleRows)
    expect(first[header.indexOf('Est Sack Yds')]).toBe('18.5')
    expect(first[header.indexOf('Est Fumbles Lost')]).toBe('0.7')
  })

  it('leaves the rank blank rather than inventing one for an unqualified quarterback', () => {
    const rows = buildQbRows([{ ...sampleRows[0], rank: null, qualified: false }])
    expect(rows[1][0]).toBe('')
  })
})

describe('pointLabel', () => {
  it('numbers regular season weeks from one', () => {
    expect(pointLabel(2, 0, false)).toBe('W1')
    expect(pointLabel(2, 17, false)).toBe('W18')
  })

  it('names playoff rounds instead of numbering them', () => {
    expect(pointLabel(1, 18, false)).toBe('WC')
    expect(pointLabel(1, 19, false)).toBe('DIV')
    expect(pointLabel(1, 20, false)).toBe('CONF')
    expect(pointLabel(1, 22, false)).toBe('SB')
  })

  it('prefixes the season when the timeline spans more than one', () => {
    expect(pointLabel(0, 6, true)).toBe("'26 W7")
    expect(pointLabel(2, 22, true)).toBe("'28 SB")
  })
})

describe('chartNames', () => {
  const s = names => names.map((playerName, i) => ({ rosterId: String(i), playerName }))

  it('shows last name only and sorts alphabetically by it', () => {
    const out = chartNames(s(['Josh Allen', 'Patrick Mahomes', 'Joe Burrow']))
    expect(out.map(p => p.label)).toEqual(['Allen', 'Burrow', 'Mahomes'])
  })

  it('adds a first initial only when a last name is shared, ordered by first name', () => {
    const out = chartNames(s(['C.J. Williams', 'Bryce Young', 'Brock Williams']))
    expect(out.map(p => p.label)).toEqual(['B. Williams', 'C. Williams', 'Young'])
  })

  it('keeps shared last names sorted among everyone else by last name', () => {
    const out = chartNames(s(['Caleb Williams', 'Josh Allen', 'Bryce Williams', 'Joe Burrow']))
    expect(out.map(p => p.label)).toEqual(['Allen', 'Burrow', 'B. Williams', 'C. Williams'])
  })

  it('ignores generational suffixes when taking the last name', () => {
    const out = chartNames(s(['Anthony Richardson Sr', 'Michael Penix Jr']))
    expect(out.map(p => p.label)).toEqual(['Penix', 'Richardson'])
  })

  it('falls back to a single-token name', () => {
    expect(chartNames(s(['Pele'])).map(p => p.label)).toEqual(['Pele'])
  })
})

describe('weekOptionLabel', () => {
  it('numbers regular season weeks from one', () => {
    expect(weekOptionLabel(0)).toBe('Week 1')
    expect(weekOptionLabel(17)).toBe('Week 18')
  })

  it('names playoff rounds so they are selectable by round', () => {
    expect(weekOptionLabel(18)).toBe('Wild Card')
    expect(weekOptionLabel(19)).toBe('Divisional')
    expect(weekOptionLabel(20)).toBe('Conference')
    expect(weekOptionLabel(22)).toBe('Super Bowl')
  })
})

describe('neonPlayerUrl', () => {
  it('builds the NeonSportz player page url from a roster id', () => {
    expect(neonPlayerUrl('555223472')).toBe('https://neonsportz.com/leagues/RZS/players/555223472')
  })
})
