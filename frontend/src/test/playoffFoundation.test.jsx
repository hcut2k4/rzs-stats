import { cloneElement } from 'react'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import PlayoffsPage from '../pages/PlayoffsPage'
import PlayoffPathPage from '../pages/PlayoffPathPage'
import PlayoffOutlook from '../components/team/PlayoffOutlook'
import AboutPage from '../pages/AboutPage'
import ChangelogPage from '../pages/ChangelogPage'
import { SeedBar } from '../components/playoffs/SeedBar'
import SeedLegend from '../components/playoffs/SeedLegend'
import { SEED_COLORS } from '../utils/playoffOdds'
import { clearLoadCache } from '../utils/useLoad'
import * as client from '../api/client'
import picture from './fixtures/playoffs/picture.json'
import odds from './fixtures/playoffs/odds.json'
import leverage from './fixtures/playoffs/leverage.json'
import remaining from './fixtures/playoffs/remaining.json'
import scenario from './fixtures/playoffs/simulate.json'
import exact from './fixtures/playoffs/simulate-exact.json'
import path from './fixtures/playoffs/path.json'
import championship from './fixtures/playoffs/championship.json'
import history from './fixtures/playoffs/odds-history.json'
import clinch from './fixtures/playoffs/clinch.json'
import calibration from './fixtures/playoffs/calibration.json'

vi.mock('../api/client')
vi.mock('recharts', async importOriginal => ({
  ...await importOriginal(),
  ResponsiveContainer: ({ children }) => cloneElement(children, { width: 800, height: 288 }),
}))
beforeEach(() => {
  vi.resetAllMocks()
  clearLoadCache()
  client.getSeasons.mockResolvedValue([2])
  client.getPlayoffPicture.mockResolvedValue(picture)
  client.getPlayoffOdds.mockResolvedValue(odds)
  client.getPlayoffLeverage.mockResolvedValue(leverage)
  client.getPlayoffRemaining.mockResolvedValue(remaining)
  client.simulatePlayoffs.mockResolvedValue(scenario)
  client.getPlayoffPath.mockResolvedValue(path)
  client.getPlayoffChampionship.mockResolvedValue(championship)
  client.getPlayoffOddsHistory.mockResolvedValue(history)
  client.getPlayoffClinch.mockResolvedValue(clinch)
  client.getPlayoffCalibration.mockResolvedValue(calibration)
})
const assertTableStyle = container => {
  const tables = container.querySelectorAll('table')
  expect(tables.length).toBeGreaterThan(0)
  for (const table of tables) {
    expect(table).toHaveClass('w-full', 'text-sm', 'num')
    expect(table.parentElement).toHaveClass('overflow-x-auto', 'border-y', 'border-rule')
    expect(table.tHead.rows[0]).toHaveClass('border-b', 'border-rule')
    expect(table.tHead.querySelectorAll('[aria-sort]').length).toBe(table.tHead.rows[0].cells.length)
    const rows = [...table.tBodies[0].rows].filter(row => row.querySelector('td'))
    rows.forEach((row, i) => expect(row).toHaveClass('border-t', 'border-line', i % 2 ? 'bg-surface' : 'bg-bg'))
  }
}

const assertLanguage = container => {
  expect(container.textContent).not.toMatch(/\bodds\b/i)
  for (const node of container.querySelectorAll('[aria-label], [title]')) {
    expect(node.getAttribute('aria-label') ?? '').not.toMatch(/\bodds\b/i)
    expect(node.getAttribute('title') ?? '').not.toMatch(/\bodds\b/i)
  }
  expect(container.textContent).not.toMatch(/Real NFL|Why different rules/)
}

