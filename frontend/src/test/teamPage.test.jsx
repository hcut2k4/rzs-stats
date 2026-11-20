import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import * as client from '../api/client'
import App from '../App'
import { TeamCell } from '../components/TeamLogo'
import TeamPage from '../pages/TeamPage'
import { clearLoadCache } from '../utils/useLoad'

vi.mock('../api/client')

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
window.scrollTo = () => {}

const A = { teamId: 1, abbrName: 'AAA', displayName: 'Aces' }
const B = { teamId: 2, abbrName: 'BBB', displayName: 'Bears' }

const standing = (t, wins, losses, pypat, season = 1) => ({
  ...t, cityName: t.abbrName === 'AAA' ? 'Alpha' : 'Beta', conference: 'AFC', division: 'AFC East', primaryColor: '16727040',
  wins, losses, ties: 0, gamesPlayed: wins + losses, pointsFor: 100 + season, pointsAgainst: 90, winPct: wins / (wins + losses),
  pythagoreanPat: pypat, winDiff: wins - pypat * (wins + losses), oppPyPatCurr: 0.5, oppPyPatPrev: 0.52,
  oppPyPatRemainingCurr: 0.48, oppPyPatRemainingPrev: 0.5, oppPyPatTotalCurr: 0.49, oppPyPatTotalPrev: 0.51,
})
const side = ppd => ({ drives: 50, plays: 300, pointsPerDrive: ppd, pointsPerPlay: 0.4, yardsPerPlay: 5, seriesRate: 0.7, thirdDownRate: 0.4, redZoneTdRate: 0.5, giveawayRate: 0.1, sackRate: 0.06 })
const eff = (t, off, def) => ({ ...t, games: 2, offense: side(off), defense: side(def), netPointsPerDrive: off - def })
const eloGame = (season, week, homeScore, awayScore) => ({
  gameId: season * 100 + week, season, week, homeTeam: A, awayTeam: B, homeScore, awayScore,
  homeWinProbability: 0.25, awayWinProbability: 0.75, homePregameElo: 1450, awayPregameElo: 1550,
  homePostgameElo: 1470, awayPostgameElo: 1530, margin: homeScore - awayScore, movMultiplier: 1, pointsMoved: 20,
})
const hist = (teamId, season, week, endElo, rank) => ({ teamId, season, week, seasonStart: week === 0, startElo: 1500, endElo, change: 5, rank })

