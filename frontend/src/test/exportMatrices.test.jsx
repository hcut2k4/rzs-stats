import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import SeasonHistoryTab from '../components/SeasonHistoryTab'
import WeeklyTab from '../components/WeeklyTab'
import * as client from '../api/client'
import { aiText, buildWorkbook, csvText, toRows } from '../utils/exportTable'
import { divergeColor, goodBadColor } from '../utils/heat'

vi.mock('../api/client')
const { specs } = vi.hoisted(() => ({ specs: new Map() }))
vi.mock('../components/ExportMenu', () => ({ default: ({ spec }) => { specs.set(spec.name, spec); return null } }))
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
const team = (teamId, displayName, extra = {}) => ({ teamId, displayName, abbrName: displayName.slice(0, 3).toUpperCase(), wins: 10, losses: 4, ties: 0, winPct: 0.7, pythagoreanPat: 0.65, winDiff: 0.9, ...extra })
const aces = team(1, 'Aces')
const wolves = team(2, 'Wolves', { wins: 8, losses: 5, ties: 1, winPct: 0.6, pythagoreanPat: 0.55, winDiff: -0.1 })
const history = [{ seasonIndex: 6, standings: [wolves] }, { seasonIndex: 7, standings: [aces, wolves] }]
const weeks = [{ weekIndex: 0, standings: [wolves, aces] }, { weekIndex: 1, standings: [{ ...aces, pythagoreanPat: 0.75 }] }, { weekIndex: 18, standings: [{ ...aces, pythagoreanPat: 0.8 }, wolves] }]
beforeEach(() => { vi.resetAllMocks(); specs.clear(); client.getWeeklyTrends.mockResolvedValue(weeks) })

describe('Season History export', () => {
  it('carries the on-screen heat colors into the image columns', () => {
    render(<MemoryRouter><SeasonHistoryTab data={history} /></MemoryRouter>)
    const spec = specs.get('Season History')
    const [wl, pypat, luck] = spec.cols.slice(-3)
    expect(wl.color(aces)).toBe(goodBadColor(0.7, [0.6, 0.7]))
    expect(pypat.color(aces)).toBe(goodBadColor(0.65, [0.55, 0.65]))
    expect(luck.color(aces)).toBe(divergeColor(0.9))
    expect(wl.color(team(9, 'Nobody'))).toBeUndefined()
  })

  it('exports unique grouped headers, records, typed rates and empty missing seasons', () => {
    render(<MemoryRouter><SeasonHistoryTab data={history} /></MemoryRouter>)
    const spec = specs.get('Season History')
    expect(toRows(spec)).toEqual([
      ['Team', 'S109 W-L', 'S109 PyPAT', 'S109 Luck', 'S110 W-L', 'S110 PyPAT', 'S110 Luck'],
      ['Aces', '', '', '', '10-4', '65.0%', '+0.9'],
      ['Wolves', '8-5-1', '55.0%', '-0.1', '8-5-1', '55.0%', '-0.1'],
    ])
    expect(spec.cols.slice(1, 4).map(c => c.group)).toEqual(['Season 109', 'Season 109', 'Season 109'])
    expect(spec.cols.every(c => c.desc?.trim())).toBe(true)
    expect(spec.cols[1].desc).toBe(screen.getAllByRole('columnheader', { name: /^W-L/ })[0].title)
    expect(csvText(spec)).toContain('Aces,,,,10-4,65.0%,+0.9')
    expect(spec.api).toMatchObject({ path: '/trends/season', params: {} })
    expect(spec.api.note).toContain('one entry per season')
    const sheet = buildWorkbook(spec).Sheets['All seasons']
    expect(sheet.F2).toMatchObject({ t: 'n', v: 0.65, z: '0.0%' })
    expect(sheet.G2).toMatchObject({ t: 'n', v: 0.9, z: '+0.0;-0.0;0.0' })
    expect(sheet.B2).toMatchObject({ t: 's', v: '' })
    expect(aiText(spec, 'https://example.com')).toContain('GET https://example.com/api/trends/season')
  })
  it('follows the on-screen sort and describes the selected season and direction', () => {
    render(<MemoryRouter><SeasonHistoryTab data={history} /></MemoryRouter>)
    expect(specs.get('Season History').qualifier).toBe('All seasons · sorted by Season 110 W-L descending')
    fireEvent.click(screen.getAllByRole('columnheader', { name: /^PyPAT/ })[0])
    const spec = specs.get('Season History')
    expect(spec.qualifier).toBe('All seasons · sorted by Season 109 PyPAT descending')
    const shown = within(screen.getByRole('table')).getAllByRole('row').slice(2).map(r => within(r).getAllByRole('cell')[0].textContent)
    expect(toRows(spec).slice(1).map(r => r[0])).toEqual(shown)
    expect(shown).toEqual(['Wolves', 'Aces'])
    fireEvent.click(screen.getAllByRole('columnheader', { name: /^PyPAT/ })[0])
    expect(specs.get('Season History').qualifier).toContain('PyPAT ascending')
  })
})

describe('Week by Week export', () => {
  it('exports cumulative fractions with chart week labels and legend order', async () => {
    render(<MemoryRouter><WeeklyTab season={7} /></MemoryRouter>)
    await waitFor(() => expect(specs.has('Week by Week')).toBe(true))
    const spec = specs.get('Week by Week')
    expect(toRows(spec)).toEqual([['Team', 'Wk 1', 'Wk 2', 'Wild Card'], ['Aces', '65.0%', '75.0%', '80.0%'], ['Wolves', '55.0%', '', '55.0%']])
    expect(spec.api).toMatchObject({ path: '/trends/weekly', params: { season: 7 } })
    expect(spec.qualifier).toBe('Season 110 · cumulative PyPAT by week')
    expect(spec.cols.every(c => c.desc?.trim())).toBe(true)
    expect(spec.cols[3].desc).toContain('expected to win from points scored and allowed')
    const sheet = buildWorkbook(spec).Sheets['Season 110']
    expect(sheet.C2).toMatchObject({ t: 'n', v: 0.75, z: '0.0%' })
    expect(sheet.C3).toMatchObject({ t: 's', v: '' })
    expect(csvText(spec)).toContain('Wolves,55.0%,,55.0%')
    expect(aiText(spec, 'https://example.com')).toContain('GET https://example.com/api/trends/weekly?season=7')
  })
  it('keeps the winning response and season when an older request finishes last', async () => {
    let resolveOld
    client.getWeeklyTrends.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce([{ weekIndex: 0, standings: [aces] }])
    const view = render(<MemoryRouter><WeeklyTab season={7} /></MemoryRouter>)
    await waitFor(() => expect(client.getWeeklyTrends).toHaveBeenCalledWith(7))
    view.rerender(<MemoryRouter><WeeklyTab season={6} /></MemoryRouter>)
    await waitFor(() => expect(specs.get('Week by Week')?.api.params.season).toBe(6))
    await act(async () => resolveOld([{ weekIndex: 0, standings: [wolves] }]))
    const spec = specs.get('Week by Week')
    expect(spec.api.params).toEqual({ season: 6 })
    expect(toRows(spec)[1][0]).toBe('Aces')
    expect(toRows(spec)).toHaveLength(2)
    expect(spec.qualifier).toContain('Season 109')
  })
})
