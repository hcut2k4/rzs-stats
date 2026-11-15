import { describe, it, expect } from 'vitest'
import { buildQbRows } from '../pages/QbPage'

const sampleRows = [
  {
    rosterId: '555223472', playerName: 'Max White', teamAbbr: 'MIA', teamName: 'Miami Dolphins',
    gamesPlayed: 4, tanya: 8.4123, passOnly: 8.1, deltaRush: 0.3123, anya: 7.9,
    passerRating: 151.92, passAtt: 26, passComp: 21, passYds: 285, passTd: 4, passInt: 0,
    tdPct: 0.1538, intPct: 0, tdToInt: null, passSacks: 3, sackYardsLost: 18.5, fumblesLost: 0.6667,
    rushAtt: 0, rushYds: 0, rushTd: 0, rushYdsPerAtt: null, qualified: true, rank: 1, rankChange: 2,
  },
  {
    rosterId: '555223913', playerName: 'Caleb Williams', teamAbbr: 'CHI', teamName: 'Chicago Bears',
    gamesPlayed: 4, tanya: 6.0, passOnly: 5.5, deltaRush: 0.5, anya: 5.4,
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

  it('formats TANY/A to two decimals and signs the rushing delta', () => {
    const [, first] = buildQbRows(sampleRows)
    const header = buildQbRows(sampleRows)[0]
    expect(first[header.indexOf('TANY/A')]).toBe('8.41')
    expect(first[header.indexOf('Drush')]).toBe('+0.31')
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

  it('falls back to row order when the server sends no rank', () => {
    const rows = buildQbRows([{ ...sampleRows[0], rank: null }])
    expect(rows[1][0]).toBe(1)
  })
})
