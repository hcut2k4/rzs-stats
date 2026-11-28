import { vi } from 'vitest'
import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import StandingsPage from '../pages/StandingsPage'
import PlayoffsPage from '../pages/PlayoffsPage'
import { clearLoadCache } from '../utils/useLoad'
import * as client from '../api/client'
import picture from './fixtures/playoffs/picture.json'
import odds from './fixtures/playoffs/odds.json'
import championship from './fixtures/playoffs/championship.json'

vi.mock('../api/client')

const team = picture.conferences[0].seeds[0].team
const standings = [
  { teamId: team.teamId, abbrName: team.abbrName, cityName: 'City', displayName: team.displayName, conference: 'AFC', wins: 2, losses: 0, ties: 0, gamesPlayed: 2, winPct: 1, pointsFor: 40, pointsAgainst: 20, pythagoreanPat: .8, winDiff: 0 },
  { teamId: -1, abbrName: 'DAL', cityName: 'Dallas', displayName: 'Cowboys', conference: 'NFC', wins: 0, losses: 2, ties: 0, gamesPlayed: 2, winPct: 0, pointsFor: 20, pointsAgainst: 40, pythagoreanPat: .2, winDiff: 0 },
]
beforeEach(() => {
  vi.resetAllMocks()
  clearLoadCache()
  client.getSeasons.mockResolvedValue([picture.season])
  client.getStandings.mockResolvedValue(structuredClone(standings))
  client.getAvailableWeeks.mockResolvedValue([])
  client.getPlayoffClinch.mockResolvedValue({ teams: [{ team, playoffs: 'clinched', division: 'clinched', oneSeed: 'eliminated' }] })
  client.getPlayoffPicture.mockResolvedValue(structuredClone(picture))
  client.getPlayoffOdds.mockResolvedValue(structuredClone(odds))
  client.getPlayoffChampionship.mockResolvedValue(structuredClone(championship))
})
const show = route => render(<MemoryRouter initialEntries={[route]}>{route.startsWith('/standings') ? <StandingsPage /> : <PlayoffsPage />}</MemoryRouter>)

it('shows accessible compact standings icons, mobile abbreviations and a shared key while preserving sorting', async () => {
  show('/standings')
  const name = `City ${team.displayName}`
  const link = await screen.findByRole('link', { name: `${name} (${team.abbrName})` })
  expect(link).toHaveAttribute('aria-label', `${name} (${team.abbrName})`)
  expect(link).toHaveAttribute('title', name)
  expect(within(link).getByText(team.abbrName)).toHaveClass('sm:hidden')
  expect(within(link).getByText(name)).toHaveClass('hidden', 'sm:inline')
  const row = link.closest('tr')
  for (const text of ['Clinched division', 'Eliminated from the No. 1 seed']) {
    expect(await within(row).findByText(text)).toHaveClass('sr-only')
    expect(within(link).queryByText(text)).not.toBeInTheDocument()
  }
  expect(screen.getAllByLabelText('Clinch key')).toHaveLength(1)
  expect(screen.getByLabelText('Clinch key').parentElement).toContainElement(screen.getByLabelText('Group by conference'))
  await userEvent.click(screen.getByRole('columnheader', { name: /PyPAT/ }))
  const rows = within(screen.getByRole('table')).getAllByRole('row').filter(r => within(r).queryAllByRole('cell').length)
  expect(within(rows[0]).getByRole('link')).toHaveAttribute('aria-label', 'Dallas Cowboys (DAL)')
  await userEvent.click(screen.getByLabelText('Group by conference'))
  expect(screen.getAllByRole('table')).toHaveLength(2)
  expect(screen.getAllByLabelText('Clinch key')).toHaveLength(1)
})

it.each(['/standings', '/playoffs?tab=picture', '/playoffs?tab=probability'])('shows a key only with visible markers on %s', async route => {
  show(route)
  expect(await screen.findByLabelText('Clinch key')).toBeInTheDocument()
  for (const text of ['Clinched division', 'Eliminated from the No. 1 seed']) {
    const label = screen.getByText(text)
    expect(label).toHaveClass('sr-only')
    expect(label.closest('[title]').querySelector('svg')).toBeInTheDocument()
  }
})

