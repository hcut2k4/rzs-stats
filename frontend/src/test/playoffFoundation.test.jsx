import { cloneElement } from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
  ['leverage', 'Game swings'], ['whatif', 'AFC scenario probabilities'],
])('uses probability language in the %s tab, including accessible labels', async (tab, table) => {
  const { container } = render(<MemoryRouter initialEntries={[`/playoffs?tab=${tab}&rules=nfl`]}><PlayoffsPage /></MemoryRouter>)
  await screen.findByRole('table', { name: table })
  if (tab === 'probability') {
    await waitFor(() => expect(client.getPlayoffChampionship).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Over time' }))
    await screen.findByRole('table', { name: 'Probability history data', hidden: true })
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
  await screen.findByRole('table', { name: 'AFC final seeds' })
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
  assertLanguage(container)
  expect(client.getPlayoffPath).toHaveBeenCalledWith('BUF', 2, 'madden')
  await waitFor(() => expect(screen.getByRole('link', { name: /Load win out/ })).toBeInTheDocument())
  expect(screen.getByRole('link', { name: /Load win out/ })).not.toHaveAttribute('href', expect.stringContaining('rules='))
})

it('uses probability language in the team outlook', async () => {
  const { container } = render(<MemoryRouter><PlayoffOutlook teamId={odds.conferences[0].teams[0].team.teamId} season={2} nextWeek={16} /></MemoryRouter>)
  await screen.findByText(/Title probability/)
  assertLanguage(container)
})

it.each([AboutPage, ChangelogPage])('uses probability language in the public explanatory pages: %s', Page => {
  const { container } = render(<MemoryRouter><Page /></MemoryRouter>)
  assertLanguage(container)
})
