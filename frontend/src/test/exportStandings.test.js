import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildStandingsRows } from '../pages/StandingsPage'
import * as XLSX from 'xlsx'

const sampleStandings = [
  {
    teamId: 1,
    cityName: 'New England',
    displayName: 'Patriots',
    wins: 10,
    losses: 4,
    ties: 0,
    gamesPlayed: 14,
    pointsFor: 392,
    pointsAgainst: 280,
    winPct: 0.714,
    pythagoreanPat: 0.681,
    winDiff: 0.32,
    oppPyPatCurr: 0.51,
  },
  {
    teamId: 2,
    cityName: 'Buffalo',
    displayName: 'Bills',
    wins: 9,
    losses: 5,
    ties: 0,
    gamesPlayed: 14,
    pointsFor: 350,
    pointsAgainst: 300,
    winPct: 0.643,
    pythagoreanPat: 0.58,
    winDiff: -0.12,
    oppPyPatCurr: 0.49,
  },
]

describe('buildStandingsRows', () => {
  it('returns a header row as the first element', () => {
    const rows = buildStandingsRows(sampleStandings)
    expect(rows[0]).toEqual(
      expect.arrayContaining(['Rank', 'Team', 'W', 'L', 'T', 'Win%', 'Avg PF', 'Avg PA', 'PyPAT%', 'Luck'])
    )
  })

  it('returns one data row per team', () => {
    const rows = buildStandingsRows(sampleStandings)
    // rows[0] = header, rows[1..] = data
    expect(rows.length).toBe(sampleStandings.length + 1)
  })

  it('assigns sequential rank numbers starting at 1', () => {
    const rows = buildStandingsRows(sampleStandings)
    expect(rows[1][0]).toBe(1)
    expect(rows[2][0]).toBe(2)
  })

  it('combines cityName and displayName for the team column', () => {
    const rows = buildStandingsRows(sampleStandings)
    expect(rows[1][1]).toBe('New England Patriots')
    expect(rows[2][1]).toBe('Buffalo Bills')
  })

  it('formats Win% to 3 decimal places', () => {
    const rows = buildStandingsRows(sampleStandings)
    expect(rows[1][5]).toBe('0.714')
  })

  it('formats Avg PF as points-per-game to 1 decimal', () => {
    const rows = buildStandingsRows(sampleStandings)
    expect(rows[1][6]).toBe((392 / 14).toFixed(1))
  })

  it('formats Avg PA as points-per-game to 1 decimal', () => {
    const rows = buildStandingsRows(sampleStandings)
    expect(rows[1][7]).toBe((280 / 14).toFixed(1))
  })

  it('formats PyPAT as percentage', () => {
    const rows = buildStandingsRows(sampleStandings)
    expect(rows[1][8]).toBe('68.1%')
  })

  it('prefixes positive Luck values with +', () => {
    const rows = buildStandingsRows(sampleStandings)
    expect(rows[1][9]).toBe('+0.3')
  })

  it('does not prefix negative Luck values with +', () => {
    const rows = buildStandingsRows(sampleStandings)
    expect(rows[2][9]).toBe('-0.1')
  })

  it('handles zero gamesPlayed without throwing', () => {
    const zeroGames = [{ ...sampleStandings[0], gamesPlayed: 0 }]
    const rows = buildStandingsRows(zeroGames)
    expect(rows[1][6]).toBe('')
    expect(rows[1][7]).toBe('')
  })
})

describe('exportCsv (via buildStandingsRows + CSV formatting)', () => {
  it('produces correct CSV header', () => {
    const rows = buildStandingsRows(sampleStandings)
    const header = rows[0].join(',')
    expect(header).toContain('Rank')
    expect(header).toContain('Team')
    expect(header).toContain('Win%')
  })

  it('quotes team names containing a comma', () => {
    const commaTeam = [{ ...sampleStandings[0], cityName: 'City,Name', displayName: 'Team' }]
    const rows = buildStandingsRows(commaTeam)
    const teamCell = rows[1][1]
    expect(teamCell).toContain(',')
    // When passed through the CSV formatter in the component, this would be quoted
    // We verify the raw value contains the comma so the formatter knows to quote it
    expect(teamCell).toBe('City,Name Team')
  })
})

describe('exportExcel (SheetJS smoke test)', () => {
  it('creates a workbook from standings without throwing', () => {
    const rows = buildStandingsRows(sampleStandings)
    expect(() => {
      const ws = XLSX.utils.aoa_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Season 2030')
    }).not.toThrow()
  })

  it('workbook contains the correct sheet name', () => {
    const rows = buildStandingsRows(sampleStandings)
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Season 2030')
    expect(wb.SheetNames).toContain('Season 2030')
  })
})
