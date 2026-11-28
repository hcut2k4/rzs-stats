import { cloneElement } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import PlayoffsPage from '../pages/PlayoffsPage'
import * as client from '../api/client'
import * as exports from '../utils/exportTable'
import { clearLoadCache } from '../utils/useLoad'
import { probShade, chanceShade } from '../utils/playoffOdds'
import picture from './fixtures/playoffs/picture.json'
import odds from './fixtures/playoffs/odds.json'
import championship from './fixtures/playoffs/championship.json'
import preplayoff from './fixtures/playoffs/championship-preplayoff.json'
import history from './fixtures/playoffs/odds-history.json'
import clinch from './fixtures/playoffs/clinch.json'
import calibration from './fixtures/playoffs/calibration.json'

vi.mock('../api/client')
vi.mock('recharts', async original => ({ ...await original(), ResponsiveContainer: ({ children }) => cloneElement(children, { width: 800, height: 288 }) }))
const show = tab => render(<MemoryRouter initialEntries={[`/playoffs?tab=${tab}`]}><PlayoffsPage /></MemoryRouter>)
const bodyRows = table => within(table).getAllByRole('row').filter(r => within(r).queryAllByRole('cell').length)
const displayedTeams = table => bodyRows(table).map(r => within(r).getByRole('link').textContent)
const tableRegion = table => within(table.closest('section'))
beforeEach(() => {
  vi.resetAllMocks()
  clearLoadCache()
  client.getSeasons.mockResolvedValue([2])
  client.getPlayoffPicture.mockResolvedValue(structuredClone(picture))
  client.getPlayoffOdds.mockResolvedValue(structuredClone(odds))
  client.getPlayoffChampionship.mockResolvedValue(structuredClone(championship))
  client.getPlayoffOddsHistory.mockResolvedValue(structuredClone(history))
  client.getPlayoffClinch.mockResolvedValue({ ...clinch, teams: [] })
  client.getPlayoffCalibration.mockResolvedValue(structuredClone(calibration))
})

it.each(['picture', 'probability'])('sorts every %s column and exports the displayed order', async tab => {
  const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
  show(tab)
  const table = await screen.findByRole('table', { name: tab === 'picture' ? 'AFC playoff picture' : 'AFC playoff probability' })
  await waitFor(() => expect(client.getPlayoffClinch).toHaveBeenCalled())
  const headers = within(table).getAllByRole('columnheader').filter(h => h.hasAttribute('aria-sort'))
  for (const header of headers) {
    await userEvent.click(within(header).getByRole('button'))
    expect(header).not.toHaveAttribute('aria-sort', 'none')
    if (tab === 'picture') expect(within(table).queryByRole('columnheader', { name: 'In the hunt' })).not.toBeInTheDocument()
    await userEvent.click(tableRegion(table).getByTitle('Download every row of the table, in its current sort and columns, as CSV'))
    const exported = csv.mock.lastCall[0].rows
    expect(exported.map(r => r.team.displayName)).toEqual(displayedTeams(table))
    const key = header.textContent.replace(/[▲▼]/g, '').trim()
    const values = exported.map(r => {
      if (key === 'Team') return r.team.displayName
      if (key === 'Seed') return r.seed ?? r.rank
      if (key === 'Record') return (r.wins + (r.ties ?? 0) / 2) / (r.wins + r.losses + (r.ties ?? 0) || 1)
      if (key === 'Position') return r.seed == null ? 'In the hunt' : r.divisionWinner ? 'Division leader' : 'Wild card'
      if (key === 'Tiebreak') return r.reasons.join(' ')
      if (key === 'Seeds') return r.seedOdds.reduce((n, p, i) => n + p * (8 - i), 0)
      const field = { Playoffs: 'playoffs', 'Playoff probability': 'playoffs', Division: 'division', 'No. 1 seed': 'oneSeed' }[key]
      if (field) return r.odds[field]
      return r.title?.[key === 'Title' ? 'champion' : 'final']
    }).filter(v => v != null)
    const ascending = header.getAttribute('aria-sort') === 'ascending'
    expect(values).toEqual([...values].sort((a, b) => (typeof a === 'string' ? a.localeCompare(b) : a - b) * (ascending ? 1 : -1)))
    await userEvent.click(within(header).getByRole('button'))
    await userEvent.click(tableRegion(table).getByTitle('Download every row of the table, in its current sort and columns, as CSV'))
    expect(csv.mock.lastCall[0].rows.map(r => r.team.displayName)).toEqual(displayedTeams(table))
  }
  expect(screen.queryByLabelText('Clinch key')).not.toBeInTheDocument()
  const teamHeader = headers[tab === 'picture' ? 1 : 0]
  await userEvent.click(within(teamHeader).getByRole('button'))
  const teams = displayedTeams(table)
  expect(teams).toEqual([...teams].sort((a, b) => teamHeader.getAttribute('aria-sort') === 'ascending' ? a.localeCompare(b) : b.localeCompare(a)))
  csv.mockRestore()
}, 45000)

