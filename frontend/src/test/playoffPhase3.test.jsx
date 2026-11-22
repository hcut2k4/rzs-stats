import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import PlayoffsPage from '../pages/PlayoffsPage'
import PlayoffOutlook from '../components/team/PlayoffOutlook'
import WhatIfTab from '../components/playoffs/WhatIfTab'
import ClinchBadge, { markerOdds, useClinch } from '../components/playoffs/ClinchBadge'
import PlayoffPathPage from '../pages/PlayoffPathPage'
import { parsePicks, encodePicks, pathScenario } from '../utils/playoffScenario'
import { clearLoadCache } from '../utils/useLoad'
import * as client from '../api/client'
import * as exports from '../utils/exportTable'

import remainingFixture from './fixtures/playoffs/remaining.json'
import simulateFixture from './fixtures/playoffs/simulate.json'
import exactFixture from './fixtures/playoffs/simulate-exact.json'
import pathFixture from './fixtures/playoffs/path.json'
import scenariosFixture from './fixtures/playoffs/path-scenarios.json'
import clinchFixture from './fixtures/playoffs/clinch.json'
import oddsFixture from './fixtures/playoffs/odds.json'
import pictureFixture from './fixtures/playoffs/picture.json'

vi.mock('../api/client')

const games = remainingFixture.games.filter(g => [252, 258, 271].includes(g.gameId)).map(g => g.gameId === 258 ? { ...g, homeWinProb: .3 } : g)
const A = games[0].home
const B = games[0].away
const odds = { ...simulateFixture.conferences[0].teams[0].odds, playoffs: 1, division: 0.6, oneSeed: 0.2 }
const result = (extra = {}) => ({ ...structuredClone(simulateFixture), ...extra })
const path = () => ({ ...structuredClone(pathFixture), team: A,
  markers: { ...pathFixture.markers, playoffs: 'clinched' },
  winOut: { ...pathFixture.winOut, playoffs: .999 },
  winOutRisks: [{ ...games[2], rootFor: 'home', swing: -0.09 }],
})
function Where() { return <output data-testid="url">{useLocation().search}</output> }
const show = (search = '', season = 2) => render(<MemoryRouter initialEntries={[`/playoffs?tab=whatif${search}`]}><WhatIfTab season={season} rules="nfl" /><Where /></MemoryRouter>)
const formats = region => ['XLSX', 'CSV', 'PNG', 'AI'].forEach(name => expect(within(region).getByRole('button', { name })).toBeInTheDocument())
beforeEach(() => {
  vi.resetAllMocks()
  clearLoadCache()
  client.getPlayoffRemaining.mockResolvedValue({ ...remainingFixture, games })
  client.simulatePlayoffs.mockResolvedValue(result())
  client.getPlayoffPath.mockResolvedValue(path())
})
afterEach(() => vi.useRealTimers())

