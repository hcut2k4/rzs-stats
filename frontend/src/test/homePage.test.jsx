import { render, screen, waitFor, within } from '@testing-library/react'
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
  client.getEfficiency.mockResolvedValue([])
  client.getWeeklyTrends.mockResolvedValue([])
  client.getEloUpcoming.mockResolvedValue([
    upcomingGame(50, 3, team(1, 'KC'), team(2, 'SF'), 0.92),   // Solid
    upcomingGame(51, 4, team(3, 'BUF'), team(4, 'MIA'), 0.52), // Toss-up
    upcomingGame(52, 5, team(5, 'DAL'), team(6, 'PHI'), 0.63), // Lean
  ])
}

const upcomingGame = (gameId, week, homeTeam, awayTeam, homeWinProbability) => ({
  gameId, week, season: 7, homeTeam, awayTeam,
  homeElo: 1600, awayElo: 1500,
  homeWinProbability, awayWinProbability: 1 - homeWinProbability,
})

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

  it('shows only the first two upcoming weeks in the latest season, closest first', async () => {
    stubHomeData()
    client.getEloUpcoming.mockResolvedValue([
      upcomingGame(50, 3, team(1, 'KC'), team(2, 'SF'), 0.92),
      upcomingGame(51, 4, team(3, 'BUF'), team(4, 'MIA'), 0.52),
      upcomingGame(52, 5, team(5, 'DAL'), team(6, 'PHI'), 0.501),
      { ...upcomingGame(53, 0, team(7, 'OLD'), team(8, 'PAST'), 0.5), season: 6 },
    ])

    render(<MemoryRouter><HomePage /></MemoryRouter>)

    await waitFor(() => expect(screen.getByText('Best Games Ahead')).toBeInTheDocument())

    const card = within(screen.getByRole('link', { name: /Best Games Ahead/ }))
    expect(await card.findByText('52%')).toBeInTheDocument()
    expect(card.getByText('Wk 4')).toBeInTheDocument()
    expect(card.getByText('Wk 5')).toBeInTheDocument()
    expect(card.queryByText('Wk 6')).not.toBeInTheDocument()
    expect(card.queryByText('DAL')).not.toBeInTheDocument()
    expect(card.queryByText('OLD')).not.toBeInTheDocument()
    expect(card.getAllByText(/^(Toss-up|Tilt|Lean|Likely|Solid)$/).map(n => n.textContent)).toEqual(['Toss-up', 'Solid'])
  })

  it('names the favored team and its rounded win chance', async () => {
    stubHomeData()

    render(<MemoryRouter><HomePage /></MemoryRouter>)

    await screen.findByText('BUF')
    expect(screen.getByText('52%')).toBeInTheDocument()
    expect(screen.getByText('92%')).toBeInTheDocument()
  })

  it('shows an empty preview when nothing is left to project', async () => {
    stubHomeData()
    client.getEloUpcoming.mockResolvedValue([])

    render(<MemoryRouter><HomePage /></MemoryRouter>)

    const card = within(screen.getByRole('link', { name: /Best Games Ahead/ }))
    expect(await card.findByText('No data yet.')).toBeInTheDocument()
  })

  it('links the best games through to the Elo page games tab', async () => {
    stubHomeData()

    render(<MemoryRouter><HomePage /></MemoryRouter>)

    await waitFor(() => expect(screen.getByText('Best Games Ahead')).toBeInTheDocument())
    const card = screen.getByRole('link', { name: /Best Games Ahead/i })
    expect(card).toHaveAttribute('href', '/elo?tab=games')
    expect(card.parentElement.firstElementChild).toBe(card)
    expect(card.parentElement).toHaveClass('grid', 'lg:grid-cols-3')
  })

  it('links each preview card to its page', async () => {
    stubHomeData()

    render(<MemoryRouter><HomePage /></MemoryRouter>)

    const href = name => screen.getByRole('link', { name: new RegExp(name, 'i') }).getAttribute('href')
    await waitFor(() => expect(href('Standings')).toBe('/standings'))
    expect(href('^Games')).toBe('/games')
    expect(href('^Elo')).toBe('/elo')
    expect(href('^QBs')).toBe('/qb')
    expect(href('^Trends')).toBe('/standings?tab=weekly')
    expect(href('^About')).toBe('/about')
  })

  it('uses the RZS Stats wordmark to return home from another page', async () => {
    stubHomeData()

    render(<MemoryRouter initialEntries={['/about']}><App /></MemoryRouter>)

    await userEvent.click(screen.getByRole('link', { name: /RZS Stats home/i }))

    await waitFor(() => expect(screen.getByText('Pat Mahomes')).toBeInTheDocument())
  })
  it('previews the top efficiency teams with signed net points per drive and links to Efficiency', async () => {
    stubHomeData()
    client.getEfficiency.mockResolvedValue([
      { ...team(1, 'KC', 'Chiefs'), netPointsPerDrive: 0.4 },
      { ...team(2, 'SF', '49ers'), netPointsPerDrive: -0.25 },
      { ...team(3, 'BUF', 'Bills'), netPointsPerDrive: -0.3 },
      { ...team(4, 'MIA', 'Dolphins'), netPointsPerDrive: -0.4 },
      { ...team(5, 'DAL', 'Cowboys'), netPointsPerDrive: -0.5 },
      { ...team(6, 'PHI', 'Eagles'), netPointsPerDrive: -0.6 },
    ])
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    const link = screen.getByRole('link', { name: /^Efficiency/ })
    const card = within(link)
    expect(await card.findByText('+0.40')).toBeInTheDocument()
    expect(card.getByText('-0.25')).toBeInTheDocument()
    expect(card.getByText('Chiefs')).toBeInTheDocument()
    expect(card.getByText('49ers')).toBeInTheDocument()
    expect(card.queryByText('Eagles')).not.toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/efficiency')
    expect(client.getEfficiency).toHaveBeenCalledWith(7, 'regular')
  })

  it('keeps the other previews visible when efficiency fails to load', async () => {
    stubHomeData()
    client.getEfficiency.mockRejectedValue(new Error('Unavailable'))
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    const card = within(screen.getByRole('link', { name: /^Efficiency/ }))
    expect(await card.findByText('No data yet.')).toBeInTheDocument()
    expect(await screen.findByText('Pat Mahomes')).toBeInTheDocument()
    expect(screen.getByText('71.0%')).toBeInTheDocument()
    expect(screen.getByText('1623')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    expect(screen.getByText('52%')).toBeInTheDocument()
  })
})
