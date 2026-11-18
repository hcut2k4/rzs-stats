import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import EfficiencyPage from '../pages/EfficiencyPage'
import * as client from '../api/client'
import { aiText, buildWorkbook, csvText, toRows } from '../utils/exportTable'
import { divergeColor } from '../utils/heat'

vi.mock('../api/client')
const { specs } = vi.hoisted(() => ({ specs: new Map() }))
vi.mock('../components/ExportMenu', () => ({ default: ({ spec }) => { specs.set(spec.name, spec); return null } }))
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
const side = (pointsPerDrive, extra = {}) => ({ drives: 20, plays: 100, pointsPerDrive, pointsPerPlay: 0.5, yardsPerPlay: 5, seriesRate: 0.7, thirdDownRate: 0.4, redZoneTdRate: 0.6, giveawayRate: 0.1, sackRate: 0.05, ...extra })
const teams = [
  { teamId: 1, displayName: 'Aces', abbrName: 'ACE', games: 2, offense: side(3), defense: side(1, { giveawayRate: 0.3, sackRate: 0.1 }), netPointsPerDrive: 2 },
  { teamId: 2, displayName: 'Wolves', abbrName: 'WOL', games: 2, offense: side(1), defense: side(3, { giveawayRate: 0.05, sackRate: 0.01 }), netPointsPerDrive: -2 },
]
const headers = ['Team', 'G', 'Drives/G', 'Plays/G', 'Pts/Drive', 'Pts/Play', 'Yds/Play', 'Series %', '3rd %', 'RZ TD %', 'TO/Drive', 'Sack %']
beforeEach(() => { vi.resetAllMocks(); specs.clear(); client.getSeasons.mockResolvedValue([6, 7]); client.getEfficiency.mockResolvedValue(teams) })
async function show(tab = 'Overview') {
  render(<MemoryRouter initialEntries={[`/efficiency?tab=${tab.toLowerCase()}`]}><EfficiencyPage /></MemoryRouter>)
  await waitFor(() => expect(specs.has(`Efficiency ${tab}`)).toBe(true))
  return specs.get(`Efficiency ${tab}`)
}

