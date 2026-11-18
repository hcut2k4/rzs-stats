import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import QbPage from '../pages/QbPage'
import * as client from '../api/client'
import { aiText, buildWorkbook, csvText, toRows } from '../utils/exportTable'

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }

vi.mock('../api/client')
const { specs } = vi.hoisted(() => ({ specs: new Map() }))
vi.mock('../components/ExportMenu', () => ({ default: ({ spec }) => { specs.set(spec.name, spec); return null } }))

const qb = {
  rosterId: '555223472', playerName: 'Max White', teamAbbr: 'MIA',
  gamesPlayed: 4, tanya: 8.4123, rushValue: -2.25, anya: 7.9,
  passerRating: 151.92, passAtt: 26, passComp: 21, passYds: 285, passTd: 4, passInt: 0,
  tdPct: 0.1538, intPct: 0, tdToInt: null, passSacks: 3, sackYardsLost: 18.5, fumblesLost: 0.6667,
  rushAtt: 0, rushYds: 0, rushTd: 0, rushYdsPerAtt: null, qualified: true, rank: 1, rankChange: 2,
}
const other = { ...qb, rosterId: '2', playerName: 'Caleb Williams', teamAbbr: 'CHI', rank: 2, rankChange: -1, tanya: 6, rushValue: 1.2345, tdToInt: 2 }
const movement = {
  risers: [qb], fallers: [other],
  series: [
    { ...qb, ranks: [{ season: 5, week: 0, rank: 2, tanya: 7 }, { season: 5, week: 18, rank: 1, tanya: 8.4123 }] },
    { ...other, ranks: [{ season: 5, week: 18, rank: 2, tanya: null }] },
  ],
}
const leaderboardSpec = () => specs.get('QB Leaderboard')
const values = spec => {
  const [headers, ...rows] = toRows(spec)
  return rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])))
}
const cell = (spec, label) => {
  const wb = buildWorkbook(spec)
  const index = spec.cols.findIndex(c => c.label === label)
  return wb.Sheets[wb.SheetNames[0]][`${String.fromCharCode(65 + index)}2`]
}
beforeEach(() => {
  specs.clear()
  client.getSeasons.mockResolvedValue([4, 5])
  client.getAvailableWeeks.mockResolvedValue([0, 18])
  client.getQbLeaderboard.mockResolvedValue([qb, other])
  client.getQbMovement.mockResolvedValue(movement)
})
afterEach(() => vi.resetAllMocks())

async function show() {
  render(<MemoryRouter><QbPage /></MemoryRouter>)
  await waitFor(() => expect(leaderboardSpec()).toBeDefined())
  await act(async () => {})
  return leaderboardSpec()
}
async function showMovement() {
  await show()
  fireEvent.click(screen.getByRole('tab', { name: 'Movement' }))
  await waitFor(() => expect(specs.has('QB rank history')).toBe(true))
}