it('labels all seven seed colours and separates division winners from wild cards', () => {
  const seedOdds = [.1, .1, .1, .1, .1, .1, .1]
  const { container } = render(<><SeedLegend /><SeedBar seedOdds={seedOdds} size={140} /></>)
  expect(container).toHaveTextContent('Division winners1234·Wild cards567')
  const bar = screen.getByRole('img', { name: /Seed 1: 10%.*Seed 7: 10%/ })
  expect(bar.style.width).toBe('140px')
  expect(bar).toHaveAttribute('title', bar.getAttribute('aria-label'))
  expect(bar.children).toHaveLength(7)
  Array.from(bar.children).forEach((segment, i) => {
    expect(segment.style.width).toBe('10%')
    expect(segment).toHaveStyle({ background: SEED_COLORS[i] })
    expect(segment).toHaveAttribute('title', `Seed ${i + 1}: 10%`)
  })
  expect(bar.children[4].style.borderLeftWidth).toBe('2px')
  expect(bar.children[3].style.borderLeftWidth).toBe('')
})

it.each([
  ['picture', 'AFC playoff picture'], ['probability', 'AFC playoff probability'],
  ['leverage', 'Game swings'], ['whatif', 'Scenario probabilities'],
])('uses probability language in the %s tab, including accessible labels', async (tab, table) => {
  const { container } = render(<MemoryRouter initialEntries={[`/playoffs?tab=${tab}&rules=nfl`]}><PlayoffsPage /></MemoryRouter>)
  await screen.findByRole('table', { name: table })
  assertTableStyle(container)
  if (tab === 'probability') {
    await waitFor(() => expect(client.getPlayoffChampionship).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Over time' }))
    await screen.findByRole('table', { name: 'Probability history data', hidden: true })
    assertTableStyle(container)
    fireEvent.click(screen.getByText('How accurate are these probabilities?'))
    await screen.findByRole('table', { name: 'Calibration buckets' })
    assertTableStyle(container)
  }
  assertLanguage(container)
  expect(screen.queryByRole('group', { name: 'Tiebreak rules' })).not.toBeInTheDocument()
  for (const method of ['getPlayoffPicture', 'getPlayoffOdds', 'getPlayoffChampionship', 'getPlayoffClinch']) {
    for (const call of client[method].mock.calls) expect(call[1]).toBe('madden')
  }
  for (const call of client.getPlayoffLeverage.mock.calls) expect(call[2]).toBe('madden')
  for (const [request] of client.simulatePlayoffs.mock.calls) expect(request.rules).toBe('madden')
})

it('keeps exact What-If seeds free of comparison copy', async () => {
  client.simulatePlayoffs.mockResolvedValue(exact)
  const { container } = render(<MemoryRouter initialEntries={['/playoffs?tab=whatif']}><PlayoffsPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Final seeds' }))
  await screen.findByRole('table', { name: 'AFC final seeds' })
  assertTableStyle(container)
  assertLanguage(container)
})

it('reads legacy probability links and writes the canonical tab without rules', async () => {
  function Location() { return <output data-testid="location">{useLocation().search}</output> }
  render(<MemoryRouter initialEntries={['/playoffs?tab=odds&rules=nfl&season=2']}><PlayoffsPage /><Location /></MemoryRouter>)
  await screen.findByRole('table', { name: 'AFC playoff probability' })
  expect(screen.getByRole('tab', { name: 'Probability', selected: true })).toBeInTheDocument()
  expect(screen.getByTestId('location')).toHaveTextContent('?tab=probability&season=2')
  expect(client.getPlayoffOdds).toHaveBeenCalledWith(2, 'madden')
})

it('uses probability language in the Path page and ignores old rules', async () => {
  const { container } = render(<MemoryRouter initialEntries={['/playoffs/BUF?season=2&rules=nfl']}><Routes><Route path="/playoffs/:abbr" element={<PlayoffPathPage />} /></Routes></MemoryRouter>)
  await screen.findByRole('table', { name: 'Seed distribution' })
  assertTableStyle(container)
  assertLanguage(container)
  expect(client.getPlayoffPath).toHaveBeenCalledWith('BUF', 2, 'madden')
  await waitFor(() => expect(screen.getByRole('link', { name: /Load win out/ })).toBeInTheDocument())
  expect(screen.getByRole('link', { name: /Load win out/ })).not.toHaveAttribute('href', expect.stringContaining('rules='))
})

it('uses probability language in the team outlook', async () => {
  const { container } = render(<MemoryRouter><PlayoffOutlook teamId={odds.conferences[0].teams[0].team.teamId} season={2} nextWeek={16} /></MemoryRouter>)
  await screen.findByLabelText('Title probability funnel')
  await waitFor(() => expect(screen.getByRole('table', { name: 'Playoff outlook history data', hidden: true })).toBeInTheDocument())
  assertTableStyle(container)
  assertLanguage(container)
})

it.each([AboutPage, ChangelogPage])('uses probability language in the public explanatory pages: %s', Page => {
  const { container } = render(<MemoryRouter><Page /></MemoryRouter>)
  assertLanguage(container)
})

it.each(['AFC', 'NFC'])('restores %s conference focus from the URL at full width', async conf => {
  render(<MemoryRouter initialEntries={[`/playoffs?tab=probability&conf=${conf}`]}><PlayoffsPage /></MemoryRouter>)
  const table = await screen.findByRole('table', { name: `${conf} playoff probability` })
  expect(screen.queryByRole('table', { name: `${conf === 'AFC' ? 'NFC' : 'AFC'} playoff probability` })).not.toBeInTheDocument()
  expect(table.closest('section').parentElement).toHaveClass('grid-cols-1')
  expect(table.closest('section').parentElement).not.toHaveClass('xl:grid-cols-2')
  expect(within(screen.getByRole('group', { name: 'Conference focus' })).getByRole('button', { name: conf })).toHaveAttribute('aria-pressed', 'true')
  expect(table.querySelector('[role="img"]').style.width).toBe('112px')
  expect(within(table).getAllByRole('columnheader')).toHaveLength(8)
})

it('ignores unknown conference focus, persists selections and clears Both from the URL', async () => {
  function Location() { return <output data-testid="location">{useLocation().search}</output> }
  render(<MemoryRouter initialEntries={['/playoffs?tab=probability&season=2&conf=unknown']}><PlayoffsPage /><Location /></MemoryRouter>)
  const afc = await screen.findByRole('table', { name: 'AFC playoff probability' })
  expect(screen.getByRole('table', { name: 'NFC playoff probability' })).toBeInTheDocument()
  expect(afc.closest('section').parentElement).toHaveClass('xl:grid-cols-2')
  const control = screen.getByRole('group', { name: 'Conference focus' })
  expect(within(control).getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(within(control).getByRole('button', { name: 'NFC' }))
  expect(screen.getByTestId('location')).toHaveTextContent('conf=NFC')
  expect(screen.getByTestId('location')).toHaveTextContent('season=2')
  fireEvent.click(screen.getByRole('button', { name: 'Over time' }))
  await screen.findByRole('table', { name: 'Probability history data' })
  expect(screen.queryByRole('group', { name: 'Conference focus' })).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: 'BUF' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Table', exact: true }))
  expect(screen.queryByRole('table', { name: 'AFC playoff probability' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Both' }))
  expect(screen.getByTestId('location')).not.toHaveTextContent('conf=')
  expect(screen.getByRole('table', { name: 'AFC playoff probability' })).toBeInTheDocument()
})

it('hides conference focus for a single conference', async () => {
  client.getPlayoffOdds.mockResolvedValue({ ...odds, conferences: [odds.conferences[0]] })
  render(<MemoryRouter initialEntries={['/playoffs?tab=probability']}><PlayoffsPage /></MemoryRouter>)
  await screen.findByRole('table', { name: 'AFC playoff probability' })
  expect(screen.queryByRole('group', { name: 'Conference focus' })).not.toBeInTheDocument()
})
