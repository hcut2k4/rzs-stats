import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import HomePage from '../pages/HomePage'
import * as client from '../api/client'

vi.mock('../api/client')

const team = (teamId, abbrName, displayName) => ({ teamId, abbrName, displayName })

function stubHomeData() {
  client.getSeasons.mockResolvedValue([6, 7])
  client.getStandings.mockResolvedValue([
    { ...team(1, 'KC', 'Chiefs'), pythagoreanPat: 0.71, winDiff: 1.4 },
    { ...team(2, 'SF', '49ers'), pythagoreanPat: 0.64, winDiff: -0.8 },
  ])
  client.getAvailableWeeks.mockResolvedValue([0, 1])
  client.getGames.mockResolvedValue([
    { gameId: 10, homeTeam: team(1, 'KC'), awayTeam: team(2, 'SF'), homeScore: 24, awayScore: 17 },
  ])
  client.getEloHistory.mockResolvedValue([{ season: 7, week: 1 }])
  client.getEloRatings.mockResolvedValue([
    { ...team(1, 'KC', 'Chiefs'), elo: 1623, change: 12.5, rank: 1 },
  ])
  client.getQbLeaderboard.mockResolvedValue([
    { rosterId: 99, playerName: 'Pat Mahomes', teamAbbr: 'KC', tanya: 8.42, rank: 1 },
  ])
  client.getWeeklyTrends.mockResolvedValue([])
}

describe('HomePage', () => {
  afterEach(() => vi.clearAllMocks())

  it('previews the latest season from every section', async () => {
    stubHomeData()

    render(<MemoryRouter><HomePage /></MemoryRouter>)

    await waitFor(() => expect(screen.getAllByText('Chiefs')).toHaveLength(2))
    expect(screen.getByText('71.0%')).toBeInTheDocument()
    expect(screen.getByText('+1.4')).toBeInTheDocument()
    expect(screen.getByText('1623')).toBeInTheDocument()
    expect(screen.getByText('Pat Mahomes')).toBeInTheDocument()
    expect(screen.getByText('8.42')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
  })

  it('asks the QB leaderboard for the regular season by name, not a numeric stage', async () => {
    stubHomeData()

    render(<MemoryRouter><HomePage /></MemoryRouter>)

    await waitFor(() => expect(client.getQbLeaderboard).toHaveBeenCalled())
    expect(client.getQbLeaderboard).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'season', season: 7, stage: 'regular' }),
    )
  })

  it('links each preview card to its page', async () => {
    stubHomeData()

    render(<MemoryRouter><HomePage /></MemoryRouter>)

    const href = name => screen.getByRole('link', { name: new RegExp(name, 'i') }).getAttribute('href')
    await waitFor(() => expect(href('Standings')).toBe('/standings'))
    expect(href('^Games')).toBe('/games')
    expect(href('^Elo')).toBe('/elo')
    expect(href('^QBs')).toBe('/qb')
    expect(href('^Trends')).toBe('/trends')
    expect(href('^About')).toBe('/about')
  })

  it('uses the RZS Stats wordmark to return home from another page', async () => {
    stubHomeData()
    client.getSeasonTrends.mockResolvedValue([])

    render(<MemoryRouter initialEntries={['/trends']}><App /></MemoryRouter>)

    await userEvent.click(screen.getByRole('link', { name: /RZS Stats home/i }))

    await waitFor(() => expect(screen.getByText('Pat Mahomes')).toBeInTheDocument())
  })
})
