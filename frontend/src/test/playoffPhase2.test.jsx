import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import PlayoffsPage from '../pages/PlayoffsPage'
import PlayoffOutlook from '../components/team/PlayoffOutlook'
import * as client from '../api/client'
import * as exports from '../utils/exportTable'
import { clearLoadCache } from '../utils/useLoad'

vi.mock('../api/client')
const A = { teamId: 1, abbrName: 'BUF', displayName: 'Bills' }
const B = { teamId: 2, abbrName: 'NYJ', displayName: 'Jets' }
const C = { teamId: 3, abbrName: 'MIA', displayName: 'Dolphins' }
const goals = (playoffs, division = playoffs / 2, oneSeed = playoffs / 4) => ({ playoffs, division, oneSeed })
const odds = (season = 2, rules = 'madden') => ({ season, rules, simulations: 20000, computedAt: '2026-11-22T03:00:00Z', conferences: ['AFC', 'NFC'].map(name => ({ name, teams: [
  { team: B, wins: 3, losses: 7, ties: 0, odds: goals(0.001), seedOdds: Array(7).fill(0) },
  { team: A, wins: 9, losses: 1, ties: 0, odds: goals(0.999), seedOdds: [0.4, 0.3, 0.1, 0.1, 0.05, 0.03, 0.019] },
] })) })
const leverage = (season = 2, week = 11, rules = 'madden') => ({ season, week, rules, simulations: 4000, computedAt: '2026-11-22T03:00:00Z', games: [
  { gameId: 1, home: A, away: B, importance: goals(0.3), others: [{ team: C, goal: 'playoffs', swing: -0.04 }], teams: [
    { team: A, side: 'home', current: goals(0.6), ifWin: goals(0.8, 0.2, 0.1), ifLoss: goals(0.4, 0.15, 0.05) },
    { team: B, side: 'away', current: goals(0.1), ifWin: goals(0.14, 0.08, 0.04), ifLoss: goals(0.09, 0.03, 0.01) },
  ] },
] })
function Where() { return <output data-testid="where">{useLocation().search}</output> }
const show = url => render(<MemoryRouter initialEntries={[url]}><PlayoffsPage /><Where /></MemoryRouter>)
const formats = region => { for (const name of ['XLSX', 'CSV', 'PNG', 'AI']) expect(within(region).getByRole('button', { name })).toBeInTheDocument() }

beforeEach(() => {
  vi.resetAllMocks()
  clearLoadCache()
  client.getSeasons.mockResolvedValue([1, 2])
  client.getPlayoffOdds.mockImplementation(async (season, rules) => odds(season, rules))
  client.getPlayoffLeverage.mockImplementation(async (season, week, rules) => leverage(season, week, rules))
  client.getPlayoffCalibration.mockResolvedValue({ games: 400, brier: 0.2, coinFlipBrier: 0.25, buckets: [{ low: 0.5, high: 0.6, games: 400, predicted: 0.55, actual: 0.57 }] })
})

it('sorts odds by playoff probability, bounds rounded estimates and exports each conference', async () => {
  const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
  show('/playoffs?tab=odds&season=1&rules=nfl')
  const table = await screen.findByRole('table', { name: 'AFC playoff odds' })
  const rows = within(table).getAllByRole('row')
  expect(rows[1]).toHaveTextContent('Bills9-1>99%')
  expect(rows[2]).toHaveTextContent('Jets3-7<1%')
  expect(within(table).getByRole('link', { name: 'Bills' })).toHaveAttribute('href', '/teams/BUF?season=104')
  expect(within(table).getAllByRole('img').some(i => i.getAttribute('aria-label')?.includes('Seed 1: 40%'))).toBe(true)
  expect(screen.getByText(/20,000 simulations.*2026-11-22/)).toBeInTheDocument()
  for (const name of ['AFC odds', 'NFC odds']) formats(screen.getByRole('region', { name }))
  await userEvent.click(within(screen.getByRole('region', { name: 'AFC odds' })).getByRole('button', { name: 'CSV' }))
  expect(csv.mock.lastCall[0].rows[0].team).toEqual(A)
  expect(csv.mock.lastCall[0].api.params).toEqual({ season: 1, rules: 'nfl' })
  csv.mockRestore()
})

it('loads calibration on expansion and renders predicted and actual bucket rates with exports', async () => {
  show('/playoffs?tab=odds')
  await screen.findByRole('table', { name: 'AFC playoff odds' })
  expect(client.getPlayoffCalibration).not.toHaveBeenCalled()
  await userEvent.click(screen.getByText('How accurate are these odds?'))
  const table = await screen.findByRole('table', { name: 'Calibration buckets' })
  expect(table).toHaveTextContent('50–60%40055%57%')
  expect(screen.getByText(/Brier score: 0.200 vs a coin flip: 0.250/)).toBeInTheDocument()
  formats(table.closest('details'))
})

it('switches goals, reveals small swings, and refetches the selected week with URL controls', async () => {
  show('/playoffs?tab=leverage&rules=nfl&season=1')
  const table = await screen.findByRole('table', { name: 'Game swings' })
  expect(screen.getByLabelText('Week')).toHaveValue('11')
  expect(table).toHaveTextContent('Bills')
  expect(table).not.toHaveTextContent('Jets')
  await userEvent.click(screen.getByLabelText('Show small swings'))
  expect(table).toHaveTextContent('Jets')
  await userEvent.selectOptions(screen.getByLabelText('Goal'), 'division')
  expect(table).toHaveTextContent('15%20%5 pp')
  await userEvent.selectOptions(screen.getByLabelText('Week'), '12')
  await waitFor(() => expect(client.getPlayoffLeverage).toHaveBeenLastCalledWith(1, 12, 'nfl'))
  await screen.findByRole('table', { name: 'Game swings' })
  expect(screen.getByTestId('where')).toHaveTextContent('goal=division')
  expect(screen.getByTestId('where')).toHaveTextContent('week=12')
  expect(screen.getByTestId('where')).toHaveTextContent('small=true')
  for (const name of ['Win or lose chart', 'Swing table', 'Biggest games']) formats(screen.getByRole('region', { name }))
})