describe('Efficiency exports', () => {
  it.each(['Overview', 'Offense', 'Defense'])('exports %s headers, definitions, notes and exact API provenance', async tab => {
    const spec = await show(tab)
    expect(toRows(spec)[0]).toEqual(tab === 'Overview' ? ['#', 'Team', 'G', 'Net Pts/Drive', 'Off Pts/Drive', 'Def Pts/Drive', 'Off Pts/Play', 'Def Pts/Play'] : headers)
    expect(spec.cols.every(c => c.desc?.trim())).toBe(true)
    expect(spec.api).toMatchObject({ path: '/efficiency', params: { season: 7, stage: 'regular' } })
    expect(spec.qualifier).toContain(`Season 110 · Regular · 2 games played · ${tab} · sorted by`)
    const blob = aiText(spec, 'https://example.com')
    expect(blob).toContain('never averages of per-game rates. Do not average the column.')
    expect(blob).toContain('zero denominator is null/empty, not 0')
    expect(spec.notes).toHaveLength(6)
    expect(blob).toContain('GET https://example.com/api/efficiency?season=7&stage=regular')
    if (tab !== 'Overview') {
      const sheet = buildWorkbook(spec).Sheets['Season 110']
      expect(sheet.B2).toMatchObject({ t: 'n', v: 2, z: '0' })
      expect(sheet.E2).toMatchObject({ t: 'n', v: tab === 'Offense' ? 3 : 1, z: '0.00' })
      expect(sheet.H2).toMatchObject({ t: 'n', v: 0.7, z: '0.0%' })
      expect(toRows(spec)[1].slice(1, 5)).toEqual(['2', '10.0', '50.0', tab === 'Offense' ? '3.00' : '1.00'])
      expect(spec.api.fields['Pts/Drive']).toBe(`${tab.toLowerCase()}.pointsPerDrive`)
    }
  })
  it('keeps displayed ranks and net heat when the Overview sort changes', async () => {
    const spec = await show()
    expect(toRows(spec)[1]).toEqual(['1', 'Aces', '2', '+2.00', '3.00', '1.00', '0.50', '0.50'])
    expect(spec.cols[3].color(teams[0])).toBe(divergeColor(2, 2))
    expect(spec.api.fields['Net Pts/Drive']).toBe('netPointsPerDrive')
    fireEvent.click(screen.getByRole('columnheader', { name: /Team/ }))
    expect(specs.get('Efficiency Overview').qualifier).toContain('sorted by Team descending')
    expect(toRows(specs.get('Efficiency Overview')).slice(1).map(r => r.slice(0, 2))).toEqual([['2', 'Wolves'], ['1', 'Aces']])
    fireEvent.click(screen.getByRole('columnheader', { name: /Team/ }))
    expect(specs.get('Efficiency Overview').qualifier).toContain('sorted by Team ascending')
  })
  it('uses defense descriptions and rewards lower scoring but higher takeaways and sacks', async () => {
    const spec = await show('Defense')
    expect(spec.cols.find(c => c.label === 'Pts/Drive').desc).toContain('Points opposing offenses scored per drive against this defense')
    expect(spec.cols.find(c => c.label === '3rd %').desc).toContain('opponents')
    for (const label of ['Pts/Drive', 'TO/Drive', 'Sack %']) {
      const col = spec.cols.find(c => c.label === label)
      expect(col.color(teams[0])).toBe('rgb(22 163 74 / 0.420)')
      expect(col.color(teams[1])).toBe('rgb(220 38 38 / 0.420)')
    }
  })
  it.each(['Overview', 'Offense', 'Defense'])('exports null rates empty in %s CSV and workbook', async tab => {
    const nullSide = Object.fromEntries(Object.keys(teams[0].offense).map(k => [k, ['drives', 'plays'].includes(k) ? 0 : null]))
    client.getEfficiency.mockResolvedValue([{ ...teams[0], offense: nullSide, defense: nullSide, netPointsPerDrive: null }])
    const spec = await show(tab)
    expect(toRows(spec)[1].slice(tab === 'Overview' ? 3 : 4).every(v => v === '')).toBe(true)
    expect(csvText(spec)).not.toContain('—')
    expect(buildWorkbook(spec).Sheets['Season 110'][tab === 'Overview' ? 'D2' : 'E2']).toMatchObject({ t: 's', v: '' })
  })
  it('describes the actual side sort', async () => {
    await show('Offense')
    fireEvent.click(screen.getByRole('columnheader', { name: /Yds\/Play/ }))
    expect(specs.get('Efficiency Offense').qualifier).toContain('sorted by Yds/Play descending')
  })
  it('keeps rows and params together after out-of-order season and stage responses', async () => {
    let resolveSeason, resolveStage
    client.getEfficiency.mockReturnValueOnce(new Promise(resolve => { resolveSeason = resolve })).mockReturnValueOnce(new Promise(resolve => { resolveStage = resolve })).mockResolvedValueOnce([teams[1]])
    render(<MemoryRouter><EfficiencyPage /></MemoryRouter>)
    await waitFor(() => expect(client.getEfficiency).toHaveBeenCalledWith(7, 'regular'))
    fireEvent.change(screen.getByLabelText('Season'), { target: { value: '6' } })
    await waitFor(() => expect(client.getEfficiency).toHaveBeenCalledWith(6, 'regular'))
    fireEvent.click(screen.getByRole('button', { name: 'Both' }))
    await waitFor(() => expect(specs.get('Efficiency Overview')?.api.params).toEqual({ season: 6, stage: 'both' }))
    await act(async () => { resolveStage([teams[0]]); resolveSeason([teams[0]]) })
    const spec = specs.get('Efficiency Overview')
    expect(spec.rows).toEqual([teams[1]])
    expect(spec.api.params).toEqual({ season: 6, stage: 'both' })
    expect(spec.qualifier).toContain('Season 109 · Both')
  })
})