describe('QB exports', () => {
  it('drops loaded rows and their export when the new stage has no weeks', async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Week', exact: true }))
    await screen.findByText('Max White')
    let resolveStale
    client.getAvailableWeeks.mockImplementation((season, stage) => Promise.resolve(stage === 2 ? [] : [0, 18]))
    client.getQbLeaderboard.mockReturnValueOnce(new Promise(resolve => { resolveStale = resolve }))
    fireEvent.click(screen.getByRole('button', { name: 'Playoffs', exact: true }))
    await waitFor(() => expect(screen.queryByText('Max White')).toBeNull())
    expect(screen.queryByText('Loading...')).toBeNull()
    await act(async () => resolveStale([qb]))
    expect(screen.queryByText('Max White')).toBeNull()
    expect(screen.queryByRole('button', { name: 'AI', exact: true })).toBeNull()
  })

  it('stops loading when week scope is chosen and there are no weeks to show', async () => {
    let resolveSeason
    client.getAvailableWeeks.mockResolvedValue([])
    client.getQbLeaderboard.mockReturnValueOnce(new Promise(resolve => { resolveSeason = resolve }))
    render(<MemoryRouter><QbPage /></MemoryRouter>)
    await screen.findByText('Loading...')
    fireEvent.click(screen.getByRole('button', { name: 'Week', exact: true }))
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull())
    await act(async () => resolveSeason([qb]))
    expect(screen.queryByText('Loading...')).toBeNull()
  })

  it('exports the active preset with a plain QB and Team column', async () => {
    const spec = await show()
    expect(toRows(spec)[0]).toEqual(['#', 'Move', 'QB', 'Team', 'GP', 'Att', 'TANY/A', 'ANY/A', 'RUSH+'])
    expect(values(spec)[0]).toMatchObject({ QB: 'Max White', Team: 'MIA', Move: '+2', 'TANY/A': '8.41', 'RUSH+': '-2.25' })
    fireEvent.click(screen.getByRole('button', { name: 'Classic' }))
    expect(toRows(leaderboardSpec())[0]).toContain('TD:INT')
    expect(toRows(leaderboardSpec())[0]).not.toContain('RUSH+')
    fireEvent.click(screen.getByRole('button', { name: 'Rushing' }))
    expect(toRows(leaderboardSpec())[0]).toContain('Rushing Att')
    expect(toRows(leaderboardSpec())[0]).not.toContain('Cmp')
    expect(leaderboardSpec().qualifier).toContain('Rushing preset')
  })

  it('prefixes duplicate headers and preserves n/a for a TD:INT ratio with no interceptions', async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'All', exact: true }))
    const spec = leaderboardSpec()
    expect(toRows(spec)[0]).toEqual(expect.arrayContaining(['Volume Att', 'Rushing Att', 'Passing Yds', 'Rushing Yds', 'Passing TD', 'Rushing TD']))
    expect(values(spec)[0]).toMatchObject({ 'TD:INT': 'n/a', '~SkYd': '18.5', '~FL': '0.7', YPC: '', 'TD%': '15.4%', 'INT%': '0.0%' })
    expect(values(spec)[1]).toMatchObject({ 'TD:INT': '2.0', 'RUSH+': '+1.23', Move: '-1' })
    expect(csvText(spec)).toContain('n/a')
    expect(csvText(spec)).not.toContain('—')
    for (const col of spec.cols) expect(col.desc?.trim()).toBeTruthy()
    expect(aiText(spec, 'https://example.com')).toContain('n/a means no interceptions')
    expect(spec.api.fields.YPC).toContain('rushYdsPerAtt')
  })

  it('writes numeric Excel values with the displayed formats', async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'All', exact: true }))
    const spec = leaderboardSpec()
    for (const [label, value, z] of [['TANY/A', 8.4123, '0.00'], ['ANY/A', 7.9, '0.00'], ['RUSH+', -2.25, '+0.00;-0.00;0.00'], ['TD%', 0.1538, '0.0%'], ['INT%', 0, '0.0%'], ['Rating', 151.92, '0.0'], ['~SkYd', 18.5, '0.0'], ['GP', 4, '0']]) {
      expect(cell(spec, label)).toMatchObject({ t: 'n', v: value, z })
    }
  })

  it('leaves unqualified ranks and absent changes empty', async () => {
    client.getQbLeaderboard.mockResolvedValue([{ ...qb, rank: null, qualified: false, rankChange: null }])
    await show()
    fireEvent.click(screen.getByLabelText('Show unqualified'))
    await waitFor(() => expect(leaderboardSpec().api.params.includeUnqualified).toBe(true))
    const spec = leaderboardSpec()
    expect(values(spec)[0]).toMatchObject({ '#': '', Move: '' })
    expect(csvText(spec).split('\n')[1]).toMatch(/^,,Max White/)
    expect(spec.description).toContain('empty #')
    expect(spec.qualifier).toContain('unqualified shown')
  })

  it('records exact season, weekly and all-time calls without client presentation params', async () => {
    await show()
    expect(leaderboardSpec().api).toMatchObject({ path: '/qb/leaderboard', params: { scope: 'season', season: 5, stage: 'regular', includeUnqualified: false } })
    expect(leaderboardSpec().api.params).not.toHaveProperty('week')
    fireEvent.click(screen.getByRole('button', { name: 'Week', exact: true }))
    await waitFor(() => expect(leaderboardSpec().api.params.scope).toBe('week'))
    expect(leaderboardSpec().api.params).toEqual({ scope: 'week', season: 5, week: 18, stage: 'regular', includeUnqualified: false })
    expect(leaderboardSpec().qualifier).toContain('Wild Card')
    expect(toRows(leaderboardSpec())[0]).not.toContain('Move')
    fireEvent.click(screen.getByRole('button', { name: 'All-time', exact: true }))
    await waitFor(() => expect(leaderboardSpec().api.params.scope).toBe('alltime'))
    fireEvent.click(screen.getByRole('button', { name: 'Playoffs', exact: true }))
    await waitFor(() => expect(leaderboardSpec().api.params.stage).toBe('playoffs'))
    expect(leaderboardSpec().api.params).toEqual({ scope: 'alltime', stage: 'playoffs', includeUnqualified: false })
    expect(leaderboardSpec().qualifier).toContain('minimum attempts: 50')
    fireEvent.change(screen.getByPlaceholderText('default'), { target: { value: '7' } })
    await waitFor(() => expect(leaderboardSpec().api.params.minAtt).toBe(7))
    expect(leaderboardSpec().qualifier).toContain('minimum attempts: 7')
    for (const call of client.getQbLeaderboard.mock.calls) expect(call[0]).not.toHaveProperty('preset')
    expect(leaderboardSpec().api.note).toContain('preset=efficiency')
    fireEvent.click(screen.getByRole('columnheader', { name: 'TANY/A ▼' }))
    expect(leaderboardSpec().qualifier).toContain('ascending')
    expect(leaderboardSpec().rows[0]).toEqual(other)
  })

  it('ignores an older leaderboard response after newer rows arrive', async () => {
    let resolveOld
    const slow = new Promise(resolve => { resolveOld = resolve })
    client.getQbLeaderboard.mockImplementation(params => params.season === 5 ? slow : Promise.resolve([other]))
    render(<MemoryRouter><QbPage /></MemoryRouter>)
    await waitFor(() => expect(client.getQbLeaderboard).toHaveBeenCalled())
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '4' } })
    await waitFor(() => expect(leaderboardSpec()?.api.params.season).toBe(4))
    await act(async () => resolveOld([qb]))
    expect(leaderboardSpec().rows).toEqual([other])
    expect(leaderboardSpec().api.params.season).toBe(4)
    expect(leaderboardSpec().qualifier).toContain('Season 107')
  })

  it('exports one movement pair with risers first and the resolved window', async () => {
    await showMovement()
    const spec = specs.get('QB Movement')
    expect(toRows(spec)[0]).toEqual(['Direction', 'Move', 'QB', 'Team', 'Rank', 'TANY/A'])
    expect(values(spec).map(r => [r.Direction, r.Move])).toEqual([['Riser', '+2'], ['Faller', '-1']])
    expect(spec.api).toMatchObject({ path: '/qb/movement', params: { season: 5, stage: 'regular', window: 1, basis: 'season' } })
    expect(spec.description).toContain('not the full series')
    expect(spec.qualifier).toContain('window: Last week (1)')
    expect(spec.qualifier).toContain('Regular season')
    for (const col of spec.cols) expect(col.desc?.trim()).toBeTruthy()
    expect(csvText(spec)).toContain('Riser,+2,Max White,MIA,1,8.41')
    expect(cell(spec, 'TANY/A')).toMatchObject({ t: 'n', v: 8.4123, z: '0.00' })
  })

  it('exports every charted player point with chart labels and numeric indexes', async () => {
    await showMovement()
    const spec = specs.get('QB rank history')
    expect(spec.rows).toHaveLength(movement.series.reduce((n, s) => n + s.ranks.length, 0))
    expect(values(spec).map(r => r.Week)).toEqual(['W1', 'WC', 'WC'])
    expect(values(spec)[0]).toMatchObject({ QB: 'Max White', Team: 'MIA', Season: '5', 'Week index': '0', Rank: '2', 'TANY/A': '7.00' })
    expect(values(spec)[2]['TANY/A']).toBe('')
    expect(csvText(spec)).toContain('Caleb Williams,CHI,5,WC,18,2,')
    expect(cell(spec, 'Season')).toMatchObject({ t: 'n', v: 5, z: '0' })
    expect(spec.api.note).toContain('series array')
    expect(spec.api.params).toEqual(specs.get('QB Movement').api.params)
    for (const col of spec.cols) expect(col.desc?.trim()).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'All-time', exact: true }))
    await waitFor(() => expect(specs.get('QB rank history').api.params.basis).toBe('alltime'))
    expect(values(specs.get('QB rank history'))[1].Week).toBe('S108 WC')
    expect(specs.get('QB rank history').qualifier).toContain('All-time')
  })

  it('keeps both movement exports on the newer response when a slow window finishes last', async () => {
    let resolveOld
    client.getQbMovement.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce({ ...movement, risers: [other], fallers: [], series: [movement.series[1]] })
    await show()
    fireEvent.click(screen.getByRole('tab', { name: 'Movement' }))
    await waitFor(() => expect(client.getQbMovement).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText('Movers vs'), { target: { value: '4' } })
    await waitFor(() => expect(specs.get('QB Movement')?.api.params.window).toBe(4))
    await act(async () => resolveOld(movement))
    expect(specs.get('QB Movement').rows.map(r => r.playerName)).toEqual(['Caleb Williams'])
    expect(specs.get('QB rank history').rows).toHaveLength(1)
    for (const name of ['QB Movement', 'QB rank history']) {
      expect(specs.get(name).api.params.window).toBe(4)
      expect(specs.get(name).qualifier).toContain('Last 4')
    }
  })
})
