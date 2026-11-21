import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import EloPage from '../pages/EloPage'
import * as client from '../api/client'
import { aiText, buildWorkbook, csvText, toRows } from '../utils/exportTable'
import { divergeColor } from '../utils/heat'
import { lean } from '../utils/eloLean'

vi.mock('../api/client')
const { specs } = vi.hoisted(() => ({ specs: new Map() }))
vi.mock('../components/ExportMenu', () => ({ default: ({ spec }) => { specs.set(spec.name, spec); return null } }))

const ratings = [
  { teamId: 1, abbrName: 'BUF', displayName: 'Bills', elo: 1620.4, rank: 1, change: 12.5, rankChange: 2, gamesCounted: 35 },
  { teamId: 2, abbrName: 'MIA', displayName: 'Dolphins', elo: 1479.6, rank: 2, change: -12.5, rankChange: -1, gamesCounted: 34 },
  { teamId: 3, abbrName: 'NYJ', displayName: 'Jets', elo: 1500, rank: 3, change: 0, rankChange: 0, gamesCounted: 0 },
]
const history = [
  { teamId: 1, season: 1, week: 0, endElo: 1510.2 },
  { teamId: 2, season: 1, week: 0, endElo: 1489.8 },
  { teamId: 1, season: 2, week: 1, endElo: 1607.9 },
  { teamId: 1, season: 2, week: 2, endElo: 1620.4 },
  { teamId: 2, season: 2, week: 2, endElo: 1479.6 },
]
const game = (gameId, extra = {}) => ({
  gameId, season: 2, week: 2, awayTeam: ratings[0], homeTeam: ratings[1],
  awayPregameElo: 1500, homePregameElo: 1600, awayPostgameElo: 1512.5, homePostgameElo: 1587.5,
  awayScore: 24, homeScore: 10, homeWinProbability: 0.7, awayWinProbability: 0.3,
  margin: 14, movMultiplier: 1.234, ...extra,
})
const upcoming = [
  { gameId: 3, season: 2, week: 2, awayTeam: ratings[0], homeTeam: ratings[1], awayElo: 1620.4, homeElo: 1479.6, homeWinProbability: 0.25, awayWinProbability: 0.75 },
  { gameId: 4, season: 2, week: 3, awayTeam: ratings[1], homeTeam: ratings[0], awayElo: 1479.6, homeElo: 1620.4, homeWinProbability: 0.52, awayWinProbability: 0.48 },
  { gameId: 5, season: 1, week: 2, awayTeam: ratings[1], homeTeam: ratings[0], awayElo: 1500, homeElo: 1500, homeWinProbability: 0.5, awayWinProbability: 0.5 },
]
const deferred = () => {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  specs.clear()
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  client.getEloHistory.mockResolvedValue(history)
  client.getEloRatings.mockResolvedValue(ratings)
  client.getEloGames.mockResolvedValue([game(1), game(2, { awayScore: 10, homeScore: 24 })])
  client.getEloUpcoming.mockResolvedValue(upcoming)
})
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals() })

async function getSpec(name) {
  await waitFor(() => expect(specs.has(name)).toBe(true))
  const spec = specs.get(name)
  expect(spec.cols.every(c => c.desc?.trim())).toBe(true)
  expect(spec.description).toBeTruthy()
  expect(spec.notes.join(' ')).toContain('Every team starts at 1500')
  expect(spec.notes.join(' ')).toContain('pulled part of the way back toward it')
  expect(spec.notes.join(' ')).toContain('when it changes owners mid-season')
  expect(spec.notes.join(' ')).toContain('Includes playoffs')
  expect(Object.values(spec.api.params)).not.toContain(undefined)
  return spec
}
async function show(tab = 'ratings') {
  render(<MemoryRouter initialEntries={[`/elo?tab=${tab}`]}><EloPage /></MemoryRouter>)
  await waitFor(() => expect(client.getEloRatings).toHaveBeenCalledWith(2, 2))
  return getSpec(tab === 'games' ? 'Elo Played Games' : tab === 'history' ? 'Elo History' : 'Elo Ratings')
}
const sheet = spec => { const wb = buildWorkbook(spec); return wb.Sheets[wb.SheetNames[0]] }

