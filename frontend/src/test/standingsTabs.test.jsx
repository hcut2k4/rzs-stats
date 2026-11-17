import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom'
import App from '../App'
import StandingsPage from '../pages/StandingsPage'
import * as client from '../api/client'

vi.mock('../api/client')

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }

const row = (teamId, displayName, winPct, extra = {}) => ({
  teamId, displayName, abbrName: displayName.slice(0, 3).toUpperCase(), cityName: 'City',
  wins: 1, losses: 1, ties: 0, gamesPlayed: 2, winPct, pointsFor: 40, pointsAgainst: 40,
  pythagoreanPat: 0.5, winDiff: 0, ...extra,
})

const seasonRows = (seasonIndex, standings) => ({ seasonIndex, weekIndex: null, standings })

function stub() {
  client.getSeasons.mockResolvedValue([6, 7])
  client.getStandings.mockResolvedValue([row(1, 'Aces', 0.5), row(2, 'Wolves', 0.5)])
  client.getSeasonTrends.mockResolvedValue([
    seasonRows(6, [row(1, 'Aces', 0.9), row(2, 'Wolves', 0.1)]),
    seasonRows(7, [row(1, 'Aces', 0.2), row(2, 'Wolves', 0.8)]),
  ])
  client.getWeeklyTrends.mockResolvedValue([
    { weekIndex: 0, standings: [row(1, 'Aces', 0.5), row(2, 'Wolves', 0.5)] },
  ])
}

function Where() {
  const { pathname, search } = useLocation()
  return (
    <>
      <div data-testid="where">{pathname + search}</div>
      <div data-testid="navType">{useNavigationType()}</div>
    </>
  )
}

const renderAt = url => render(
  <MemoryRouter initialEntries={[url]}>
    <StandingsPage />
    <Where />
  </MemoryRouter>
)

const selected = () => screen.getByRole('tab', { selected: true }).textContent