it('round trips compact picks and ignores malformed, unsafe and unknown ids', () => {
  const picks = parsePicks('252h,garbage,258x,99a,252t,258a,-271h,9007199254740993h', games)
  expect(picks).toEqual([{ gameId: 252, result: 'tie' }, { gameId: 258, result: 'away' }])
  expect(encodePicks(picks)).toBe('252t,258a')
  expect(parsePicks(encodePicks(picks), games)).toEqual(picks)
})
it('restores URL picks, opens next week and supports controls, favorites, wins out and clear', async () => {
  show('&picks=252t,999h,bad')
  expect(await screen.findByRole('button', { name: 'Tie', pressed: true })).toBeInTheDocument()
  expect(screen.getByText('Week 17').closest('details')).toHaveAttribute('open')
  expect(screen.getByText('Week 18').closest('details')).not.toHaveAttribute('open')
  await userEvent.click(screen.getAllByRole('button', { name: 'Home BUF' })[0])
  expect(screen.getByTestId('url')).toHaveTextContent('picks=252h')
  await userEvent.click(screen.getAllByRole('button', { name: 'Home BUF' })[0])
  expect(screen.getByTestId('url')).not.toHaveTextContent('picks=')
  await userEvent.click(screen.getByRole('button', { name: 'Pick favorites' }))
  expect(screen.getByTestId('url')).toHaveTextContent('picks=252h%2C258a%2C271a')
  await userEvent.selectOptions(screen.getByLabelText('Wins out team'), '1')
  await userEvent.click(screen.getByRole('button', { name: 'BUF wins out' }))
  expect(screen.getByTestId('url')).toHaveTextContent('picks=252h%2C258h%2C271a')
  await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
  await userEvent.click(screen.getAllByRole('button', { name: 'Pick favorites this week' })[0])
  expect(screen.getByTestId('url')).toHaveTextContent('picks=252h')
})
it('debounces simulation with only known picks and the current rules', async () => {
  vi.useFakeTimers()
  const data = result()
  data.conferences[0].teams[0].odds = { ...data.conferences[0].teams[0].odds, playoffs: 1, division: .6, oneSeed: .04 }
  data.conferences[0].teams[0].baseline = { ...data.conferences[0].teams[0].baseline, playoffs: .8, division: .595, oneSeed: .14 }
  client.simulatePlayoffs.mockResolvedValue(data)
  show('&picks=252h,99a,nope')
  await act(async () => {})
  await act(async () => vi.advanceTimersByTime(399))
  expect(client.simulatePlayoffs).not.toHaveBeenCalled()
  await act(async () => vi.advanceTimersByTime(1))
  expect(client.simulatePlayoffs).toHaveBeenCalledWith({ season: 2, rules: 'madden', picks: [{ gameId: 252, result: 'home' }] }, expect.any(AbortSignal))
  const region = screen.getByRole('region', { name: 'AFC What-If' })
  expect(region).toHaveTextContent('↑ 20 pp')
  expect(region).toHaveTextContent('↓ 10 pp')
  expect(region).not.toHaveTextContent('↑ 1 pp')
  formats(region)
})
it('shows exact final seeds, tiebreak reasons and scores explanation with exports', async () => {
  const data = structuredClone(exactFixture)
  data.conferences[0].seeds = [{ ...data.conferences[0].seeds[0], reasons: ['Point differential decides the order.'], dependsOnScores: true }]
  client.simulatePlayoffs.mockResolvedValue(data)
  show('&picks=252h,258h,271h')
  const table = await screen.findByRole('table', { name: 'AFC final seeds' })
  expect(table).toHaveTextContent('11-6')
  expect(screen.getByText('Depends on scores').parentElement).toHaveAttribute('title', 'Winners alone do not decide this spot; point differential or a coin toss does.')
  await userEvent.click(within(table).getByText('Tiebreak details'))
  expect(screen.getByText('Point differential decides the order.')).toBeVisible()
  expect(screen.getByText(/32 of 32 games picked.*100 seasons/)).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'AFC What-If' })).getAllByRole('button', { name: 'CSV' })).toHaveLength(2)
})
it('cancels an old simulation and ignores its late response', async () => {
  let finish
  client.simulatePlayoffs.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  show()
  await waitFor(() => expect(client.simulatePlayoffs).toHaveBeenCalledTimes(1))
  const signal = client.simulatePlayoffs.mock.calls[0][1]
  await userEvent.click(screen.getAllByRole('button', { name: 'Home BUF' })[0])
  expect(signal.aborted).toBe(true)
  await screen.findByRole('table', { name: 'AFC scenario probabilities' })
  await act(async () => finish(result({ simulations: 123 })))
  expect(screen.queryByText(/123 seasons/)).not.toBeInTheDocument()
})
it('copies a scenario URL with normalized picks', async () => {
  const user = userEvent.setup()
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  show('&picks=252h,99a')
  await user.click(await screen.findByRole('button', { name: 'Copy link' }))
  const params = new URL(write.mock.calls[0][0]).searchParams
  expect(params.get('picks')).toBe('252h')
  expect(params.get('season')).toBe('2')
  expect(params.get('v')).toBe('1')
  expect(screen.getByText('1 picks were removed because those games are already played')).toBeInTheDocument()
  expect(screen.getByText('Link copied')).toBeInTheDocument()
})
it.each(['remaining', 'simulation'])('shows a recoverable error for %s failure', async failure => {
  if (failure === 'remaining') client.getPlayoffRemaining.mockRejectedValue(new Error())
  else client.simulatePlayoffs.mockRejectedValue(new Error())
  show()
  expect(await screen.findByText(failure === 'remaining' ? /Could not load remaining/ : /Could not simulate/)).toBeInTheDocument()
})
it('prioritizes badges, explains proof and formats proven extremes', () => {
  const { rerender } = render(<ClinchBadge markers={{ playoffs: 'clinched', division: 'clinched', oneSeed: 'clinched' }} />)
  const badge = screen.getByText('Clinched No. 1 seed')
  expect(badge.parentElement.title).toBe("Guaranteed under Madden 27's tiebreak rules for every possible result of the remaining games, including ties. No badge means it isn't settled yet.")
  expect(screen.queryByText('Clinched division')).not.toBeInTheDocument()
  rerender(<ClinchBadge markers={{ playoffs: 'eliminated', division: 'eliminated', oneSeed: 'eliminated' }} />)
  expect(screen.getByText('Eliminated from the playoffs')).toBeInTheDocument()
  expect(screen.queryByText('Eliminated from the division')).not.toBeInTheDocument()
  expect(markerOdds(0.999, null)).toBe('>99%')
  expect(markerOdds(0.999, 'clinched')).toBe('100%')
  expect(markerOdds(0.001, 'eliminated')).toBe('0%')
  expect(markerOdds(0.001, null)).toBe('<1%')
})
it.each([null, 'failure'])('silently omits markers on %s clinch data', async mode => {
  if (mode) client.getPlayoffClinch.mockRejectedValue(new Error())
  else client.getPlayoffClinch.mockResolvedValue(null)
  function Markers() { const data = useClinch(2, 'nfl'); return <ClinchBadge markers={data?.teams?.[0]} /> }
  const { container } = render(<Markers />)
  await act(async () => {})
  expect(container).toBeEmptyDOMElement()
})
const showPath = () => render(<MemoryRouter initialEntries={['/playoffs/buf?season=2&rules=nfl']}><Routes><Route path="/playoffs/:abbr" element={<PlayoffPathPage />} /></Routes></MemoryRouter>)
it('renders path sections in order, proof wording, tables, exports and scenario link', async () => {
  showPath()
  await screen.findByText('Do we control our destiny?')
  expect(client.getPlayoffPath).toHaveBeenCalledWith('BUF', 2, 'madden')
  expect(screen.getByText(/Not guaranteed: winning out still leaves >99%/)).toBeInTheDocument()
  expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['Do we control our destiny?', "What's our ceiling?", 'Seed distribution', 'How many wins do we need?', 'If we win out, what can still go wrong', 'Root for this week'])
  expect(screen.getByText('Clinched playoffs')).toBeInTheDocument()
  for (const title of ['Seed distribution', 'How many wins do we need?', 'If we win out, what can still go wrong', 'Root for this week']) formats(screen.getByRole('region', { name: title }))
  const link = await screen.findByRole('link', { name: 'Load win out + helpful results into What-If' })
  const url = new URL(link.getAttribute('href'), 'https://example.com')
  expect(url.searchParams.get('picks')).toBe('252h,258h,271h')
})
it('only claims control of destiny when proven', async () => {
  const data = path(); data.winOut.controlsDestiny = true
  client.getPlayoffPath.mockResolvedValue(data)
  showPath()
  expect(await screen.findByText('Yes: winning out is proven to get us in')).toBeInTheDocument()
})
it('shows path loading and a useful 404 state', async () => {
  let fail
  client.getPlayoffPath.mockReturnValue(new Promise((resolve, reject) => { fail = reject }))
  showPath()
  expect(screen.getByText('Loading path to the playoffs…')).toBeInTheDocument()
  await act(async () => fail({ response: { status: 404 } }))
  expect(screen.getByText(/No playoff path available/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to Playoffs' })).toBeInTheDocument()
})
it('builds win-out links with team wins taking precedence over helpful picks', () => {
  const data = path(); data.rootThisWeek = [{ ...games[0], rootFor: 'away' }]
  expect(new URL(pathScenario(data, games), 'https://example.com').searchParams.get('picks')).toBe('252h,258h,271h')
})

it('shows clinch markers and proven odds on Picture, Odds and the outlook card', async () => {
  client.getSeasons.mockResolvedValue([2])
  client.getPlayoffClinch.mockResolvedValue({ ...clinchFixture, teams: clinchFixture.teams.map(row => row.team.teamId === A.teamId ? { ...row, playoffs: 'clinched', division: 'clinched' } : row) })
  client.getPlayoffOdds.mockResolvedValue(oddsFixture)
  client.getPlayoffPicture.mockResolvedValue(pictureFixture)
  const view = render(<MemoryRouter><PlayoffsPage /></MemoryRouter>)
  const picture = await screen.findByRole('table', { name: 'AFC playoff picture' })
  expect(picture).toHaveTextContent('Clinched division')
  expect(picture).toHaveTextContent('100%')
  await userEvent.click(screen.getByRole('tab', { name: 'Probability' }))
  const table = await screen.findByRole('table', { name: 'AFC playoff probability' })
  expect(table).toHaveTextContent('Clinched division')
  expect(table).toHaveTextContent('100%')
  view.unmount()
  render(<MemoryRouter><PlayoffOutlook teamId={1} season={2} /></MemoryRouter>)
  const outlook = await screen.findByRole('region', { name: 'Playoff outlook' })
  expect(outlook).toHaveTextContent('Clinched division')
  expect(within(outlook).getByRole('table')).toHaveTextContent('100%')
  expect(within(outlook).getByRole('button', { name: 'Path to the playoffs →' })).toBeInTheDocument()
})
it('keeps Picture usable without an error banner when clinch fails', async () => {
  client.getSeasons.mockResolvedValue([2])
  client.getPlayoffClinch.mockRejectedValue(new Error('unavailable'))
  client.getPlayoffPicture.mockResolvedValue(pictureFixture)
  render(<MemoryRouter><PlayoffsPage /></MemoryRouter>)
  const table = await screen.findByRole('table', { name: 'AFC playoff picture' })
  expect(table).toHaveTextContent('80%')
  expect(table).not.toHaveTextContent('Clinched')
  expect(screen.queryByText(/Could not load/)).not.toBeInTheDocument()
})
it('retries a failed simulation without changing the scenario', async () => {
  client.simulatePlayoffs.mockRejectedValueOnce(new Error())
  show('&picks=252h')
  await userEvent.click(await screen.findByRole('button', { name: 'Retry simulation' }))
  await screen.findByRole('table', { name: 'AFC scenario probabilities' })
  expect(client.simulatePlayoffs).toHaveBeenCalledTimes(2)
  expect(client.simulatePlayoffs.mock.calls[1][0].picks).toEqual([{ gameId: 252, result: 'home' }])
})

it('uses the baseline simulation count for empty picks and displays the returned count', async () => {
  client.simulatePlayoffs.mockResolvedValue(result({ simulations: 20000 }))
  show()
  expect(await screen.findByText(/20,000 seasons/)).toBeInTheDocument()
  expect(client.simulatePlayoffs.mock.calls[0][0]).toEqual({ season: 2, rules: 'madden', picks: [] })
})

it.each([undefined, false, true])('keeps fractional exact odds unproven for teams outside final seeds (flag %s)', async flag => {
  const data = result({ exact: true })
  data.conferences[0].seeds = []
  data.conferences[0].teams = [{ ...data.conferences[0].teams[0], team: B, dependsOnScores: flag, odds: { playoffs: .001, division: .999, oneSeed: 0 }, baseline: odds }]
  client.simulatePlayoffs.mockResolvedValue(data)
  show()
  const table = await screen.findByRole('table', { name: 'AFC scenario probabilities' })
  expect(table).toHaveTextContent('<1%')
  expect(table).toHaveTextContent('>99%')
  expect(within(table).getAllByRole('row')[1].children[5]).toHaveTextContent(flag ? '<1%' : '0%')
  if (flag) expect(within(table).getByText('depends on scores')).toBeInTheDocument()
  else expect(within(table).queryByText('depends on scores')).not.toBeInTheDocument()
})

it('shows proven exact endpoints only for teams not dependent on scores', async () => {
  const data = result({ exact: true })
  data.conferences[0].seeds = []
  data.conferences[0].teams = [false, true].map((flag, i) => ({ ...data.conferences[0].teams[0], team: i ? B : A, dependsOnScores: flag, odds: { playoffs: 1, division: 0, oneSeed: .4 }, baseline: odds }))
  client.simulatePlayoffs.mockResolvedValue(data)
  show()
  const rows = within(await screen.findByRole('table', { name: 'AFC scenario probabilities' })).getAllByRole('row')
  expect(rows[1].children[1]).toHaveTextContent('100%')
  expect(rows[1].children[3]).toHaveTextContent('0%')
  expect(rows[2].children[1]).toHaveTextContent('>99%')
  expect(rows[2].children[3]).toHaveTextContent('<1%')
})

it('shows final-week goal statuses, sufficient conditions, assumptions and export controls', async () => {
  const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
  const scenarios = { ...scenariosFixture.scenarios, assumes: 'No tie games; scores unknown', goals: {
    playoffs: { ...scenariosFixture.scenarios.goals.playoffs, status: 'open', clinchedBy: [{ text: 'Bills beat Jets' }, { text: 'Dolphins lose to Jets' }], eliminatedBy: [{ text: 'Bills lose to Jets' }] },
    division: { ...scenariosFixture.scenarios.goals.division, status: 'in', clinchedBy: [], eliminatedBy: [] },
    oneSeed: { ...scenariosFixture.scenarios.goals.oneSeed, status: 'out', clinchedBy: [], eliminatedBy: [] },
  } }
  client.getPlayoffPath.mockResolvedValue({ ...structuredClone(scenariosFixture), scenarios })
  showPath()
  const table = await screen.findByRole('table', { name: 'Final-week scenarios' })
  const rows = within(table).getAllByRole('row')
  expect(rows.slice(1).map(r => r.children[1].textContent)).toEqual(['open', 'in', 'out'])
  expect(rows.slice(1).map(r => r.children[0].textContent)).toEqual(['Playoffs', 'Division', 'No. 1 seed'])
  expect(within(rows[1]).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Bills beat Jets', 'Dolphins lose to Jets', 'Bills lose to Jets'])
  expect(rows[2]).toHaveTextContent('—')
  expect(rows[3]).toHaveTextContent('—')
  const region = screen.getByRole('region', { name: 'Final-week scenarios' })
  expect(region).toHaveTextContent(scenarios.assumes)
  expect(region).toHaveTextContent('We clinch with ...')
  expect(region).toHaveTextContent('We are eliminated if ...')
  formats(region)
  await userEvent.click(within(region).getByRole('button', { name: 'CSV' }))
  const spec = csv.mock.lastCall[0]
  expect(spec.rows.map(r => r.status)).toEqual(['open', 'in', 'out'])
  expect(spec.cols[2].text(spec.rows[0])).toBe('Bills beat Jets; Dolphins lose to Jets')
  expect(spec.cols[3].text(spec.rows[0])).toBe('Bills lose to Jets')
  expect(spec.cols[2].text(spec.rows[1])).toBe('')
  expect(spec.notes).toEqual([scenarios.assumes])
  csv.mockRestore()
})

it('hides final-week scenarios entirely when the response has null scenarios', async () => {
  client.getPlayoffPath.mockResolvedValue(pathFixture)
  showPath()
  await screen.findByText('Do we control our destiny?')
  expect(screen.queryByRole('region', { name: 'Final-week scenarios' })).not.toBeInTheDocument()
  expect(screen.getByText('No playoff seed remains in these simulations.')).toBeInTheDocument()
  expect(screen.getByText('Eliminated from the playoffs')).toBeInTheDocument()
})

it('pins the API-resolved season when copying a latest-season scenario', async () => {
  const user = userEvent.setup()
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  client.getPlayoffRemaining.mockResolvedValue({ ...remainingFixture, season: 4, games })
  show('&v=1&picks=252h')
  await user.click(await screen.findByRole('button', { name: 'Copy link' }))
  expect(new URL(write.mock.calls[0][0]).searchParams.get('season')).toBe('4')
})

it('retries a busy scenario once and exposes a manual retry after the second 503', async () => {
  vi.useFakeTimers()
  client.simulatePlayoffs.mockRejectedValue({ response: { status: 503 } })
  show()
  await act(async () => {})
  await act(async () => vi.advanceTimersByTimeAsync(400))
  expect(client.simulatePlayoffs).toHaveBeenCalledTimes(1)
  await act(async () => vi.advanceTimersByTimeAsync(3001))
  expect(client.simulatePlayoffs).toHaveBeenCalledTimes(2)
  expect(screen.getByText('The server is busy. Try again')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  await act(async () => vi.advanceTimersByTimeAsync(10000))
  expect(client.simulatePlayoffs).toHaveBeenCalledTimes(2)
})

it('cancels the delayed busy retry when picks change', async () => {
  vi.useFakeTimers()
  client.simulatePlayoffs.mockRejectedValueOnce({ response: { status: 503 } })
  const view = show()
  await act(async () => {})
  await act(async () => vi.advanceTimersByTimeAsync(400))
  const signal = client.simulatePlayoffs.mock.calls[0][1]
  view.unmount()
  expect(signal.aborted).toBe(true)
  await act(async () => vi.advanceTimersByTimeAsync(5000))
  expect(client.simulatePlayoffs).toHaveBeenCalledTimes(1)
})
