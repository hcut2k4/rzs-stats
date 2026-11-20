import { fireEvent, render, screen } from '@testing-library/react'
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

  it('sorts the ratings table on any heading', async () => {
    const r = (teamId, abbrName, elo, rank, change, rankChange, gamesCounted) => ({
      teamId, abbrName, displayName: abbrName + 'x', elo, rank, change, prevRank: rank, rankChange, gamesCounted,
    })
    client.getEloRatings.mockResolvedValue([
      r(1, 'AAA', 1600, 1, -8, 0, 20),
      r(2, 'BBB', 1400, 3, 12, -1, 5),
      r(3, 'CCC', 1500, 2, 3, 1, 12),
    ])
    render(<MemoryRouter><EloPage /></MemoryRouter>)
    await screen.findAllByText('AAAx')
    const elos = () => screen.getAllByRole('cell').map(c => c.textContent).filter(t => /^1\d00$/.test(t))
    const head = name => screen.getByRole('columnheader', { name: new RegExp('^' + name) })

    expect(elos()).toEqual(['1600', '1400', '1500'])

    await userEvent.click(head('Elo'))
    expect(elos()).toEqual(['1600', '1500', '1400'])
    expect(head('Elo')).toHaveAttribute('aria-sort', 'descending')
    await userEvent.click(head('Elo'))
    expect(elos()).toEqual(['1400', '1500', '1600'])
    expect(head('Elo')).toHaveAttribute('aria-sort', 'ascending')

    await userEvent.click(head('Change'))
    expect(elos()).toEqual(['1400', '1500', '1600'])

    await userEvent.click(head('Games'))
    expect(elos()).toEqual(['1600', '1500', '1400'])

    await userEvent.click(head('Rank move'))
    expect(elos()).toEqual(['1500', '1600', '1400'])

    await userEvent.click(head('Team'))
    expect(elos()).toEqual(['1500', '1400', '1600'])
  })

  it('marks only the changed team and explains the owner regression in its tooltip', async () => {
    const rect = { width: 800, height: 460, top: 0, left: 0, right: 800, bottom: 460 }
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect)
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) { this.callback = callback }
      observe(target) { this.callback([{ target, contentRect: rect }]) }
      unobserve() {}
      disconnect() {}
    })
    client.getEloHistory.mockResolvedValue([
      hist(1, 0), { ...hist(1, 1), ownerReset: true }, hist(1, 2),
      { ...hist(1, 1), teamId: 2, ownerReset: false },
    ])
    try {
      const { container } = render(<MemoryRouter initialEntries={['/elo?tab=history']}><EloPage /></MemoryRouter>)
      const marker = await screen.findByLabelText('BUF owner change')
      expect(container.querySelectorAll('circle[aria-label$="owner change"]')).toHaveLength(1)
      const chart = container.querySelector('.recharts-wrapper')
      Object.defineProperty(chart, 'offsetWidth', { configurable: true, value: 800 })
      Object.defineProperty(chart, 'offsetHeight', { configurable: true, value: 460 })
      fireEvent.mouseMove(chart, { clientX: Number(marker.getAttribute('cx')), clientY: Number(marker.getAttribute('cy')) })
      expect(await screen.findByText('Owner change: regressed toward 1500')).toBeVisible()
    } finally {
      bounds.mockRestore()
      vi.unstubAllGlobals()
    }
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
    expect(await screen.findByText('91%')).toBeInTheDocument()
    expect(screen.getByText('Projected')).toBeInTheDocument()
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent)
    expect(headers).toEqual(['Away', 'Home', 'Away ◀ Edge ▶ Home', 'Favored', 'Outlook ▲'])
    const cells = screen.getAllByRole('cell').map(c => c.textContent)
    expect(cells.slice(-2)).toEqual(['BUF 91%', 'Solid'])
  })

  it('sorts projected games by win probability by default and on any heading', async () => {
    const team = (id, abbrName) => ({ teamId: id, abbrName, displayName: abbrName + 'x' })
    const game = (gameId, homeWinProbability) => ({
      gameId, season: 1, week: 23,
      homeTeam: team(gameId, 'H' + gameId), awayTeam: team(gameId + 50, 'A' + gameId),
      homeElo: 1600 - gameId * 10, awayElo: 1400 + gameId * 10,
      homeWinProbability, awayWinProbability: 1 - homeWinProbability,
    })
    client.getEloUpcoming.mockResolvedValue([game(1, 0.52), game(2, 0.88), game(3, 0.65), game(4, 0.15)])
    render(<MemoryRouter><EloPage /></MemoryRouter>)
    await screen.findAllByText('BUFx')
    await userEvent.click(screen.getByRole('tab', { name: 'Games' }))
    await userEvent.selectOptions(screen.getByLabelText('Week'), '23')

    const homes = () => screen.getAllByRole('cell').map(c => c.textContent).filter(t => /^H\d1\d{3}$/.test(t)).map(t => t.slice(0, 2))
    expect(await screen.findByText('88%')).toBeInTheDocument()
    expect(homes()).toEqual(['H1', 'H3', 'H4', 'H2'])
    expect(screen.getByRole('columnheader', { name: /Outlook/ })).toHaveAttribute('aria-sort', 'ascending')

    await userEvent.click(screen.getByText('Favored'))
    expect(homes()).toEqual(['H2', 'H4', 'H3', 'H1'])
    expect(screen.getByRole('columnheader', { name: /Favored/ })).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByRole('columnheader', { name: /Outlook/ })).toHaveAttribute('aria-sort', 'none')

    await userEvent.click(screen.getByText('Favored'))
    expect(homes()).toEqual(['H1', 'H3', 'H4', 'H2'])
    expect(screen.getByRole('columnheader', { name: /Favored/ })).toHaveAttribute('aria-sort', 'ascending')

    await userEvent.click(screen.getByText('Outlook'))
    expect(homes()).toEqual(['H2', 'H4', 'H3', 'H1'])
    await userEvent.click(screen.getByText('Outlook'))
    expect(homes()).toEqual(['H1', 'H3', 'H4', 'H2'])

    await userEvent.click(screen.getByText('Away ◀ Edge ▶ Home'))
    expect(homes()).toEqual(['H2', 'H3', 'H1', 'H4'])

    await userEvent.click(screen.getByText('Away'))
    expect(homes()).toEqual(['H4', 'H3', 'H2', 'H1'])

    await userEvent.click(screen.getByText('Home'))
    expect(homes()).toEqual(['H1', 'H2', 'H3', 'H4'])
  })

  it('shows other remaining weeks only in Rest of season and sorts by week and favorite chance', async () => {
    const game = (gameId, season, week, homeWinProbability) => ({
      gameId, season, week,
      homeTeam: { abbrName: 'H' + gameId }, awayTeam: { abbrName: 'A' + gameId },
      homeElo: 1500, awayElo: 1500, homeWinProbability, awayWinProbability: 1 - homeWinProbability,
    })
    client.getEloUpcoming.mockResolvedValue([
      game(1, 1, 22, 0.8), game(2, 1, 23, 0.48), game(3, 1, 24, 0.1), game(4, 2, 22, 0.51),
    ])
    render(<MemoryRouter><EloPage /></MemoryRouter>)
    await screen.findAllByText('BUFx')
    await userEvent.click(screen.getByRole('tab', { name: 'Games' }))
    await screen.findByText('80%')
    expect(screen.getByRole('button', { name: 'This week' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('52%')).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /Week/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Rest of season' }))
    const homes = () => screen.getAllByRole('cell').map(c => c.textContent).filter(t => /^H\d1500$/.test(t))
    expect(homes()).toEqual(['H21500', 'H11500', 'H31500'])
    expect(screen.queryByText('H4')).not.toBeInTheDocument()
    expect(screen.getByText('Super Bowl', { selector: 'td' })).toBeInTheDocument()
    await userEvent.click(screen.getByText('Favored'))
    expect(homes()).toEqual(['H31500', 'H11500', 'H21500'])
    await userEvent.click(screen.getByText('Favored'))
    expect(homes()).toEqual(['H21500', 'H11500', 'H31500'])
    await userEvent.click(screen.getByRole('columnheader', { name: /^Week/ }))
    expect(homes()).toEqual(['H31500', 'H21500', 'H11500'])
    await userEvent.click(screen.getByRole('columnheader', { name: /^Week/ }))
    expect(homes()).toEqual(['H11500', 'H21500', 'H31500'])

    await userEvent.click(screen.getByRole('button', { name: 'This week' }))
    expect(homes()).toEqual(['H11500'])
    expect(screen.queryByRole('columnheader', { name: /^Week/ })).not.toBeInTheDocument()
  })

  it('offers Rest of season when the selected week has no projections', async () => {
    client.getEloUpcoming.mockResolvedValue([{
      gameId: 9, season: 1, week: 23,
      homeTeam: { abbrName: 'BUF' }, awayTeam: { abbrName: 'MIA' },
      homeElo: 1700, awayElo: 1300, homeWinProbability: 0.9, awayWinProbability: 0.1,
    }])
    render(<MemoryRouter><EloPage /></MemoryRouter>)
    await screen.findAllByText('BUFx')
    await userEvent.click(screen.getByRole('tab', { name: 'Games' }))
    expect(screen.queryByText('90%')).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Rest of season' }))
    expect(await screen.findByText('90%')).toBeInTheDocument()
  })

  it('rates each projection on the Outlook tiers, shading the closest games heaviest', async () => {
    const team = (id, abbrName) => ({ teamId: id, abbrName, displayName: abbrName + 'x' })
    const game = (gameId, homeWinProbability) => ({
      gameId, season: 1, week: 23,
      homeTeam: team(gameId, 'H' + gameId), awayTeam: team(gameId + 50, 'A' + gameId),
      homeElo: 1500, awayElo: 1500, homeWinProbability, awayWinProbability: 1 - homeWinProbability,
    })
    client.getEloUpcoming.mockResolvedValue([game(1, 0.52), game(2, 0.58), game(3, 0.66), game(4, 0.78), game(5, 0.9)])
    render(<MemoryRouter><EloPage /></MemoryRouter>)
    await screen.findAllByText('BUFx')
    await userEvent.click(screen.getByRole('tab', { name: 'Games' }))
    await userEvent.selectOptions(screen.getByLabelText('Week'), '23')

    await screen.findByText('Toss-up')
    const tiers = screen.getAllByRole('cell').filter(c => /^(Toss-up|Tilt|Lean|Likely|Solid)$/.test(c.textContent))
    expect(tiers.map(c => c.textContent)).toEqual(['Toss-up', 'Tilt', 'Lean', 'Likely', 'Solid'])
    expect(screen.getByText(/1 toss-up this week/)).toBeInTheDocument()

    expect(tiers[0]).toHaveStyle({ backgroundColor: 'rgb(22 163 74 / 0.272)' })
    expect(tiers[1]).toHaveStyle({ backgroundColor: 'rgb(37 99 235 / 0.198)' })
    expect(tiers[2]).toHaveStyle({ backgroundColor: 'rgb(147 51 234 / 0.198)' })
    expect(tiers[3]).toHaveStyle({ backgroundColor: 'rgb(234 88 12 / 0.124)' })
    expect(tiers[4]).toHaveStyle({ backgroundColor: 'rgb(234 179 8 / 0.235)' })
  })

  it('shades darker toward the competitive end within a single tier', async () => {
    const team = (id, abbrName) => ({ teamId: id, abbrName, displayName: abbrName + 'x' })
    const game = (gameId, homeWinProbability) => ({
      gameId, season: 1, week: 23,
      homeTeam: team(gameId, 'H' + gameId), awayTeam: team(gameId + 50, 'A' + gameId),
      homeElo: 1500, awayElo: 1500, homeWinProbability, awayWinProbability: 1 - homeWinProbability,
    })
    client.getEloUpcoming.mockResolvedValue([game(1, 0.505), game(2, 0.545)])
    render(<MemoryRouter><EloPage /></MemoryRouter>)
    await screen.findAllByText('BUFx')
    await userEvent.click(screen.getByRole('tab', { name: 'Games' }))
    await userEvent.selectOptions(screen.getByLabelText('Week'), '23')

    await screen.findByText(/2 toss-ups this week/)
    const tiers = screen.getAllByRole('cell').filter(c => c.textContent === 'Toss-up')
    expect(tiers).toHaveLength(2)
    expect(tiers[0]).toHaveStyle({ backgroundColor: 'rgb(22 163 74 / 0.383)' })
    expect(tiers[1]).toHaveStyle({ backgroundColor: 'rgb(22 163 74 / 0.087)' })
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
    expect(await screen.findByText('Big upset · 30%')).toBeInTheDocument()
    expect(screen.getAllByText(/upset ·|Stunner ·/i)).toHaveLength(1)
  })

  it('sizes an upset by the favorite it beat and says nothing when the game was a toss-up', async () => {
    const team = (id, abbrName) => ({ teamId: id, abbrName, displayName: abbrName + 'x' })
    // the away team always wins, so homeWinProbability is the beaten favorite's chance
    const game = (gameId, favChance) => ({
      gameId, season: 1, week: 22, homeTeam: team(gameId, 'H' + gameId), awayTeam: team(gameId + 50, 'A' + gameId),
      homePregameElo: 1500, awayPregameElo: 1500, homeWinProbability: favChance, awayWinProbability: 1 - favChance,
      homeScore: 10, awayScore: 20, margin: 10, movMultiplier: 1, pointsMoved: 10,
      homePostgameElo: 1510, awayPostgameElo: 1490,
    })
    client.getEloGames.mockResolvedValue([game(1, 0.52), game(2, 0.57), game(3, 0.65), game(4, 0.78), game(5, 0.9)])
    render(<MemoryRouter><EloPage /></MemoryRouter>)
    await screen.findAllByText('BUFx')
    await userEvent.click(screen.getByRole('tab', { name: 'Games' }))

    expect(await screen.findByText('Stunner · 10%')).toBeInTheDocument()
    expect(screen.getByText('Slight upset · 43%')).toBeInTheDocument()
    expect(screen.getByText('Upset · 35%')).toBeInTheDocument()
    expect(screen.getByText('Big upset · 22%')).toBeInTheDocument()
    expect(screen.queryByText(/48%/)).toBeNull()

    expect(screen.getByText('Slight upset · 43%')).toHaveStyle({ backgroundColor: 'rgb(220 38 38 / 0.12)' })
    expect(screen.getByText('Stunner · 10%')).toHaveStyle({ backgroundColor: 'rgb(220 38 38 / 0.42)' })
  })

  it('opens the Games tab directly from a ?tab=games link', async () => {
    render(<MemoryRouter initialEntries={['/elo?tab=games']}><EloPage /></MemoryRouter>)
    // The Games tab renders abbreviations, not displayName, so wait on the tab itself
    expect(await screen.findByRole('tab', { name: 'Games', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Ratings' })).toHaveAttribute('aria-selected', 'false')
  })

  it('ignores an unknown tab in the URL and falls back to Ratings', async () => {
    render(<MemoryRouter initialEntries={['/elo?tab=bogus']}><EloPage /></MemoryRouter>)
    await screen.findAllByText('BUFx')
    expect(screen.getByRole('tab', { name: 'Ratings' })).toHaveAttribute('aria-selected', 'true')
  })
})
