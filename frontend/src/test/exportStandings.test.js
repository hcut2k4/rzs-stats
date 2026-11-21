import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import StandingsPage from '../pages/StandingsPage'
import * as client from '../api/client'
import { clearLoadCache } from '../utils/useLoad'
import { buildWorkbook, csvText, toRows } from '../utils/exportTable'

vi.mock('../api/client')

const { specs } = vi.hoisted(() => ({ specs: new Map() }))
vi.mock('../components/ExportMenu', () => ({ default: ({ spec }) => { specs.set(spec.name, spec); return null } }))

const sampleStandings = [
  { teamId: 1, cityName: 'New England', displayName: 'Patriots', conference: 'AFC', wins: 10, losses: 4, ties: 0, gamesPlayed: 14, pointsFor: 392, pointsAgainst: 280, winPct: 0.714, pythagoreanPat: 0.681, winDiff: 0.8, oppPyPatCurr: 0.51, oppPyPatPrev: 0.52 },
  { teamId: 2, cityName: 'Buffalo', displayName: 'Bills', conference: 'NFC', wins: 9, losses: 5, ties: 0, gamesPlayed: 14, pointsFor: 350, pointsAgainst: 300, winPct: 0.643, pythagoreanPat: 0.58, winDiff: -0.12, oppPyPatCurr: 0.49, oppPyPatPrev: 0.48 },
]