it('restores leverage URL controls and keeps shared season and rules when switching tabs', async () => {
  show('/playoffs?tab=leverage&season=1&rules=nfl&week=13&goal=oneSeed&small=true')
  await screen.findByRole('table', { name: 'Game swings' })
  expect(screen.getByLabelText('Goal')).toHaveValue('oneSeed')
  expect(screen.getByLabelText('Week')).toHaveValue('13')
  expect(screen.getByLabelText('Show small swings')).toBeChecked()
  await userEvent.click(screen.getByRole('tab', { name: 'Odds' }))
  await screen.findByRole('table', { name: 'AFC playoff odds' })
  expect(client.getPlayoffOdds).toHaveBeenLastCalledWith(1, 'nfl')
  await userEvent.selectOptions(screen.getByLabelText('Season'), '2')
  await waitFor(() => expect(client.getPlayoffOdds).toHaveBeenLastCalledWith(2, 'nfl'))
  await userEvent.click(screen.getByRole('button', { name: 'Madden 27' }))
  await waitFor(() => expect(client.getPlayoffOdds).toHaveBeenLastCalledWith(2, 'madden'))
})

it('ranks the biggest games by importance and names other affected teams', async () => {
  const data = leverage()
  data.games.push({ ...data.games[0], gameId: 2, home: C, importance: goals(0.9), teams: [] })
  client.getPlayoffLeverage.mockResolvedValue(data)
  show('/playoffs?tab=leverage')
  const table = await screen.findByRole('table', { name: 'Biggest games this week' })
  expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Jets @ Dolphins90 pp')
  expect(table).toHaveTextContent('Dolphins (-4 pp with a home win)')
})

it.each(['404', 'empty', 'no team'])('hides the team outlook when odds are %s', async mode => {
  if (mode === '404') client.getPlayoffOdds.mockRejectedValue({ response: { status: 404 } })
  if (mode === 'empty') client.getPlayoffOdds.mockResolvedValue({ conferences: [] })
  render(<MemoryRouter><PlayoffOutlook teamId={mode === 'no team' ? 999 : 1} season={2} nextWeek={12} /></MemoryRouter>)
  await act(async () => {})
  expect(screen.queryByRole('region', { name: 'Playoff outlook' })).not.toBeInTheDocument()
  expect(client.getPlayoffLeverage).not.toHaveBeenCalled()
})

it('shows the next game outlook for all goals and links to that leverage week', async () => {
  render(<MemoryRouter><PlayoffOutlook teamId={1} season={2} nextWeek={12} /></MemoryRouter>)
  const region = await screen.findByRole('region', { name: 'Playoff outlook' })
  await within(region).findByText(/Next game: Week 13 · vs Jets/)
  expect(region).toHaveTextContent('40%80%40 pp')
  expect(within(region).getByRole('link')).toHaveAttribute('href', '/playoffs?tab=leverage&rules=madden&season=2&week=12')
  formats(region)
})

it('omits game scenarios when no regular-season games remain', async () => {
  render(<MemoryRouter><PlayoffOutlook teamId={1} season={2} /></MemoryRouter>)
  const region = await screen.findByRole('region', { name: 'Playoff outlook' })
  expect(region).toHaveTextContent('>99%')
  expect(region).not.toHaveTextContent('If lose')
  expect(client.getPlayoffLeverage).not.toHaveBeenCalled()
})

it('ignores late odds responses after changing season', async () => {
  let finish
  client.getPlayoffOdds.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  show('/playoffs?tab=odds&season=1')
  await waitFor(() => expect(client.getPlayoffOdds).toHaveBeenCalledWith(1, 'madden'))
  await userEvent.selectOptions(screen.getByLabelText('Season'), '2')
  await screen.findByRole('table', { name: 'AFC playoff odds' })
  await act(async () => finish({ ...odds(1), simulations: 123 }))
  expect(screen.getByText(/20,000 simulations/)).toBeInTheDocument()
  expect(screen.queryByText(/123 simulations/)).not.toBeInTheDocument()
})

it('exports the complete chart while the swing table export follows the small-swing filter', async () => {
  const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
  show('/playoffs?tab=leverage')
  await screen.findByRole('table', { name: 'Game swings' })
  await userEvent.click(within(screen.getByRole('region', { name: 'Win or lose chart' })).getByRole('button', { name: 'CSV' }))
  expect(csv.mock.lastCall[0].rows).toHaveLength(2)
  expect(csv.mock.lastCall[0].image.draw).toBeTypeOf('function')
  const tableCsv = within(screen.getByRole('region', { name: 'Swing table' })).getByRole('button', { name: 'CSV' })
  await userEvent.click(tableCsv)
  expect(csv.mock.lastCall[0].rows).toHaveLength(1)
  expect(csv.mock.lastCall[0].api.params).toEqual({ season: 2, rules: 'madden', week: 11 })
  await userEvent.click(screen.getByLabelText('Show small swings'))
  await userEvent.click(tableCsv)
  expect(csv.mock.lastCall[0].rows).toHaveLength(2)
  csv.mockRestore()
})
