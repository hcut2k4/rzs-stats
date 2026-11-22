import { cloneElement } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import OddsTab from '../components/playoffs/OddsTab'
import OddsHistory from '../components/playoffs/OddsHistory'
import PlayoffOutlook from '../components/team/PlayoffOutlook'
import * as client from '../api/client'
import * as exports from '../utils/exportTable'
import { clearLoadCache } from '../utils/useLoad'

import oddsFixture from './fixtures/playoffs/odds.json'
import clinchFixture from './fixtures/playoffs/clinch.json'
import historyFixture from './fixtures/playoffs/odds-history.json'
import championshipFixture from './fixtures/playoffs/championship.json'
import preplayoffFixture from './fixtures/playoffs/championship-preplayoff.json'

vi.mock('../api/client')
vi.mock('recharts', async importOriginal => ({
  ...await importOriginal(),
  ResponsiveContainer: ({ children }) => cloneElement(children, { width: 800, height: 288 }),
}))


const current = structuredClone(oddsFixture.conferences[0].teams.slice(0, 8).reverse())
current.at(-1).team.primaryColor = '16711680'
const teams = current.map(row => row.team)
const history = (season = 2) => ({ ...structuredClone(historyFixture), season,
  snapshots: [0, 1].map(i => ({ ...structuredClone(historyFixture.snapshots[0]), week: historyFixture.snapshots[0].week + i,
    teams: historyFixture.snapshots[0].teams.map(row => ({ ...row, playoffs: Math.min(1, row.playoffs + i / 10) })),
  })),
})
const championship = (season = 2, rules = 'madden') => ({ ...structuredClone(championshipFixture), season, rules })
const show = node => render(<MemoryRouter>{node}</MemoryRouter>)
const expand = async () => {
  await screen.findByRole('checkbox', { name: teams[0].displayName })
}
const formats = region => {
  for (const name of ['XLSX', 'CSV', 'PNG', 'AI']) expect(within(region).getByRole('button', { name })).toBeInTheDocument()
}

beforeEach(() => {
  vi.resetAllMocks()
  clearLoadCache()
  client.getPlayoffOdds.mockResolvedValue(oddsFixture)
  client.getPlayoffClinch.mockResolvedValue({ ...clinchFixture, teams: [] })
  client.getPlayoffOddsHistory.mockImplementation(async season => history(season))
  client.getPlayoffChampionship.mockImplementation(async (season, rules) => championship(season, rules))
})

it('defaults to the top six teams, searches all teams and changes the chart goal without refetching history', async () => {
  show(<OddsHistory season={2} currentTeams={current.slice().reverse()} />)
  await expand()
  expect(screen.getAllByRole('checkbox').filter(c => c.checked)).toHaveLength(6)
  expect(screen.getByRole('checkbox', { name: teams[0].displayName })).not.toBeChecked()
  expect(screen.getByRole('checkbox', { name: teams[1].displayName })).not.toBeChecked()
  for (let i = 3; i <= 8; i++) expect(screen.getByRole('checkbox', { name: teams[i - 1].displayName })).toBeChecked()
  const chart = screen.getByRole('img', { name: /Playoffs probability history:/ })
  expect(chart.querySelectorAll('.recharts-line-curve')).toHaveLength(6)
  expect(chart.querySelector('[stroke="#ff0000"]')).toBeInTheDocument()
  expect(within(chart).getByText('Week 17')).toBeInTheDocument()
  expect(within(chart).getByText('Week 18')).toBeInTheDocument()
  expect(within(chart).queryByText('Week 16')).not.toBeInTheDocument()
  expect(within(chart).getByText('100%')).toBeInTheDocument()
  const playoffPath = chart.querySelector('.recharts-line-curve').getAttribute('d')
  await userEvent.selectOptions(screen.getByLabelText('History goal'), 'division')
  expect(screen.getByRole('img', { name: /Division probability history:/ }).querySelector('.recharts-line-curve').getAttribute('d')).not.toBe(playoffPath)
  await userEvent.selectOptions(screen.getByLabelText('History goal'), 'oneSeed')
  expect(screen.getByRole('img', { name: /No. 1 seed probability history:/ })).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Search teams'), teams[0].abbrName)
  expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  await userEvent.click(screen.getByRole('checkbox', { name: teams[0].displayName }))
  expect(screen.getByRole('img', { name: /probability history:/ })).toHaveAttribute('aria-label', expect.stringContaining(teams[0].displayName))
  expect(client.getPlayoffOddsHistory).toHaveBeenCalledExactlyOnceWith(2)
})

