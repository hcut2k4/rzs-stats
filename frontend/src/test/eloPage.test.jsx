import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import * as client from '../api/client'
import EloPage from '../pages/EloPage'

vi.mock('../api/client')

const hist = (season, week) => ({ teamId: 1, season, week, seasonStart: week === 0, startElo: 1500, endElo: 1510, change: 10, rank: 1 })
const rating = (teamId, abbrName, elo, rank) => ({ teamId, abbrName, displayName: abbrName + 'x', elo, rank, change: 5, prevRank: rank, rankChange: 0, gamesCounted: 10 })

describe('EloPage', () => {
  beforeEach(() => {
    client.getEloHistory.mockResolvedValue([hist(1, 0), hist(1, 18), hist(1, 22)])
    client.getEloRatings.mockResolvedValue([rating(1, 'BUF', 1700, 1), rating(2, 'MIA', 1300, 2)])
    client.getEloGames.mockResolvedValue([])
  })
  afterEach(() => vi.clearAllMocks())

  it('defaults to the latest season and week and shows ratings with ranks', async () => {
    render(<MemoryRouter><EloPage /></MemoryRouter>)
    expect((await screen.findAllByText('BUFx')).length).toBeGreaterThan(0)
    expect(client.getEloRatings).toHaveBeenCalledWith(1, 22)
    expect(screen.getByText('1700')).toBeInTheDocument()
  })

  it('names playoff weeks in the week selector', async () => {
    render(<MemoryRouter><EloPage /></MemoryRouter>)
    await screen.findAllByText('BUFx')
    expect(screen.getByRole('option', { name: 'Wild Card' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Super Bowl' })).toBeInTheDocument()
  })

  it('shows the matchup win probability for two teams', async () => {
    client.getEloMatchup.mockResolvedValue({
      teamA: { abbrName: 'BUF', displayName: 'BUFx' }, teamB: { abbrName: 'MIA', displayName: 'MIAx' },
      eloA: 1700, eloB: 1300, teamAWinProbability: 0.909, teamBWinProbability: 0.091,
    })
    render(<MemoryRouter><EloPage /></MemoryRouter>)
    await screen.findAllByText('BUFx')
    await userEvent.click(screen.getByRole('tab', { name: 'Matchup' }))
    expect(await screen.findByText('90.9%')).toBeInTheDocument()
  })
})