beforeEach(() => {
  clearLoadCache()
  client.getAvailableWeeks.mockResolvedValue([])
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
    expect(rows[0]).toEqual(expect.arrayContaining(['#', 'Team', 'W', 'L', 'T', 'Win%', 'Pts/G', 'Opp Pts/G', 'PyPAT', 'Luck', "SoS Played (last season's results)", "SoS Left (last season's results)", "SoS Total (last season's results)"]))
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
    fireEvent.click(screen.getByRole('columnheader', { name: 'Pts/G' }))
    expect(specs.get('Standings').qualifier).toContain('sorted by Pts/G descending')
    fireEvent.click(screen.getByRole('columnheader', { name: 'Pts/G ▼' }))
    expect(specs.get('Standings').qualifier).toContain('sorted by Pts/G ascending')
    expect(specs.get('Standings').api.note).toContain("last season's results")
    fireEvent.click(screen.getByRole('button', { name: 'This season' }))
    const spec = specs.get('Standings')
    expect(spec.api.note).toContain("this season's results")
    expect(spec.cols.find(c => c.label === "SoS Played (this season's results)").desc).toContain("this season's results")
    expect(spec.api.fields["SoS Played (this season's results)"]).toContain('oppPyPatCurr')
  })

  it.each([[8, "last season's results", 'Prev', '52.0%'], [9, "this season's results", 'Curr', '42.0%'], [17, "this season's results", 'Curr', '42.0%']])(
    'uses one source for Played, Left and Total at completed week index %s', async (week, source, variant, value) => {
      client.getAvailableWeeks.mockResolvedValue(Array.from({ length: week + 1 }, (_, i) => i))
      client.getStandings.mockResolvedValue([{
        ...sampleStandings[0], oppPyPatCurr: 0.41, oppPyPatPrev: 0.51,
        oppPyPatRemainingCurr: 0.42, oppPyPatRemainingPrev: 0.52,
        oppPyPatTotalCurr: 0.43, oppPyPatTotalPrev: 0.53,
      }])
      await show()
      await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Left' })).toHaveAttribute('title', expect.stringContaining(source)))
      const spec = specs.get('Standings')
      const label = `SoS Left (${source})`
      expect(spec.api.fields[label]).toContain(`oppPyPatRemaining${variant}`)
      expect(spec.cols.find(c => c.label === label).desc).toContain(source)
      expect(toRows(spec)[1].slice(-3)).toEqual(variant === 'Curr' ? ['41.0%', value, '43.0%'] : ['51.0%', value, '53.0%'])
      expect(client.getAvailableWeeks).toHaveBeenCalledWith(5, 1)
      fireEvent.click(screen.getByRole('button', { name: variant === 'Curr' ? 'Last season' : 'This season' }))
      expect(toRows(specs.get('Standings'))[1].slice(-3)).toEqual(variant === 'Curr' ? ['51.0%', '52.0%', '53.0%'] : ['41.0%', '42.0%', '43.0%'])
    }
  )

  it.each([['Played', 'oppPyPat'], ['Left', 'oppPyPatRemaining'], ['Total', 'oppPyPatTotal']])('keeps %s sorting on displayed values when Week 10 completed weeks arrive', async (label, field) => {
    let resolveWeeks
    client.getAvailableWeeks.mockReturnValue(new Promise(resolve => { resolveWeeks = resolve }))
    client.getStandings.mockResolvedValue([
      { ...sampleStandings[0], [`${field}Prev`]: 0.7, [`${field}Curr`]: 0.3 },
      { ...sampleStandings[1], [`${field}Prev`]: 0.3, [`${field}Curr`]: 0.7 },
    ])
    await show()
    fireEvent.click(screen.getByRole('columnheader', { name: label }))
    expect(specs.get('Standings').rows.map(r => r.teamId)).toEqual([1, 2])

    await act(async () => resolveWeeks([9]))

    const spec = specs.get('Standings')
    expect(spec.rows.map(r => r.teamId)).toEqual([2, 1])
    const rows = screen.getAllByRole('row').slice(2)
    expect(rows.map(r => within(r).getAllByRole('cell')[1].textContent)).toEqual(['Buffalo Bills', 'New England Patriots'])
    expect(rows.map(r => within(r).getAllByRole('cell').at(label === 'Played' ? -3 : label === 'Left' ? -2 : -1).textContent)).toEqual(['70.0%', '30.0%'])
    expect(screen.getByRole('columnheader', { name: `${label} ▼` })).toHaveAttribute('title', expect.stringContaining("this season's results"))
    expect(spec.qualifier).toContain(`sorted by ${label} descending`)
    expect(spec.api.note).toContain(`sorted by ${field}Curr descending`)
  })

  it.each([
    ['Played', 'oppPyPat'], ['Left', 'oppPyPatRemaining'], ['Total', 'oppPyPatTotal'],
  ])('keeps %s sorting on the displayed values when the SoS mode changes', async (label, field) => {
    client.getStandings.mockResolvedValue([
      { ...sampleStandings[0], [`${field}Prev`]: 0.7, [`${field}Curr`]: 0.3 },
      { ...sampleStandings[1], [`${field}Prev`]: 0.3, [`${field}Curr`]: 0.7 },
    ])
    await show()
    fireEvent.click(screen.getByRole('columnheader', { name: label }))
    expect(specs.get('Standings').rows.map(r => r.teamId)).toEqual([1, 2])

    fireEvent.click(screen.getByRole('button', { name: 'This season' }))

    const spec = specs.get('Standings')
    expect(spec.rows.map(r => r.teamId)).toEqual([2, 1])
    expect(screen.getByRole('columnheader', { name: `${label} ▼` })).toBeInTheDocument()
    expect(spec.qualifier).toContain(`sorted by ${label} descending`)
    expect(spec.api.note).toContain(`sorted by ${field}Curr descending`)

    fireEvent.click(screen.getByRole('columnheader', { name: `${label} ▼` }))
    expect(specs.get('Standings').rows.map(r => r.teamId)).toEqual([1, 2])
    expect(screen.getByRole('columnheader', { name: `${label} ▲` })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Last season' }))
    expect(specs.get('Standings').rows.map(r => r.teamId)).toEqual([2, 1])
    expect(specs.get('Standings').qualifier).toContain(`sorted by ${label} ascending`)
  })

  it("leaves all null this season's results SoS values empty instead of using last season's results quality", async () => {
    client.getAvailableWeeks.mockResolvedValue([9])
    client.getStandings.mockResolvedValue([{ ...sampleStandings[0], oppPyPatCurr: null, oppPyPatTotalCurr: null, oppPyPatRemainingCurr: null, oppPyPatRemainingPrev: 0.52 }])
    await show()
    await waitFor(() => expect(specs.get('Standings')?.api.fields["SoS Left (this season's results)"]).toContain('oppPyPatRemainingCurr'))
    expect(toRows(specs.get('Standings'))[1].slice(-3)).toEqual(['', '', ''])
  })

  it("keeps a manual last season's results choice when Week 10 weeks arrive", async () => {
    let resolveWeeks
    client.getAvailableWeeks.mockReturnValue(new Promise(resolve => { resolveWeeks = resolve }))
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Last season' }))
    await act(async () => resolveWeeks([9]))
    const spec = specs.get('Standings')
    for (const label of ['Played', 'Left', 'Total']) {
      expect(spec.api.fields[`SoS ${label} (last season's results)`]).toContain('Prev')
    }
    expect(screen.getByRole('button', { name: 'Last season' })).toHaveClass('bg-ink')
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