it('keeps the export-only Ratings headers equal to the rendered table headers', async () => {
  const spec = await show()
  expect(toRows(spec)[0]).toEqual(['#', 'Team', 'Elo', 'vs avg', 'Change', 'Rank change', 'Games'])
  expect(spec.cols.map(c => c.label)).toEqual(screen.getAllByRole('columnheader').map(th => th.textContent))
  expect(toRows(spec)[1]).toEqual(['1', 'Bills', '1620', '+120', '+12.5', '+2', '35'])
  expect(toRows(spec)[2].slice(3, 6)).toEqual(['-20', '-12.5', '-1'])
  expect(toRows(spec)[3].slice(3, 6)).toEqual(['0', '0.0', '0'])
  expect(spec.api).toMatchObject({ path: '/elo/ratings', params: { season: 2, week: 2 } })
  expect(spec.qualifier).toContain('Season 105 · Week 3')
  expect(spec.cols[4].color(ratings[0])).toBe(divergeColor(12.5, 12.5))
  expect(sheet(spec).C2).toMatchObject({ t: 'n', v: 1620.4, z: '0' })
  expect(sheet(spec).D2).toMatchObject({ t: 'n', v: ratings[0].elo - 1500, z: '+0;-0;0' })
  expect(sheet(spec).E2).toMatchObject({ t: 'n', v: 12.5, z: '+0.0;-0.0;0.0' })
  expect(sheet(spec).F2).toMatchObject({ t: 'n', v: 2, z: '+0;-0;0' })
  expect(sheet(spec).F4).toMatchObject({ t: 'n', v: 0, z: '+0;-0;0' })
})

it('leaves missing rank movement empty in CSV and Excel', async () => {
  client.getEloRatings.mockResolvedValue([{ ...ratings[0], rankChange: null }])
  const spec = await show()
  expect(toRows(spec)[1][5]).toBe('')
  expect(csvText(spec)).toContain('+12.5,,35')
  expect(sheet(spec).F2).toMatchObject({ t: 's', v: '' })
})

it('tracks the actual Ratings sort column and direction', async () => {
  await show()
  fireEvent.click(screen.getByRole('columnheader', { name: 'Change' }))
  expect(specs.get('Elo Ratings').qualifier).toContain('sorted by Change descending')
  fireEvent.click(screen.getByRole('columnheader', { name: 'Change ▼' }))
  const spec = specs.get('Elo Ratings')
  expect(spec.qualifier).toContain('sorted by Change ascending')
  expect(spec.rows.map(r => r.teamId)).toEqual([2, 3, 1])
})

it('exports Movers in riser then dropper order with one menu for the pair', async () => {
  await show()
  const spec = await getSpec('Elo Movers')
  expect(toRows(spec)).toEqual([
    ['Direction', 'Team', 'Change'],
    ['Riser', 'Bills', '+12.5'], ['Riser', 'Jets', '0.0'], ['Riser', 'Dolphins', '-12.5'],
    ['Faller', 'Dolphins', '-12.5'], ['Faller', 'Jets', '0.0'], ['Faller', 'Bills', '+12.5'],
  ])
  expect(spec.api).toMatchObject({ path: '/elo/ratings', params: { season: 2, week: 2 } })
  expect(spec.qualifier).toContain('Season 105 · Week 3')
  expect(spec.qualifier).toContain('Change descending')
  expect(spec.qualifier).toContain('Change ascending')
  expect(sheet(spec).C2).toMatchObject({ t: 'n', v: 12.5, z: '+0.0;-0.0;0.0' })
})