describe('Standings tabs', () => {
  afterEach(() => vi.clearAllMocks())

  it('opens on the standings table without fetching season history', async () => {
    stub()

    renderAt('/standings')

    await screen.findByText(/ranked by PyPAT/)
    expect(selected()).toBe('Standings')
    expect(client.getSeasonTrends).not.toHaveBeenCalled()
  })

  it('opens the tab named in the URL', async () => {
    stub()

    renderAt('/standings?tab=weekly')

    await waitFor(() => expect(selected()).toBe('Week by Week'))
  })

  it('falls back to the standings tab for an unknown tab value', async () => {
    stub()

    renderAt('/standings?tab=bogus')

    await waitFor(() => expect(selected()).toBe('Standings'))
  })

  it('keeps the default tab out of the URL and replaces history entries on switch', async () => {
    stub()
    renderAt('/standings')

    await userEvent.click(screen.getByRole('tab', { name: 'Season History' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/standings?tab=history')
    expect(screen.getByTestId('navType')).toHaveTextContent('REPLACE')

    await userEvent.click(screen.getByRole('tab', { name: 'Standings' }))
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/standings$/)
    expect(screen.getByTestId('navType')).toHaveTextContent('REPLACE')
  })

  it('fetches season history once, however many times the tab is revisited', async () => {
    stub()
    renderAt('/standings')

    await userEvent.click(screen.getByRole('tab', { name: 'Season History' }))
    await screen.findByText('Season 109')
    await userEvent.click(screen.getByRole('tab', { name: 'Standings' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Season History' }))
    await screen.findByText('Season 109')

    expect(client.getSeasonTrends).toHaveBeenCalledTimes(1)
  })

  it('shows a loading state while season history is in flight', async () => {
    stub()
    client.getSeasonTrends.mockReturnValue(new Promise(() => {}))

    renderAt('/standings?tab=history')

    expect(await screen.findByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('No season data available.')).not.toBeInTheDocument()
  })

  it('orders season history by the latest season win percentage on first render', async () => {
    stub()

    renderAt('/standings?tab=history')

    await screen.findByText('Season 110')
    const teams = screen.getAllByRole('row').slice(2).map(r => within(r).getAllByRole('cell')[0].textContent)
    expect(teams).toEqual(['Wolves', 'Aces'])
  })

  it('hides the season picker on season history, where every season is shown', async () => {
    stub()

    renderAt('/standings?tab=history')

    await screen.findByText('Season 110')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('keeps one season picker on the standings and week by week tabs', async () => {
    stub()
    renderAt('/standings')

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Season' }).value).toBe('7'))
    await userEvent.click(screen.getByRole('tab', { name: 'Week by Week' }))

    expect(screen.getByRole('combobox', { name: 'Season' }).value).toBe('7')
  })

  it('shows the conference grouping and SoS controls only on the standings tab', async () => {
    stub()
    client.getStandings.mockResolvedValue([row(1, 'Aces', 0.5, { gamesPlayed: 3 }), row(2, 'Wolves', 0.5, { gamesPlayed: 3 })])
    renderAt('/standings')

    expect(await screen.findByLabelText('Group by conference')).toBeInTheDocument()
    expect(screen.getByText('This season')).toBeInTheDocument()

    for (const other of ['Season History', 'Week by Week']) {
      await userEvent.click(screen.getByRole('tab', { name: other }))
      expect(screen.queryByLabelText('Group by conference')).not.toBeInTheDocument()
      expect(screen.queryByText('This season')).not.toBeInTheDocument()
    }
  })

  it('resets the SoS mode on a season change but keeps it across tab switches', async () => {
    stub()
    client.getStandings.mockResolvedValue([row(1, 'Aces', 0.5, { gamesPlayed: 3 }), row(2, 'Wolves', 0.5, { gamesPlayed: 3 })])
    renderAt('/standings')

    await waitFor(() => expect(screen.getByText('Prior season')).toHaveClass('bg-ink'))
    await userEvent.click(screen.getByText('This season'))
    expect(screen.getByText('This season')).toHaveClass('bg-ink')

    await userEvent.click(screen.getByRole('tab', { name: 'Week by Week' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Standings' }))
    expect(screen.getByText('This season')).toHaveClass('bg-ink')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Season' }), '6')
    await waitFor(() => expect(screen.getByText('This season')).toHaveClass('bg-ink'))

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Season' }), '7')
    await waitFor(() => expect(screen.getByText('Prior season')).toHaveClass('bg-ink'))
  })

  it('offers a retry when season history fails to load, instead of showing it as empty', async () => {
    stub()
    const history = [seasonRows(7, [row(1, 'Aces', 0.2), row(2, 'Wolves', 0.8)])]
    client.getSeasonTrends.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(history)

    renderAt('/standings?tab=history')

    expect(await screen.findByText(/Failed to load season history/)).toBeInTheDocument()
    expect(screen.queryByText('No season data available.')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Season 110')).toBeInTheDocument()
    expect(screen.queryByText(/Failed to load season history/)).not.toBeInTheDocument()
    expect(client.getSeasonTrends).toHaveBeenCalledTimes(2)
  })

  it('does not refetch a failed season history just by revisiting the tab', async () => {
    stub()
    client.getSeasonTrends.mockRejectedValue(new Error('boom'))
    renderAt('/standings?tab=history')
    await screen.findByText(/Failed to load season history/)

    await userEvent.click(screen.getByRole('tab', { name: 'Standings' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Season History' }))

    expect(await screen.findByText(/Failed to load season history/)).toBeInTheDocument()
    expect(client.getSeasonTrends).toHaveBeenCalledTimes(1)
  })

  it('describes the active tab in the page qualifier', async () => {
    stub()
    renderAt('/standings')

    await screen.findByText(/ranked by PyPAT/)
    await userEvent.click(screen.getByRole('tab', { name: 'Season History' }))

    expect(screen.getByText('W-L, PyPAT and Luck across every season')).toBeInTheDocument()
    expect(screen.queryByText(/ranked by PyPAT/)).not.toBeInTheDocument()
  })

  it('does not blank the history tab when standings fail to load', async () => {
    stub()
    client.getStandings.mockRejectedValue(new Error('boom'))

    renderAt('/standings?tab=history')

    await screen.findByText('Season 110')
    expect(screen.queryByText('Failed to load standings')).not.toBeInTheDocument()
  })
})

describe('Trends redirect', () => {
  afterEach(() => vi.clearAllMocks())

  it('sends the old /trends URL to the season history tab', async () => {
    stub()

    render(<MemoryRouter initialEntries={['/trends']}><App /></MemoryRouter>)

    await waitFor(() => expect(selected()).toBe('Season History'))
    expect(client.getSeasonTrends).toHaveBeenCalledTimes(1)
  })

  it('no longer lists Trends in the main navigation', async () => {
    stub()

    render(<MemoryRouter initialEntries={['/standings']}><App /></MemoryRouter>)

    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).queryByText('Trends')).not.toBeInTheDocument()
    expect(within(nav).getByText('Standings')).toBeInTheDocument()
    await screen.findByText(/ranked by PyPAT/)
  })
})