it.each(['/standings', '/playoffs?tab=picture', '/playoffs?tab=probability'])('omits the key and icons without settled goals on %s', async route => {
  client.getPlayoffClinch.mockResolvedValue({ teams: [{ team, playoffs: null, division: null, oneSeed: null }] })
  show(route)
  await screen.findAllByRole('table')
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
  expect(screen.queryByLabelText('Clinch key')).not.toBeInTheDocument()
  expect(screen.queryByText('Clinched division')).not.toBeInTheDocument()
  expect(screen.queryByText('Eliminated from the No. 1 seed')).not.toBeInTheDocument()
})

it('keeps standings usable without a key when clinch data fails', async () => {
  client.getPlayoffClinch.mockRejectedValue(new Error('Clinch data unavailable'))
  show('/standings')
  expect(await screen.findByRole('link', { name: `City ${team.displayName} (${team.abbrName})` })).toBeInTheDocument()
  expect(screen.queryByLabelText('Clinch key')).not.toBeInTheDocument()
  expect(screen.queryByText('Clinched division')).not.toBeInTheDocument()
  expect(screen.queryByText('Eliminated from the No. 1 seed')).not.toBeInTheDocument()
})

it.each(['/standings', '/playoffs?tab=picture', '/playoffs?tab=probability'])('waits for clinch markers before showing the key on %s', async route => {
  let resolveClinch
  client.getPlayoffClinch.mockReturnValue(new Promise(resolve => { resolveClinch = resolve }))
  show(route)
  await screen.findAllByRole('table')
  expect(screen.queryByLabelText('Clinch key')).not.toBeInTheDocument()
  await act(async () => resolveClinch({ teams: [{ team, playoffs: 'clinched' }] }))
  expect(await screen.findByLabelText('Clinch key')).toBeInTheDocument()
})

it('omits the Odds key when only the hidden conference has markers', async () => {
  show('/playoffs?tab=probability')
  await screen.findByLabelText('Clinch key')
  const markedConference = odds.conferences.find(c => c.teams.some(r => r.team.teamId === team.teamId))
  const visibleConference = odds.conferences.find(c => c.name !== markedConference.name)
  await userEvent.click(within(screen.getByRole('group', { name: 'Conference focus' })).getByRole('button', { name: visibleConference.name }))
  expect(screen.getByRole('table', { name: `${visibleConference.name} playoff probability` })).toBeInTheDocument()
  expect(screen.queryByRole('table', { name: `${markedConference.name} playoff probability` })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Clinch key')).not.toBeInTheDocument()
})

it('keeps row order and sort indicators unchanged when the rank header is clicked', async () => {
  show('/standings')
  await screen.findByRole('link', { name: `City ${team.displayName} (${team.abbrName})` })
  const rank = screen.getByRole('columnheader', { name: '#' })
  expect(rank).not.toHaveClass('cursor-pointer')
  expect(rank).not.toHaveClass('hover:text-ink')
  const rows = within(screen.getByRole('table')).getAllByRole('row').filter(row => within(row).queryAllByRole('cell').length)
  for (const cell of [rank, ...rows.map(row => within(row).getAllByRole('cell')[0])]) {
    expect(cell).toHaveClass('w-7', 'min-w-7', 'max-w-7', 'sm:w-10', 'sm:min-w-10', 'sm:max-w-10')
  }
  const teamHeader = screen.getByRole('columnheader', { name: 'Team' })
  for (const cell of [rank, teamHeader, ...rows.flatMap(row => within(row).getAllByRole('cell').slice(0, 2))]) {
    expect(cell).toHaveClass('px-1', 'sm:px-2')
    expect(cell).not.toHaveClass('!px-1')
  }
  const rowNames = () => within(screen.getByRole('table')).getAllByRole('link').map(link => link.getAttribute('aria-label'))
  const initialOrder = rowNames()
  const sortedHeader = screen.getByRole('columnheader', { name: /PyPAT/ })
  const initialSort = sortedHeader.textContent
  await userEvent.click(rank)
  expect(rank).toHaveTextContent(/^#$/)
  expect(rowNames()).toEqual(initialOrder)
  expect(sortedHeader).toHaveTextContent(initialSort)
  await userEvent.click(sortedHeader)
  const reversedOrder = rowNames()
  expect(reversedOrder).toEqual([...initialOrder].reverse())
  await userEvent.click(rank)
  expect(rowNames()).toEqual(reversedOrder)
  expect(rank).toHaveTextContent(/^#$/)
})
