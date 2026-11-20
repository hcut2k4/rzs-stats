import { describe, it, expect } from 'vitest'
import { pointLabel, chartNames, weekOptionLabel } from '../pages/QbPage'
import { neonPlayerUrl } from '../utils/qb'

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
    expect(pointLabel(0, 6, true)).toBe("S103 W7")
    expect(pointLabel(2, 22, true)).toBe("S105 SB")
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
