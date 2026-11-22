import { cloneElement } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import OddsTab from '../components/playoffs/OddsTab'
import OddsHistory from '../components/playoffs/OddsHistory'
import ChampionshipOdds from '../components/playoffs/ChampionshipOdds'
import PlayoffOutlook from '../components/team/PlayoffOutlook'
import * as client from '../api/client'
import * as exports from '../utils/exportTable'
import { clearLoadCache } from '../utils/useLoad'

vi.mock('../api/client')
vi.mock('recharts', async importOriginal => ({
  ...await importOriginal(),
  ResponsiveContainer: ({ children }) => cloneElement(children, { width: 800, height: 288 }),
}))

const teams = Array.from({ length: 8 }, (_, i) => ({ teamId: i + 1, abbrName: `T${i + 1}`, displayName: `Team ${i + 1}`, ...(i === 7 ? { primaryColor: '16711680' } : {}) }))
const current = teams.map((team, i) => ({ team, odds: { playoffs: (i + 1) / 10, division: .2, oneSeed: .1 }, wins: 5, losses: 2, ties: 0, seedOdds: Array(7).fill(.1) }))
const history = (season = 2) => ({ season, snapshots: [3, 5].map((week, i) => ({ week, computedAt: '2026-11-22T03:00:00Z', simulations: 20000, teams: teams.map(team => ({ team, playoffs: .6 + i / 10, division: .3 + i / 10, oneSeed: .1 + i / 10 })) })) })
const championship = (season = 2, rules = 'madden') => ({ season, rules, simulations: 20000, computedAt: '2026-11-22T03:00:00Z', teams: [
  { team: teams[0], conference: 'AFC', playoffs: .999, round2: .7, conferenceFinal: .4, final: .2, champion: .001 },
  { team: teams[1], conference: 'NFC', playoffs: .8, round2: .6, conferenceFinal: .5, final: .4, champion: .234 },
] })
const show = node => render(<MemoryRouter>{node}</MemoryRouter>)
const expand = async () => {
  const summary = screen.getByText('Odds over time')
  summary.closest('details').open = true
  fireEvent(summary.closest('details'), new Event('toggle'))
  await screen.findByRole('checkbox', { name: 'Team 1' })
}
const formats = region => {
  for (const name of ['XLSX', 'CSV', 'PNG', 'AI']) expect(within(region).getByRole('button', { name })).toBeInTheDocument()
}

beforeEach(() => {
  vi.resetAllMocks()
  clearLoadCache()
  client.getPlayoffOdds.mockResolvedValue({ season: 2, rules: 'madden', simulations: 20000, computedAt: 'now', conferences: [{ name: 'AFC', teams: current }] })
  client.getPlayoffClinch.mockResolvedValue({ teams: [] })
  client.getPlayoffOddsHistory.mockImplementation(async season => history(season))
  client.getPlayoffChampionship.mockImplementation(async (season, rules) => championship(season, rules))
})

it('defaults to the top six teams, searches all teams and changes the chart goal without refetching history', async () => {
  show(<OddsHistory season={2} currentTeams={current.slice().reverse()} />)
  expect(client.getPlayoffOddsHistory).not.toHaveBeenCalled()
  await expand()
  expect(screen.getAllByRole('checkbox').filter(c => c.checked)).toHaveLength(6)
  expect(screen.getByRole('checkbox', { name: 'Team 1' })).not.toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Team 2' })).not.toBeChecked()
  for (let i = 3; i <= 8; i++) expect(screen.getByRole('checkbox', { name: `Team ${i}` })).toBeChecked()
  const chart = screen.getByRole('img', { name: /Playoffs odds history:/ })
  expect(chart.querySelectorAll('.recharts-line-curve')).toHaveLength(6)
  expect(chart.querySelector('[stroke="#ff0000"]')).toBeInTheDocument()
  expect(within(chart).getByText('Week 4')).toBeInTheDocument()
  expect(within(chart).getByText('Week 6')).toBeInTheDocument()
  expect(within(chart).queryByText('Week 5')).not.toBeInTheDocument()
  expect(within(chart).getByText('100%')).toBeInTheDocument()
  const playoffPath = chart.querySelector('.recharts-line-curve').getAttribute('d')
  await userEvent.selectOptions(screen.getByLabelText('History goal'), 'division')
  expect(screen.getByRole('img', { name: /Division odds history:/ }).querySelector('.recharts-line-curve').getAttribute('d')).not.toBe(playoffPath)
  await userEvent.selectOptions(screen.getByLabelText('History goal'), 'oneSeed')
  expect(screen.getByRole('img', { name: /No. 1 seed odds history:/ })).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Search teams'), 'T1')
  expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  await userEvent.click(screen.getByRole('checkbox', { name: 'Team 1' }))
  expect(screen.getByRole('img', { name: /odds history:/ })).toHaveAttribute('aria-label', expect.stringContaining('Team 1'))
  expect(client.getPlayoffOddsHistory).toHaveBeenCalledExactlyOnceWith(2)
})

