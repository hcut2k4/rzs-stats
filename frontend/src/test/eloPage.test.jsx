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
    client.getEloUpcoming.mockResolvedValue([])
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

  it('lists matchup teams alphabetically by nickname', async () => {
    client.getEloRatings.mockResolvedValue([rating(1, 'AAA', 1700, 1), rating(2, 'ZZZ', 1300, 2), rating(3, 'MMM', 1500, 3)])
    client.getEloMatchup.mockResolvedValue(null)
    render(<MemoryRouter><EloPage /></MemoryRouter>)
    await screen.findAllByText('AAAx')
    await userEvent.click(screen.getByRole('tab', { name: 'Matchup' }))
    const options = (await screen.findAllByLabelText('Team A'))[0].querySelectorAll('option')
    expect([...options].map(o => o.textContent)).toEqual(['AAAx', 'MMMx', 'ZZZx'])
  })

  it('explains column headings with tooltips', async () => {
    render(<MemoryRouter><EloPage /></MemoryRouter>)
    await screen.findAllByText('BUFx')
    expect(screen.getByText('vs 1500')).toHaveAttribute('title', expect.stringContaining('1500 average'))
    expect(screen.getByText('Rank move')).toHaveAttribute('title', expect.stringContaining('places'))
  })

  it('offers future weeks on the Games tab with projected win probabilities', async () => {
    client.getEloUpcoming.mockResolvedValue([{
      gameId: 9, season: 1, week: 23,
      homeTeam: { teamId: 1, abbrName: 'BUF', displayName: 'Bills' }, awayTeam: { teamId: 2, abbrName: 'MIA', displayName: 'Dolphins' },
      homeElo: 1700, awayElo: 1300, homeWinProbability: 0.909, awayWinProbability: 0.091,
    }])
    render(<MemoryRouter><EloPage /></MemoryRouter>)
    await screen.findAllByText('BUFx')
    expect(screen.queryByRole('option', { name: /projected/ })).toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: 'Games' }))
    await userEvent.selectOptions(screen.getByLabelText('Week'), '23')
    expect(await screen.findByText('90.9%')).toBeInTheDocument()
    expect(screen.getByText('Projected')).toBeInTheDocument()
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent)
    expect(headers).toEqual(['Away', 'Home', 'Away win prob.', 'Home win prob.'])
    const cells = screen.getAllByRole('cell').map(c => c.textContent)
    expect(cells.slice(-2)).toEqual(['9.1%', '90.9%'])
  })

  it('flags upsets on completed games and leaves expected results unmarked', async () => {
    const team = (id, abbrName) => ({ teamId: id, abbrName, displayName: abbrName + 'x' })
    const game = (gameId, homeScore, awayScore, homeWinProbability) => ({
      gameId, season: 1, week: 22, homeTeam: team(1, 'HOM'), awayTeam: team(2, 'AWY'),
      homePregameElo: 1500, awayPregameElo: 1500, homeWinProbability, awayWinProbability: 1 - homeWinProbability,
      homeScore, awayScore, margin: Math.abs(homeScore - awayScore), movMultiplier: 1, pointsMoved: 10,
      homePostgameElo: 1510, awayPostgameElo: 1490,
    })
    client.getEloGames.mockResolvedValue([game(1, 10, 20, 0.7), game(2, 20, 10, 0.7), game(3, 14, 14, 0.7)])
    render(<MemoryRouter><EloPage /></MemoryRouter>)
    await screen.findAllByText('BUFx')
    await userEvent.click(screen.getByRole('tab', { name: 'Games' }))
    expect(await screen.findByText('Upset · 30%')).toBeInTheDocument()
    expect(screen.getAllByText(/Upset ·/)).toHaveLength(1)
  })
})
