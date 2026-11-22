import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import PlayoffOutlook from '../components/team/PlayoffOutlook'
import PlayoffPathPage from '../pages/PlayoffPathPage'
import { clearLoadCache } from '../utils/useLoad'
import { formatOdds, probShade, chanceShade } from '../utils/playoffOdds'
import * as client from '../api/client'
import * as exports from '../utils/exportTable'
import * as tableImage from '../utils/tableImage'
import oddsFixture from './fixtures/playoffs/odds.json'
import pictureFixture from './fixtures/playoffs/picture.json'
import leverageFixture from './fixtures/playoffs/leverage.json'
import championshipFixture from './fixtures/playoffs/championship.json'
import preplayoffFixture from './fixtures/playoffs/championship-preplayoff.json'
import historyFixture from './fixtures/playoffs/odds-history.json'
import clinchFixture from './fixtures/playoffs/clinch.json'
import pathFixture from './fixtures/playoffs/path.json'
import remainingFixture from './fixtures/playoffs/remaining.json'

vi.mock('../api/client')
const showHero = () => render(<MemoryRouter><PlayoffOutlook teamId={1} season={2} nextWeek={16} /></MemoryRouter>)
const showPath = () => render(<MemoryRouter initialEntries={['/playoffs/HOU?season=2']}><Routes><Route path="/playoffs/:abbr" element={<PlayoffPathPage />} /></Routes></MemoryRouter>)
const history = () => ({ ...structuredClone(historyFixture), snapshots: [0, 1, 2].map((i) => ({ ...structuredClone(historyFixture.snapshots[0]), week: i === 2 ? null : i + 15, teams: historyFixture.snapshots[0].teams.map(r => ({ ...r, playoffs: r.team.teamId === 1 ? [.4, .8, .7][i] : r.playoffs })) })) })
beforeEach(() => {
  vi.resetAllMocks()
  clearLoadCache()
  client.getPlayoffOdds.mockResolvedValue(structuredClone(oddsFixture))
  client.getPlayoffPicture.mockResolvedValue(structuredClone(pictureFixture))
  client.getPlayoffLeverage.mockResolvedValue(structuredClone(leverageFixture))
  client.getPlayoffChampionship.mockResolvedValue(structuredClone(championshipFixture))
  client.getPlayoffOddsHistory.mockResolvedValue(history())
  client.getPlayoffClinch.mockResolvedValue({ ...clinchFixture, teams: [] })
  client.getPlayoffPath.mockResolvedValue(structuredClone(pathFixture))
  client.getPlayoffRemaining.mockResolvedValue(structuredClone(remainingFixture))
})

it('renders the seed, title funnel, next game, momentum and links using only shared endpoints', async () => {
  showHero()
  const pictureRow = pictureFixture.conferences.flatMap(c => [...c.seeds, ...c.hunt]).find(r => r.team.teamId === 1)
  expect(await screen.findByText(/If the season ended today:/)).toHaveTextContent(`${pictureRow.seed}rd seed`)
  expect(await screen.findByText(/biggest game this week/)).toBeInTheDocument()
  const title = championshipFixture.teams.find(r => r.team.teamId === 1)
  const funnel = screen.getByLabelText('Title probability funnel')
  for (const [key, label] of [['round2', 'Reach round 2'], ['conferenceFinal', 'Conference final'], ['final', 'Super Bowl'], ['champion', 'Champion']]) {
    expect(funnel).toHaveTextContent(`${label}${formatOdds(title[key])}`)
  }
  expect(screen.getByText('Biggest weekly jump: +40 pp · Week 17')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: /Playoff probability went from 40% to 70%/ }).querySelector('path')).toBeInTheDocument()
  expect(within(screen.getByRole('img', { name: /Playoff probability went from 40% to 70%/ })).getByText('Final')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'All playoff probabilities →' })).toHaveAttribute('href', '/playoffs?tab=probability&season=2')
  expect(screen.getByRole('link', { name: 'Path to the playoffs →' })).toHaveAttribute('href', '/playoffs/BUF?season=2')
  expect(client.getPlayoffPath).not.toHaveBeenCalled()
  expect(client.getPlayoffLeverage).toHaveBeenCalledExactlyOnceWith(2, oddsFixture.nextWeek, 'madden')
})