it('shows the hunt divider only while seed order is ascending', async () => {
  show('picture')
  const table = await screen.findByRole('table', { name: 'AFC playoff picture' })
  expect(within(table).getByRole('columnheader', { name: 'In the hunt' })).toBeInTheDocument()
  const seed = within(table).getByRole('button', { name: /^Seed/ })
  await userEvent.click(seed)
  expect(within(table).queryByText('In the hunt', { selector: 'th' })).not.toBeInTheDocument()
  await userEvent.click(seed)
  expect(within(table).getByText('In the hunt', { selector: 'th' })).toBeInTheDocument()
})

it.each(['picture', 'probability'])('shades near-certain and unlikely playoff chances in %s', async tab => {
  const data = structuredClone(tab === 'picture' ? picture : odds)
  const teams = tab === 'picture' ? data.conferences[0].seeds : data.conferences[0].teams
  teams[0].odds.playoffs = .99
  teams[1].odds.playoffs = .01
  client[tab === 'picture' ? 'getPlayoffPicture' : 'getPlayoffOdds'].mockResolvedValue(data)
  show(tab)
  const table = await screen.findByRole('table', { name: tab === 'picture' ? 'AFC playoff picture' : 'AFC playoff probability' })
  for (const [i, p] of [[0, .99], [1, .01]]) {
    const row = within(table).getByRole('link', { name: teams[i].team.displayName }).closest('tr')
    expect(within(row).getByText(`${p * 100}%`).closest('td')).toHaveStyle({ background: probShade(p) })
  }
})

it('uses proven markers when shading playoff probabilities', async () => {
  const team = odds.conferences[0].teams[0].team
  client.getPlayoffClinch.mockResolvedValue({ ...clinch, teams: [{ ...clinch.teams[0], team, playoffs: 'eliminated' }] })
  show('probability')
  const table = await screen.findByRole('table', { name: 'AFC playoff probability' })
  const row = within(table).getByRole('link', { name: team.displayName }).closest('tr')
  await waitFor(() => expect(within(row).getAllByRole('cell')[2]).toHaveStyle({ background: probShade(0) }))
})

it('folds championship chances, round tooltips and export fields into the conference table', async () => {
  const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
  show('probability')
  const table = await screen.findByRole('table', { name: 'AFC playoff probability' })
  const team = championship.teams.find(t => t.conference === 'AFC')
  const row = within(table).getByRole('link', { name: team.team.displayName }).closest('tr')
  await waitFor(() => expect(within(row).getAllByRole('cell')[5]).toHaveTextContent(`${Math.round(team.final * 100)}%`))
  expect(within(row).getAllByRole('cell')[5]).toHaveStyle({ background: chanceShade(team.final) })
  expect(within(row).getAllByRole('cell')[6]).toHaveStyle({ background: chanceShade(team.champion) })
  expect(row.querySelector('[title^="Reach round 2:"]')).toHaveAttribute('title', `Reach round 2: ${Math.round(team.round2 * 100)}%; conference final: ${Math.round(team.conferenceFinal * 100)}%.`)
  expect(screen.queryByRole('table', { name: 'Title probability' })).not.toBeInTheDocument()
  expect(screen.getAllByLabelText('Seed colours')).toHaveLength(1)
  await userEvent.click(tableRegion(table).getByTitle('Download every row of the table, in its current sort and columns, as CSV'))
  const spec = csv.mock.lastCall[0]
  const exported = spec.rows.find(r => r.team.teamId === team.team.teamId)
  for (const [label, key] of [['Conf. title', 'final'], ['Title', 'champion'], ['Reach round 2', 'round2'], ['Conference final', 'conferenceFinal']]) expect(spec.cols.find(c => c.label === label).value(exported)).toBe(team[key])
  csv.mockRestore()
})

it('keeps conference probabilities visible with dashes when championship fails', async () => {
  client.getPlayoffChampionship.mockRejectedValue(new Error('unavailable'))
  show('probability')
  const table = await screen.findByRole('table', { name: 'AFC playoff probability' })
  await screen.findByText(/Title probabilities unavailable/)
  expect(bodyRows(table)).toHaveLength(16)
  for (const row of bodyRows(table)) for (const index of [5, 6]) expect(within(row).getAllByRole('cell')[index]).toHaveTextContent('—')
})

