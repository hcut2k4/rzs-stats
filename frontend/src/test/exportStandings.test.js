import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import StandingsPage from '../pages/StandingsPage'
import * as client from '../api/client'
import { buildWorkbook, csvText, toRows } from '../utils/exportTable'

vi.mock('../api/client')
const { specs } = vi.hoisted(() => ({ specs: new Map() }))
vi.mock('../components/ExportMenu', () => ({ default: ({ spec }) => { specs.set(spec.name, spec); return null } }))

const sampleStandings = [
  { teamId: 1, cityName: 'New England', displayName: 'Patriots', conference: 'AFC', wins: 10, losses: 4, ties: 0, gamesPlayed: 14, pointsFor: 392, pointsAgainst: 280, winPct: 0.714, pythagoreanPat: 0.681, winDiff: 0.8, oppPyPatCurr: 0.51, oppPyPatPrev: 0.52 },
  { teamId: 2, cityName: 'Buffalo', displayName: 'Bills', conference: 'NFC', wins: 9, losses: 5, ties: 0, gamesPlayed: 14, pointsFor: 350, pointsAgainst: 300, winPct: 0.643, pythagoreanPat: 0.58, winDiff: -0.12, oppPyPatCurr: 0.49, oppPyPatPrev: 0.48 },
]

beforeEach(() => {
  specs.clear()
  client.getSeasons.mockResolvedValue([4, 5])
  client.getStandings.mockResolvedValue(sampleStandings)
})
afterEach(() => vi.clearAllMocks())

async function show() {
  render(createElement(MemoryRouter, null, createElement(StandingsPage)))
  await waitFor(() => expect(specs.has('Standings')).toBe(true))
  return specs.get('Standings')
}

describe('Standings exports', () => {
  it('includes the table headers, one row per team and sequential ranks', async () => {
    const rows = toRows(await show())
    expect(rows[0]).toEqual(expect.arrayContaining(['#', 'Team', 'W', 'L', 'T', 'Win%', 'Avg PF', 'Avg PA', 'PyPAT', 'Luck', 'SoS Played', 'SoS Left', 'SoS Total']))
    expect(rows).toHaveLength(sampleStandings.length + 1)
    expect(rows.slice(1).map(r => r[0])).toEqual(['1', '2'])
  })

  it('exports full team names, three-decimal win rates, per-game scoring, percentages and signed Luck', async () => {
    const spec = await show()
    const rows = toRows(spec)
    expect(rows[1].slice(1, 10)).toEqual(['New England Patriots', '10', '4', '0', '0.714', '28.0', '20.0', '68.1%', '+0.8'])
    expect(rows[2][1]).toBe('Buffalo Bills')
    expect(rows[2][6]).toBe((350 / 14).toFixed(1))
    expect(rows[2][7]).toBe((300 / 14).toFixed(1))
    expect(rows[2][9]).toBe('-0.1')
    expect(csvText(spec).split('\n')[0]).toContain('#,Team,W,L,T,Win%')
  })

  it('leaves average scoring empty for teams without games', async () => {
    client.getStandings.mockResolvedValue([{ ...sampleStandings[0], gamesPlayed: 0 }])
    const spec = await show()
    expect(toRows(spec)[1].slice(6, 8)).toEqual(['', ''])
    expect(csvText(spec)).toContain('0.714,,,68.1%')
  })

  it('quotes commas in team names in the actual CSV', async () => {
    client.getStandings.mockResolvedValue([{ ...sampleStandings[0], cityName: 'City,Name', displayName: 'Team' }])
    const spec = await show()
    expect(toRows(spec)[1][1]).toBe('City,Name Team')
    expect(csvText(spec)).toContain('"City,Name Team"')
  })

  it('creates a typed workbook with the resolved season sheet name', async () => {
    const spec = await show()
    const wb = buildWorkbook(spec)
    expect(wb.SheetNames).toEqual(['Season 108'])
    expect(wb.Sheets['Season 108'].I2).toMatchObject({ t: 'n', v: 0.681, z: '0.0%' })
  })

  it('describes every column for the AI export', async () => {
    const spec = await show()
    expect(spec.cols.filter(c => !c.desc?.trim()).map(c => c.label)).toEqual([])
  })

  it('exports only the teams in each conference group', async () => {
    await show()
    fireEvent.click(screen.getByLabelText('Group by conference'))
    const afc = specs.get('Standings — AFC')
    const nfc = specs.get('Standings — NFC')
    expect(afc.rows.map(r => r.conference)).toEqual(['AFC'])
    expect(nfc.rows.map(r => r.conference)).toEqual(['NFC'])
    expect(toRows(afc)).toHaveLength(2)
    expect(csvText(afc)).not.toContain('Buffalo')
    expect(csvText(nfc)).not.toContain('New England')
  })

  it('describes the actual sort and SoS basis', async () => {
    await show()
    expect(specs.get('Standings').qualifier).toBe('Season 108 · 14 games played · sorted by PyPAT descending')
    fireEvent.click(screen.getByRole('columnheader', { name: 'Avg PF' }))
    expect(specs.get('Standings').qualifier).toContain('sorted by Avg PF descending')
    fireEvent.click(screen.getByRole('columnheader', { name: 'Avg PF ▼' }))
    expect(specs.get('Standings').qualifier).toContain('sorted by Avg PF ascending')
    expect(specs.get('Standings').api.note).toContain('previous season')
    fireEvent.click(screen.getByRole('button', { name: 'This season' }))
    const spec = specs.get('Standings')
    expect(spec.api.note).toContain('current season')
    expect(spec.cols.find(c => c.label === 'SoS Played').desc).toContain('current season')
    expect(spec.api.fields['SoS Played']).toContain('oppPyPatCurr')
  })

  it('keeps export provenance with the response and ignores stale seasons', async () => {
    let resolveOld
    client.getStandings.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce([sampleStandings[1]])
    render(createElement(MemoryRouter, null, createElement(StandingsPage)))
    await waitFor(() => expect(screen.getByLabelText('Season').value).toBe('5'))
    fireEvent.change(screen.getByLabelText('Season'), { target: { value: '4' } })
    await waitFor(() => expect(specs.get('Standings')?.api.params.season).toBe(4))
    await act(async () => resolveOld([sampleStandings[0]]))
    const spec = specs.get('Standings')
    expect(spec.api.params.season).toBe(4)
    expect(spec.qualifier).toContain('Season 107')
    expect(spec.rows).toEqual([sampleStandings[1]])
  })
})