it.each([0, 1])('shows the history starting message for %i snapshots', async count => {
  client.getPlayoffOddsHistory.mockResolvedValue({ season: 2, snapshots: history().snapshots.slice(0, count) })
  show(<OddsHistory season={2} currentTeams={current} />)
  const details = screen.getByText('Odds over time').closest('details')
  details.open = true
  fireEvent(details, new Event('toggle'))
  expect(await screen.findByText('History starts building after the first sync of the season')).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: /odds history:/ })).not.toBeInTheDocument()
})

it('exports a weeks-by-selected-teams table for the selected goal with a chart image', async () => {
  const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
  show(<OddsHistory season={2} currentTeams={current} />)
  await expand()
  const region = screen.getByRole('region', { name: 'Odds over time' })
  formats(region)
  await userEvent.selectOptions(screen.getByLabelText('History goal'), 'division')
  await userEvent.click(within(region).getByRole('button', { name: 'CSV' }))
  const spec = csv.mock.lastCall[0]
  expect(spec.rows.map(r => r.week)).toEqual([3, 5])
  expect(spec.cols.map(c => c.label)).toEqual(['Week', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'])
  expect(spec.cols[1].text(spec.rows[0])).toBe('30%')
  expect(spec.cols[1].value(spec.rows[0])).toBe(.3)
  expect(spec.cols[1].z).toBe('0%')
  expect(spec.api.params).toEqual({ season: 2 })
  expect(spec.image.draw).toBeTypeOf('function')
  csv.mockRestore()
})

it('sorts championship odds by champion and formats whole percent estimates with exports', async () => {
  const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
  show(<ChampionshipOdds season={1} rules="nfl" />)
  const table = await screen.findByRole('table', { name: 'Championship odds' })
  const rows = within(table).getAllByRole('row')
  expect(rows[1]).toHaveTextContent('Team 2NFC80%60%50%40%23%')
  expect(rows[2]).toHaveTextContent('Team 1AFC>99%70%40%20%<1%')
  expect(client.getPlayoffChampionship).toHaveBeenCalledExactlyOnceWith(1, 'nfl')
  const region = screen.getByRole('region', { name: 'Championship odds' })
  formats(region)
  await userEvent.click(within(region).getByRole('button', { name: 'CSV' }))
  expect(csv.mock.lastCall[0].rows[0].champion).toBe(.234)
  expect(csv.mock.lastCall[0].api.params).toEqual({ season: 1, rules: 'nfl' })
  csv.mockRestore()
})

it('places history and championship sections below the current odds tables', async () => {
  show(<OddsTab season={2} rules="madden" />)
  await screen.findByRole('table', { name: 'AFC playoff odds' })
  await screen.findByRole('table', { name: 'Championship odds' })
  expect(screen.getByText('Odds over time')).toBeInTheDocument()
})

it('adds title odds and a small history SVG to the team outlook', async () => {
  show(<PlayoffOutlook teamId={1} season={2} />)
  expect(await screen.findByText('Title odds <1%')).toBeInTheDocument()
  const spark = await screen.findByRole('img', { name: 'Playoff odds history' })
  expect(spark.querySelector('polyline')).toHaveAttribute('points', '3,15 157,12')
})

it.each(['failed', 'short', 'missing'])('keeps the team outlook while hiding unavailable extras: %s', async mode => {
  if (mode === 'failed') {
    client.getPlayoffChampionship.mockRejectedValue(new Error('Unavailable'))
    client.getPlayoffOddsHistory.mockRejectedValue(new Error('Unavailable'))
  } else {
    client.getPlayoffChampionship.mockResolvedValue({ ...championship(), teams: [] })
    client.getPlayoffOddsHistory.mockResolvedValue({ season: 2, snapshots: mode === 'short' ? history().snapshots.slice(0, 1) : [] })
  }
  show(<PlayoffOutlook teamId={1} season={2} />)
  await screen.findByRole('region', { name: 'Playoff outlook' })
  await act(async () => {})
  expect(screen.queryByText(/Title odds/)).not.toBeInTheDocument()
  expect(screen.queryByRole('img', { name: 'Playoff odds history' })).not.toBeInTheDocument()
})

it('ignores a late championship response from a previous season', async () => {
  let finish
  client.getPlayoffChampionship.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const view = show(<ChampionshipOdds season={1} rules="nfl" />)
  await waitFor(() => expect(client.getPlayoffChampionship).toHaveBeenCalledWith(1, 'nfl'))
  view.rerender(<MemoryRouter><ChampionshipOdds season={2} rules="madden" /></MemoryRouter>)
  await screen.findByRole('table', { name: 'Championship odds' })
  await act(async () => finish({ ...championship(1, 'nfl'), teams: [{ ...championship().teams[0], team: { ...teams[0], displayName: 'Old team' } }] }))
  expect(screen.queryByText('Old team')).not.toBeInTheDocument()
})