it.each([0])('shows the history starting message for %i snapshots', async count => {
  client.getPlayoffOddsHistory.mockResolvedValue({ ...history(), snapshots: history().snapshots.slice(0, count) })
  show(<OddsHistory season={2} currentTeams={current} />)
  expect(await screen.findByText('History starts building after the first sync of the season')).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: /probability history:/ })).not.toBeInTheDocument()
})

it('exports a weeks-by-selected-teams table for the selected goal with a chart image', async () => {
  const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
  show(<OddsHistory season={2} currentTeams={current} />)
  await expand()
  const region = screen.getByRole('region', { name: 'Probability over time' })
  formats(region)
  await userEvent.selectOptions(screen.getByLabelText('History goal'), 'division')
  await userEvent.click(within(region).getByRole('button', { name: 'CSV' }))
  const spec = csv.mock.lastCall[0]
  expect(spec.rows.map(r => r.week)).toEqual([16, 17])
  expect(spec.cols.map(c => c.label)).toEqual(['Week', ...teams.slice(2).map(t => t.abbrName).sort()])
  expect(spec.cols[1].text(spec.rows[0])).toBe('69%')
  expect(spec.cols[1].value(spec.rows[0])).toBe(.69)
  expect(spec.cols[1].z).toBe('0%')
  expect(spec.api.params).toEqual({ season: 2 })
  expect(spec.image.draw).toBeTypeOf('function')
  csv.mockRestore()
})