it('splits played game cells into ASCII headers, signed deltas and an empty non-upset result', async () => {
  const spec = await show('games')
  expect(toRows(spec)[0]).toEqual(['Away', 'Away Elo', 'Away Elo Change', 'Home', 'Home Elo', 'Home Elo Change', 'Away Score', 'Home Score', 'Home Win Prob', 'Margin mult.', 'Result'])
  expect(toRows(spec)[1]).toEqual(['BUF', '1500', '+12.5', 'MIA', '1600', '-12.5', '24', '10', '70.0%', '1.23', 'Big upset · 30%'])
  expect(toRows(spec)[2].at(-1)).toBe('')
  expect(csvText(spec).split('\n')[2]).toMatch(/1.23,$/)
  expect(spec.cols.at(-1).color(spec.rows[0])).toBe('rgb(220 38 38 / 0.32)')
  expect(spec.cols.at(-1).color(spec.rows[1])).toBeUndefined()
  expect(spec.api).toMatchObject({ path: '/elo/games', params: { season: 2, week: 2 } })
  expect(spec.qualifier).toContain('Season 105 · Week 3')
  expect(sheet(spec).C2).toMatchObject({ t: 'n', v: 12.5, z: '+0.0;-0.0;0.0' })
  expect(sheet(spec).F2).toMatchObject({ t: 'n', v: -12.5, z: '+0.0;-0.0;0.0' })
  expect(sheet(spec).I2).toMatchObject({ t: 'n', v: 0.7, z: '0.0%' })
  expect(sheet(spec).J2).toMatchObject({ t: 'n', v: 1.234, z: '0.00' })
  fireEvent.click(screen.getByRole('columnheader', { name: 'Score' }))
  expect(specs.get('Elo Played Games').qualifier).toContain('sorted by Score (margin) descending')
  fireEvent.click(screen.getByRole('columnheader', { name: 'Score ▼' }))
  expect(specs.get('Elo Played Games').qualifier).toContain('sorted by Score (margin) ascending')
})

it('exports projected games in the current scope with numeric edge, favored probability and tier color', async () => {
  await show('games')
  const spec = await getSpec('Elo Projected')
  expect(toRows(spec)[0]).toEqual(['Away', 'Away Elo', 'Home', 'Home Elo', 'Edge', 'Favored', 'Favored Win Prob', 'Outlook'])
  expect(toRows(spec)[1]).toEqual(['BUF', '1620', 'MIA', '1480', '0.50', 'BUF', '75%', 'Likely'])
  expect(spec.rows.map(r => r.game.gameId)).toEqual([3])
  expect(spec.cols.at(-1).color(spec.rows[0])).toBe(lean(upcoming[0]).shade)
  expect(spec.cols.find(c => c.label === 'Edge').desc).toContain('100% win probability')
  expect(csvText(spec)).toContain(',0.50,')
  expect(aiText(spec)).toContain(',0.50,')
  const edge = spec.cols.find(c => c.label === 'Edge')
  const fractional = { l: { ...spec.rows[0].l, edge: 0.04983821822268974 } }
  expect(edge.text(fractional)).toBe('0.05')
  expect(edge.bar(fractional)).toMatchObject({ value: -0.04983821822268974, max: 1 })
  expect(spec.cols[0].logo(spec.rows[0])).toBe('BUF')
  expect(spec.api).toMatchObject({ path: '/elo/upcoming', params: {} })
  expect(client.getEloUpcoming).toHaveBeenCalledWith()
  expect(spec.api.note).toContain("latest season's unplayed games")
  expect(spec.api.note).toContain('week 3 only (add week=2 to reproduce it)')
  expect(spec.qualifier).toContain('Season 105 · Week 3 · sorted by Outlook (favored win probability) ascending')
  expect(sheet(spec).E2).toMatchObject({ t: 'n', v: 0.5, z: '0.00' })
  expect(sheet(spec).G2).toMatchObject({ t: 'n', v: 0.75, z: '0%' })
  fireEvent.click(screen.getByRole('button', { name: 'Rest of season' }))
  const seasonSpec = specs.get('Elo Projected')
  expect(toRows(seasonSpec)[0]).toEqual(['Week', ...toRows(spec)[0]])
  expect(toRows(seasonSpec)[1]).toEqual(['Week 4', 'MIA', '1480', 'BUF', '1620', lean(upcoming[1]).edge.toFixed(2), 'BUF', '52%', 'Toss-up'])
  expect(seasonSpec.rows.map(r => r.game.gameId)).toEqual([4, 3])
  expect(seasonSpec.qualifier).toContain('Season 105 · Rest of season')
  expect(seasonSpec.api.params).toEqual({})
  expect(seasonSpec.api.note).toContain('the rest of the season')
  fireEvent.click(screen.getByRole('columnheader', { name: 'Favored' }))
  expect(specs.get('Elo Projected').qualifier).toContain('sorted by Favored Win Prob descending')
  expect(specs.get('Elo Projected').rows.map(r => r.game.gameId)).toEqual([3, 4])
  fireEvent.click(screen.getByRole('columnheader', { name: 'Week' }))
  expect(specs.get('Elo Projected').qualifier).toContain('sorted by Week descending')
  fireEvent.click(screen.getByRole('button', { name: 'This week' }))
  expect(toRows(specs.get('Elo Projected'))[0]).not.toContain('Week')
})