it('labels frozen projections in the Title header with an explanation', async () => {
  client.getPlayoffChampionship.mockResolvedValue(preplayoff)
  show('probability')
  await screen.findAllByText('Pre-playoff projection')
  for (const chip of screen.getAllByText('Pre-playoff projection')) {
    expect(chip.closest('th')).toHaveTextContent('Title')
    expect(chip.closest('[title]')).toHaveAttribute('title', expect.stringContaining('Ratings are frozen'))
  }
})

it('switches to history with a real legend and exports its sorted data table', async () => {
  const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
  show('probability')
  await screen.findByRole('table', { name: 'AFC playoff probability' })
  expect(client.getPlayoffOddsHistory).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Over time' }))
  const table = await screen.findByRole('table', { name: 'Probability history data' })
  expect(screen.queryByRole('table', { name: 'AFC playoff probability' })).not.toBeInTheDocument()
  const legend = screen.getByLabelText('Team line legend')
  expect(legend.querySelectorAll('line')).toHaveLength(6)
  expect(legend.querySelector('line[stroke-dasharray]:not([stroke-dasharray=""])')).toBeInTheDocument()
  for (const header of within(table).getAllByRole('columnheader')) {
    await userEvent.click(within(header).getByRole('button'))
    await userEvent.click(tableRegion(table).getByTitle('Download every row of the table, in its current sort and columns, as CSV'))
    expect(csv.mock.lastCall[0].rows.map(r => r.label)).toEqual(bodyRows(table).map(r => within(r).getAllByRole('cell')[0].textContent))
  }
  await userEvent.click(screen.getByRole('button', { name: 'Table' }))
  expect(screen.getByRole('table', { name: 'AFC playoff probability' })).toBeInTheDocument()
  csv.mockRestore()
})

it('sorts accuracy buckets and exports the displayed order', async () => {
  const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
  show('probability')
  await screen.findByRole('table', { name: 'AFC playoff probability' })
  await userEvent.click(screen.getByText('How accurate are these probabilities?'))
  const table = await screen.findByRole('table', { name: 'Calibration buckets' })
  for (const header of within(table).getAllByRole('columnheader')) {
    await userEvent.click(within(header).getByRole('button'))
    await userEvent.click(within(table.closest('details')).getByTitle('Download every row of the table, in its current sort and columns, as CSV'))
    expect(csv.mock.lastCall[0].rows.map(r => String(r.games))).toEqual(bodyRows(table).map(r => within(r).getAllByRole('cell')[1].textContent))
  }
  csv.mockRestore()
})

it.each(['picture', 'probability'])('keeps %s clinch icons compact with the full proof explanation and a visible key', async tab => {
  const team = picture.conferences[0].seeds[0].team
  client.getPlayoffClinch.mockResolvedValue({ ...clinch, teams: [{ ...clinch.teams[0], team, playoffs: 'clinched', division: 'clinched', oneSeed: null }] })
  show(tab)
  const table = await screen.findByRole('table', { name: tab === 'picture' ? 'AFC playoff picture' : 'AFC playoff probability' })
  const row = within(table).getByRole('link', { name: team.displayName }).closest('tr')
  expect(await screen.findByLabelText('Clinch key')).toBeInTheDocument()
  const badge = await within(row).findByText('Clinched division')
  expect(badge.closest('[title]')).toHaveAttribute('title', expect.stringContaining('Clinched division. Guaranteed'))
  expect(within(row).getByText('Clinched division')).toHaveClass('sr-only')
})

it('keeps dark team lines visible and matches their legend styles', async () => {
  const data = structuredClone(odds)
  for (const row of data.conferences.flatMap(c => c.teams)) row.team.primaryColor = '0'
  client.getPlayoffOdds.mockResolvedValue(data)
  const snapshots = structuredClone(history)
  snapshots.snapshots.push({ ...structuredClone(snapshots.snapshots[0]), week: snapshots.snapshots[0].week + 1 })
  client.getPlayoffOddsHistory.mockResolvedValue(snapshots)
  show('probability')
  await screen.findByRole('table', { name: 'AFC playoff probability' })
  await userEvent.click(screen.getByRole('button', { name: 'Over time' }))
  await screen.findByRole('table', { name: 'Probability history data' })
  const chart = screen.getByRole('img', { name: /Playoffs probability history:/ })
  const legend = screen.getByLabelText('Team line legend')
  for (const line of legend.querySelectorAll('line')) {
    expect(line).toHaveAttribute('stroke', '#666666')
    expect(chart.querySelector(`path[stroke="${line.getAttribute('stroke')}"]`)).toBeInTheDocument()
  }
})