it('folds championship chances into each conference table and switches to history', async () => {
  show(<OddsTab season={2} rules="madden" />)
  const table = await screen.findByRole('table', { name: 'AFC playoff probability' })
  await waitFor(() => expect(within(table).getByRole('link', { name: 'CIN' }).closest('tr')).toHaveTextContent('25%14%'))
  expect(screen.queryByRole('table', { name: 'Title probability' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Over time' }))
  await screen.findByRole('table', { name: 'Probability history data' })
  expect(screen.queryByRole('table', { name: 'AFC playoff probability' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Team line legend').querySelectorAll('line')).toHaveLength(6)
})

it('adds a title funnel and an area history chart to the team outlook', async () => {
  show(<PlayoffOutlook teamId={teams[0].teamId} season={2} />)
  await waitFor(() => expect(screen.getByLabelText('Title probability funnel')).toHaveTextContent('Champion2%'))
  const spark = await screen.findByRole('img', { name: /Playoff probability went from/ })
  expect(spark.querySelector('polyline')).toHaveAttribute('points', '12,61.2 308,53.400000000000006')
})

it.each(['failed', 'short', 'missing'])('keeps the team outlook while hiding unavailable extras: %s', async mode => {
  if (mode === 'failed') {
    client.getPlayoffChampionship.mockRejectedValue(new Error('Unavailable'))
    client.getPlayoffOddsHistory.mockRejectedValue(new Error('Unavailable'))
  } else {
    client.getPlayoffChampionship.mockResolvedValue({ ...championship(), teams: [] })
    client.getPlayoffOddsHistory.mockResolvedValue({ ...history(), snapshots: mode === 'short' ? history().snapshots.slice(0, 1) : [] })
  }
  show(<PlayoffOutlook teamId={teams[0].teamId} season={2} />)
  await screen.findByRole('region', { name: 'Playoff outlook' })
  await act(async () => {})
  expect(screen.queryByText(/Title probability/)).not.toBeInTheDocument()
  expect(screen.queryByRole('img', { name: /Playoff probability went from/ })).not.toBeInTheDocument()
})

it('ignores a late championship response from a previous season', async () => {
  let finish
  client.getPlayoffChampionship.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const view = show(<OddsTab season={1} rules="madden" />)
  await waitFor(() => expect(client.getPlayoffChampionship).toHaveBeenCalledWith(1, 'madden'))
  view.rerender(<MemoryRouter><OddsTab season={2} rules="madden" /></MemoryRouter>)
  await screen.findByRole('table', { name: 'AFC playoff probability' })
  await act(async () => finish({ ...championship(1, 'nfl'), teams: [{ ...championship().teams[0], team: { ...teams[0], displayName: 'Old team' } }] }))
  expect(screen.queryByText('Old team')).not.toBeInTheDocument()
})

it.each([[[null, 0]], [[null]], [[0, 0]]])('renders finite history charts and exports final snapshots last: %j', async weeks => {
  const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
  client.getPlayoffOddsHistory.mockResolvedValue({ ...history(), snapshots: weeks.map((week, i) => ({ ...history().snapshots[0], week, teams: [{ ...history().snapshots[0].teams.find(row => row.team.teamId === teams[0].teamId), playoffs: .6 + i / 10 }] })) })
  show(<OddsHistory season={2} currentTeams={current.slice(0, 1)} />)
  await expand()
  const chart = screen.getByRole('img', { name: /Playoffs probability history:/ })
  expect(chart.innerHTML).not.toMatch(/NaN|Infinity/)
  if (weeks.includes(null)) expect(within(chart).getByText('Final')).toBeInTheDocument()
  await userEvent.click(within(screen.getByRole('region', { name: 'Probability over time' })).getByRole('button', { name: 'CSV' }))
  const spec = csv.mock.lastCall[0]
  if (weeks.includes(null)) {
    expect(spec.rows.at(-1).week).toBeNull()
    expect(spec.cols[0].text(spec.rows.at(-1))).toBe('Final')
    const workbook = exports.buildWorkbook(spec)
    expect(workbook.Sheets[workbook.SheetNames[0]][`A${spec.rows.length + 1}`]).toMatchObject({ t: 's', v: 'Final' })
  }
  const coords = []
  const ctx = new Proxy({}, { get: (_, key) => (...args) => { if (['moveTo', 'lineTo', 'arc'].includes(key)) coords.push(...args) }, set: () => true })
  spec.image.draw(ctx, 800).draw(ctx)
  expect(coords.length).toBeGreaterThan(0)
  expect(coords.every(Number.isFinite)).toBe(true)
  csv.mockRestore()
})

it.each([[[null, 0]], [[0, 0]], [[null]]])('keeps the outlook sparkline finite for final or repeated weeks: %j', async weeks => {
  client.getPlayoffOddsHistory.mockResolvedValue({ ...history(), snapshots: weeks.map((week, i) => ({ ...history().snapshots[i % 2], week })) })
  show(<PlayoffOutlook teamId={teams[0].teamId} season={2} />)
  await screen.findByLabelText('Title probability funnel')
  await act(async () => {})
  const spark = screen.queryByRole('img', { name: /Playoff probability went from/ })
  if (weeks.length === 1) expect(spark).not.toBeInTheDocument()
  else {
    expect(spark.querySelector('polyline').getAttribute('points')).not.toMatch(/NaN|Infinity/)
    if (weeks.includes(null)) expect(spark.querySelector('polyline')).toHaveAttribute('points', '12,53.400000000000006 308,61.2')
  }
})

it('labels the frozen pre-playoff projection and keeps its table', async () => {
  client.getPlayoffChampionship.mockResolvedValue(preplayoffFixture)
  show(<OddsTab season={2} rules="madden" />)
  expect(await screen.findAllByText('Pre-playoff projection')).toHaveLength(2)
  expect(screen.getAllByText('Pre-playoff projection')[0].closest('[title]')).toHaveAttribute('title', expect.stringContaining('Ratings are frozen'))
  expect(screen.getByRole('table', { name: 'AFC playoff probability' })).toBeInTheDocument()
})

it('shows selected teams and whole percentages in an expandable history table with Final last', async () => {
  const data = history()
  data.snapshots.push({ ...data.snapshots[1], week: null })
  client.getPlayoffOddsHistory.mockResolvedValue(data)
  show(<OddsHistory season={2} currentTeams={current} />)
  await expand()
  const table = screen.getByRole('table', { name: 'Probability history data' })
  expect(within(table).getAllByRole('columnheader')).toHaveLength(7)
  expect(within(table).getAllByRole('row').at(-1)).toHaveTextContent('Final90%')
  expect(table).not.toHaveTextContent(teams[0].abbrName)
  const chart = screen.getByRole('img', { name: /Playoffs probability history:/ })
  expect(chart.querySelectorAll('path[stroke-dasharray]').length).toBeGreaterThan(1)
})

it('describes the sparkline and exposes its underlying weekly percentages', async () => {
  show(<PlayoffOutlook teamId={teams[0].teamId} season={2} />)
  expect(await screen.findByRole('img', { name: /Playoff probability went from 60% to 70% over 2 snapshots/ })).toBeInTheDocument()
  await userEvent.click(screen.getByText('Show data'))
  const table = screen.getByRole('table', { name: 'Playoff outlook history data' })
  expect(table).toHaveTextContent('Week 1760%')
  expect(table).toHaveTextContent('Week 1870%')
})