it('exports the chart matrix as teams by season/week with missing points empty', async () => {
  await show()
  fireEvent.click(screen.getByRole('tab', { name: 'History' }))
  const spec = await getSpec('Elo History')
  expect(toRows(spec)).toEqual([
    ['Team', 'S104 W1', 'S105 W2', 'S105 W3'],
    ['Bills', '1510', '1608', '1620'], ['Dolphins', '1490', '', '1480'], ['Jets', '', '', ''],
  ])
  expect(csvText(spec)).toContain('Dolphins,1490,,1480')
  expect(sheet(spec).B2).toMatchObject({ t: 'n', v: 1510.2, z: '0' })
  expect(spec.api).toMatchObject({ path: '/elo/history', params: {} })
  expect(client.getEloHistory).toHaveBeenCalledWith()
  expect(spec.qualifier).toContain('All seasons · All weeks · teams by abbreviation ascending')
  expect(spec.notes.join(' ')).toContain('season starts')
  expect(aiText(spec, 'https://example.test')).toContain('GET https://example.test/api/elo/history\n')
  fireEvent.click(screen.getByRole('button', { name: 'BUF' }))
  expect(toRows(specs.get('Elo History'))).toEqual(toRows(spec))
})

it('keeps Ratings and Movers params with the winning response when weeks resolve out of order', async () => {
  const old = deferred()
  client.getEloRatings.mockReturnValueOnce(old.promise).mockResolvedValueOnce([ratings[1]])
  render(<MemoryRouter><EloPage /></MemoryRouter>)
  await waitFor(() => expect(client.getEloRatings).toHaveBeenCalledWith(2, 2))
  fireEvent.change(screen.getByLabelText('Week'), { target: { value: '1' } })
  await waitFor(() => expect(specs.get('Elo Ratings')?.api.params.week).toBe(1))
  await act(async () => old.resolve([ratings[0]]))
  for (const name of ['Elo Ratings', 'Elo Movers']) {
    const spec = await getSpec(name)
    expect(spec.api.params).toEqual({ season: 2, week: 1 })
    expect(spec.qualifier).toContain('Season 105 · Week 2')
    expect(spec.rows.every(r => r.teamId === 2)).toBe(true)
  }
})

it('keeps played-game params with the winning response when seasons resolve out of order', async () => {
  const old = deferred()
  client.getEloGames.mockReturnValueOnce(old.promise).mockResolvedValueOnce([game(8, { season: 1, week: 0 })])
  render(<MemoryRouter initialEntries={['/elo?tab=games']}><EloPage /></MemoryRouter>)
  await waitFor(() => expect(client.getEloGames).toHaveBeenCalledWith(2, 2))
  fireEvent.change(screen.getByLabelText('Season'), { target: { value: '1' } })
  await waitFor(() => expect(specs.get('Elo Played Games')?.api.params.season).toBe(1))
  await act(async () => old.resolve([game(1)]))
  const spec = await getSpec('Elo Played Games')
  expect(spec.api.params).toEqual({ season: 1, week: 0 })
  expect(spec.qualifier).toContain('Season 104 · Week 1')
  expect(spec.rows.map(g => g.gameId)).toEqual([8])
})

it('ignores discarded history responses after effects restart', async () => {
  const oldHistory = deferred()
  client.getEloHistory.mockReturnValueOnce(oldHistory.promise).mockResolvedValueOnce(history)
  render(<StrictMode><MemoryRouter initialEntries={['/elo?tab=games']}><EloPage /></MemoryRouter></StrictMode>)
  await getSpec('Elo Projected')
  await act(async () => {
    oldHistory.resolve([{ teamId: 99, season: 9, week: 9, endElo: 1900 }])
  })
  expect(specs.get('Elo Projected').rows.map(r => r.game.gameId)).toEqual([3])
  expect(specs.get('Elo Projected').api.params).toEqual({})
  fireEvent.click(screen.getByRole('tab', { name: 'History' }))
  const spec = await getSpec('Elo History')
  expect(toRows(spec)[0]).toEqual(['Team', 'S104 W1', 'S105 W2', 'S105 W3'])
  expect(spec.api.params).toEqual({})
})