describe('Team profile', () => {
  beforeEach(() => {
    clearLoadCache()
    client.getEloRatings.mockResolvedValue([{ teamId: 1, rank: 1 }, { teamId: 2, rank: 2 }])
    client.getSeasons.mockResolvedValue([0, 1])
    client.getStandings.mockImplementation(season => Promise.resolve(
      season === 1 ? [standing(A, 2, 0, 0.6), standing(B, 0, 2, 0.4)] : [standing(A, 5, 12, 0.3, 0), standing(B, 12, 5, 0.7, 0)]))
    client.getEfficiency.mockResolvedValue([eff(A, 2.5, 1.5), eff(B, 1.5, 2.5)])
    client.getQbLeaderboard.mockResolvedValue([
      { rosterId: '9', playerName: 'Ace Passer', teamAbbr: 'AAA', qualified: true, rank: 1, gamesPlayed: 2, passAtt: 60, tanya: 7.5, anya: 7.1, rushValue: 0.2, passerRating: 101, passYds: 500, passTd: 4, passInt: 1, rushYds: 30 },
      { rosterId: '8', playerName: 'Bear Passer', teamAbbr: 'BBB', qualified: true, rank: 2, gamesPlayed: 2, passAtt: 60, tanya: 5, anya: 5, rushValue: 0, passerRating: 80, passYds: 400, passTd: 2, passInt: 2, rushYds: 10 },
    ])
    client.getEloUpcoming.mockImplementation(season => Promise.resolve(season === 1 ? [
      { gameId: 900, season: 1, week: 2, homeTeam: B, awayTeam: A, homeElo: 1530, awayElo: 1470, homeWinProbability: 0.6, awayWinProbability: 0.4 },
    ] : []))
    client.getEloGames.mockResolvedValue([eloGame(0, 3, 20, 10), eloGame(1, 0, 24, 21), eloGame(1, 1, 30, 7)])
    client.getSeasonTrends.mockResolvedValue([
      { seasonIndex: 0, weekIndex: null, standings: [standing(A, 5, 12, 0.3, 0), standing(B, 12, 5, 0.7, 0)] },
      { seasonIndex: 1, weekIndex: null, standings: [standing(A, 2, 0, 0.6), standing(B, 0, 2, 0.4)] },
    ])
    client.getEloHistory.mockResolvedValue([
      hist(1, 0, 17, 1440, 2), hist(2, 0, 17, 1560, 1), hist(1, 1, 1, 1490, 1), hist(2, 1, 1, 1510, 2),
    ])
  })
  afterEach(() => vi.clearAllMocks())

  const kpi = label => screen.getAllByText(label).find(e => e.closest('dt')).closest('dt').parentElement
  const renderAt = path => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)

  it('shows the latest season profile with every section', async () => {
    renderAt('/teams/aaa')
    expect(await screen.findByRole('heading', { level: 1, name: 'Aces' })).toBeInTheDocument()
    expect(client.getStandings).toHaveBeenCalledWith(1)
    expect(client.getEfficiency).toHaveBeenCalledWith(1, 'regular')
    await waitFor(() => expect(client.getEloGames).toHaveBeenCalledWith(undefined, undefined, 1))
    for (const name of ['Team Fingerprint', 'Truth Behind the Scoreboard', 'Road Ahead', 'Season Arc', 'League Landscape', 'QB Room', 'Franchise History', 'Rivalries']) {
      expect(await screen.findByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    expect(within(kpi('Record')).getByText('2-0')).toBeInTheDocument()
    expect(within(kpi('Record')).getByText('1st in AFC East')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Ace Passer' })).toHaveAttribute('href', 'https://neonsportz.com/leagues/RZS/players/9')
    expect(screen.queryByText('Bear Passer')).not.toBeInTheDocument()
    const arc = screen.getByRole('region', { name: 'Season Arc' })
    expect(await within(arc).findAllByText('Big upset win')).toHaveLength(2)
    const road = screen.getByRole('region', { name: 'Road Ahead' })
    expect(await within(road).findByText('2-1')).toBeInTheDocument()
    const rivals = screen.getByRole('region', { name: 'Rivalries' })
    expect(await within(rivals).findByText('3-0')).toBeInTheDocument()
  })

  it('switches season and drops the remaining schedule for a finished season', async () => {
    renderAt('/teams/AAA')
    await screen.findByRole('heading', { name: 'Road Ahead' })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Season' }), 'Season 103')
    await waitFor(() => expect(within(kpi('Record')).getByText('5-12')).toBeInTheDocument())
    expect(client.getStandings).toHaveBeenCalledWith(0)
    expect(screen.queryByRole('heading', { name: 'Road Ahead' })).not.toBeInTheDocument()
  })

  it('keeps the season when following an opponent link', async () => {
    renderAt('/teams/AAA?season=103')
    const arc = await screen.findByRole('region', { name: 'Season Arc' })
    expect(within(arc).getByRole('link', { name: 'vs BBB' })).toHaveAttribute('href', '/teams/BBB?season=103')
  })

  it('never shows the previous season while the next one loads', async () => {
    let finish
    client.getStandings.mockImplementation(season => (season === 0
      ? new Promise(resolve => { finish = () => resolve([standing(A, 5, 12, 0.3, 0), standing(B, 12, 5, 0.7, 0)]) })
      : Promise.resolve([standing(A, 2, 0, 0.6), standing(B, 0, 2, 0.4)])))
    renderAt('/teams/AAA')
    await screen.findByRole('heading', { level: 1, name: 'Aces' })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Season' }), 'Season 103')
    expect(screen.queryByText('2-0')).not.toBeInTheDocument()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    finish()
    await screen.findByRole('heading', { level: 1, name: 'Aces' })
    expect(within(kpi('Record')).getByText('5-12')).toBeInTheDocument()
  })

  it('ignores a response for a season the user has already left', async () => {
    let finishOld
    client.getStandings.mockImplementation(season => (season === 0
      ? new Promise(resolve => { finishOld = () => resolve([standing(A, 5, 12, 0.3, 0), standing(B, 12, 5, 0.7, 0)]) })
      : Promise.resolve([standing(A, 2, 0, 0.6), standing(B, 0, 2, 0.4)])))
    const router = createMemoryRouter([{ path: '/teams/:abbr', element: <TeamPage /> }], { initialEntries: ['/teams/AAA?season=103'] })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(client.getStandings).toHaveBeenCalledWith(0))
    await act(() => router.navigate('/teams/AAA'))
    await waitFor(() => expect(within(kpi('Record')).getByText('2-0')).toBeInTheDocument())
    await act(async () => { finishOld() })
    expect(within(kpi('Record')).getByText('2-0')).toBeInTheDocument()
    expect(within(kpi('Record')).queryByText('5-12')).not.toBeInTheDocument()
  })

  it('keeps a tie in the projected record', async () => {
    client.getStandings.mockResolvedValue([{ ...standing(A, 1, 0, 0.6), ties: 1, gamesPlayed: 2 }, standing(B, 0, 2, 0.4)])
    client.getEloUpcoming.mockResolvedValue([
      { gameId: 900, season: 1, week: 2, homeTeam: B, awayTeam: A, homeElo: 1520, awayElo: 1480, homeWinProbability: 0.6, awayWinProbability: 0.4 },
    ])
    renderAt('/teams/AAA')
    const road = await screen.findByRole('region', { name: 'Road Ahead' })
    expect(within(road).getByText('1-1-1')).toBeInTheDocument()
  })

  it('says when no seasons have been synced', async () => {
    client.getSeasons.mockResolvedValue([])
    renderAt('/teams/AAA')
    expect(await screen.findByText('No seasons have been synced yet.')).toBeInTheDocument()
  })

  it('says so for an unknown team', async () => {
    renderAt('/teams/ZZZ')
    expect(await screen.findByText('Team not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse all teams' })).toHaveAttribute('href', '/teams')
  })

  it('lists every team by division on the index', async () => {
    renderAt('/teams')
    const division = await screen.findByRole('region', { name: 'AFC East' })
    expect(within(division).getAllByRole('link').map(l => l.getAttribute('href'))).toEqual(['/teams/AAA', '/teams/BBB'])
    expect(await within(division).findByText('Elo #1')).toBeInTheDocument()
    expect(within(division).getByLabelText(/^Last \d results W/)).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Teams' })).toHaveAttribute('href', '/teams')
  })
})

it('links a team name to its profile wherever TeamCell is used', () => {
  render(<MemoryRouter><TeamCell abbr="AAA" name="Aces" /></MemoryRouter>)
  expect(screen.getByRole('link', { name: 'Aces' })).toHaveAttribute('href', '/teams/AAA')
})