it('shows final seeding and the frozen title projection without requesting leverage', async () => {
  client.getPlayoffOdds.mockResolvedValue({ ...oddsFixture, nextWeek: null })
  client.getPlayoffChampionship.mockResolvedValue(preplayoffFixture)
  showHero()
  expect(await screen.findByText(/Final seed:/)).toBeInTheDocument()
  expect(screen.getByText('Pre-playoff projection (end of regular season)')).toBeInTheDocument()
  expect(client.getPlayoffLeverage).not.toHaveBeenCalled()
  expect(screen.queryByText(/Next game/)).not.toBeInTheDocument()
})

it.each([{ snapshots: [] }, { snapshots: historyFixture.snapshots }])('hides momentum until two snapshots exist: $snapshots.length', async ({ snapshots }) => {
  client.getPlayoffOddsHistory.mockResolvedValue({ ...historyFixture, snapshots })
  showHero()
  await screen.findByText(/biggest game this week/)
  expect(screen.queryByText('Momentum')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Title probability funnel')).toBeInTheDocument()
})

it.each(['404', 'empty'])('renders nothing for a season with no data: %s', async mode => {
  if (mode === '404') client.getPlayoffOdds.mockRejectedValue({ response: { status: 404 } })
  else client.getPlayoffOdds.mockResolvedValue({ ...oddsFixture, conferences: [] })
  const { container } = showHero()
  await act(async () => {})
  expect(container).toBeEmptyDOMElement()
  expect(client.getPlayoffPicture).not.toHaveBeenCalled()
})

it.each([.99, .01])('uses the shared gauge colour at probability %s', async probability => {
  const data = structuredClone(oddsFixture)
  data.conferences.flatMap(c => c.teams).find(r => r.team.teamId === 1).odds.playoffs = probability
  client.getPlayoffOdds.mockResolvedValue(data)
  showHero()
  expect(await screen.findByTestId('playoff-gauge')).toHaveAttribute('stroke', probShade(probability))
})

it('keeps a failed source retryable while preserving the rest of the hero', async () => {
  client.getPlayoffChampionship.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(championshipFixture)
  showHero()
  await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(client.getPlayoffChampionship).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument())
  expect(screen.getByLabelText('Title probability funnel')).toHaveTextContent('Champion4%')
})

it('sorts the disclosed data and exports the visible order with probability shading', async () => {
  const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
  showHero()
  await screen.findByText(/biggest game this week/)
  await userEvent.click(screen.getByText('Show data'))
  const table = screen.getByRole('table', { name: 'Playoff outlook' })
  await userEvent.click(within(table).getByRole('button', { name: 'Current' }))
  const body = within(table).getAllByRole('row').slice(1)
  expect(body[0]).toHaveTextContent('Playoffs80%')
  expect(body[0].children[1]).toHaveStyle({ background: probShade(.8) })
  expect(body.find(r => r.textContent.startsWith('Division')).children[1]).toHaveStyle({ background: chanceShade(.69) })
  const block = table.parentElement.parentElement
  await userEvent.click(within(block).getByRole('button', { name: 'CSV' }))
  expect(csv.mock.lastCall[0].rows.map(r => r.label)).toEqual(body.map(r => r.children[0].textContent))
  const png = vi.spyOn(tableImage, 'copyImage').mockResolvedValue('copied')
  await userEvent.click(within(block).getByRole('button', { name: 'PNG' }))
  expect(png.mock.lastCall[0].image.draw).toBeTypeOf('function')
  expect(png.mock.lastCall[0].rows).toEqual(csv.mock.lastCall[0].rows)
  png.mockRestore()
})

it('sorts every Path table column and exports the displayed order', async () => {
  const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
  showPath()
  const table = await screen.findByRole('table', { name: 'How many wins do we need?' })
  for (const th of within(table).getAllByRole('columnheader')) {
    await userEvent.click(within(th).getByRole('button'))
    expect(th).toHaveAttribute('aria-sort', 'descending')
  }
  await userEvent.click(within(table).getByRole('button', { name: 'Chance of record' }))
  expect(within(table).getAllByRole('row')[1]).toHaveTextContent('7-1052%')
  await userEvent.click(within(table.parentElement.parentElement).getByRole('button', { name: 'CSV' }))
  expect(csv.mock.lastCall[0].rows.map(r => r.record)).toEqual(['7-10', '8-9', '6-11'])
  expect(screen.getAllByText(/No games with a meaningful swing/)).toHaveLength(1)
})
