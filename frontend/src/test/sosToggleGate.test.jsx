import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import StandingsPage from '../pages/StandingsPage'
import * as client from '../api/client'

vi.mock('../api/client')

const team = (teamId, gamesPlayed) => ({
  teamId, gamesPlayed, displayName: `Team ${teamId}`, abbrName: 'TM',
  wins: 1, losses: 1, ties: 0, winPct: 0.5, pointsFor: 20, pointsAgainst: 20,
  pythagoreanPat: 0.5, winDiff: 0, oppPyPatCurr: null, oppPyPatPrev: 0.5,
  oppPyPatRemainingCurr: null, oppPyPatRemainingPrev: 0.5,
  oppPyPatTotalCurr: null, oppPyPatTotalPrev: 0.5,
})

const renderPage = () => render(<MemoryRouter><StandingsPage /></MemoryRouter>)

describe('SoS opponent-PyPAT toggle', () => {
  afterEach(() => vi.clearAllMocks())

  it('stays hidden early in the season, when current-season opponents have no ratable games', async () => {
    client.getSeasons.mockResolvedValue([5])
    client.getStandings.mockResolvedValue([team(1, 1), team(2, 2)])

    renderPage()

    // Wait for the standings data to land before asserting the toggle is absent
    await waitFor(() => expect(screen.getByText(/games played/)).toBeInTheDocument())
    expect(screen.queryByText('This season')).not.toBeInTheDocument()
    expect(screen.queryByText('Prior season')).not.toBeInTheDocument()
  })

  it('appears once a team has played three games', async () => {
    client.getSeasons.mockResolvedValue([5])
    client.getStandings.mockResolvedValue([team(1, 3), team(2, 3)])

    renderPage()

    await waitFor(() => expect(screen.getByText('This season')).toBeInTheDocument())
    expect(screen.getByText('Prior season')).toBeInTheDocument()
  })
})
