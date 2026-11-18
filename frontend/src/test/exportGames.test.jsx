import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import GamesPage from '../pages/GamesPage'
import HomePage from '../pages/HomePage'
import * as client from '../api/client'
import { aiText, buildWorkbook, csvText, toRows } from '../utils/exportTable'
import { TIERS, lean } from '../utils/eloLean'

vi.mock('../api/client')
const { specs } = vi.hoisted(() => ({ specs: new Map() }))
vi.mock('../components/ExportMenu', async importOriginal => {
  const { default: ExportMenu } = await importOriginal()
  return { default: ({ spec }) => { specs.set(spec.name, spec); return <ExportMenu spec={spec} /> } }
})

const awayTeam = { abbrName: 'BUF', displayName: 'Bills' }
const homeTeam = { abbrName: 'NE', displayName: 'Patriots' }
const game = { gameId: 10, nsPk: 900, awayTeam, homeTeam, awayScore: 7, homeScore: 14, status: 2, simmed: true }
const deferred = () => {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  specs.clear()
  client.getSeasons.mockResolvedValue([5])
  client.getAvailableWeeks.mockImplementation((season, stage) => Promise.resolve(stage === 2 ? [18, 19] : [0, 1]))
  client.getGames.mockResolvedValue([game])
  client.getStandings.mockResolvedValue([])
  client.getEloHistory.mockResolvedValue([])
  client.getQbLeaderboard.mockResolvedValue([])
  client.getEfficiency.mockResolvedValue([])
  client.getWeeklyTrends.mockResolvedValue([])
  client.getEloUpcoming.mockResolvedValue([])
})
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals() })

async function showGames() {
  render(<MemoryRouter><GamesPage /></MemoryRouter>)
  await waitFor(() => expect(specs.has('Games')).toBe(true))
  return specs.get('Games')
}

function Location() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

describe('Games exports', () => {
  it('exports displayed order, names, scores, winner, status, simulation and nsPk recap links', async () => {
    client.getGames.mockResolvedValue([game, { ...game, gameId: 11, nsPk: null, awayScore: 20, homeScore: 3, simmed: false }])
    const spec = await showGames()
    expect(toRows(spec)).toEqual([
      ['Away', 'Away Score', 'Home Score', 'Home', 'Winner', 'Status', 'Simmed', 'NeonSportz URL'],
      ['Bills', '7', '14', 'Patriots', 'Patriots', 'Final', 'Yes', 'https://neonsportz.com/leagues/RZS/games/900'],
      ['Bills', '20', '3', 'Patriots', 'Bills', 'Final', 'No', 'https://neonsportz.com/leagues/RZS/games/11'],
    ])
    expect(spec.qualifier).toBe('Season 108 · Regular season · Week 2 · 2 games')
    expect(spec.cols.every(c => c.desc?.trim())).toBe(true)
    expect(spec.api).toMatchObject({ path: '/games', params: { season: 5, stage: 1, week: 1 } })
    expect(aiText(spec, 'https://example.com')).toContain('GET https://example.com/api/games?season=5&stage=1&week=1')
    const wb = buildWorkbook(spec)
    expect(wb.Sheets[wb.SheetNames[0]].B2).toMatchObject({ t: 'n', v: 7, z: '0' })
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', toRows(spec)[1][7])
  })

  it('exports empty unplayed scores and winner, and identifies a completed tie', async () => {
    client.getGames.mockResolvedValue([
      { ...game, awayScore: null, homeScore: null, status: 1 },
      { ...game, gameId: 11, awayScore: 0, homeScore: 0, status: 3 },
    ])
    const spec = await showGames()
    expect(toRows(spec)[1].slice(1, 6)).toEqual(['', '', 'Patriots', '', 'Unplayed'])
    expect(toRows(spec)[2].slice(1, 6)).toEqual(['0', '0', 'Patriots', 'Tie', 'Final'])
    expect(csvText(spec)).toContain('Bills,,,Patriots,,Unplayed')
    const wb = buildWorkbook(spec)
    expect(wb.Sheets[wb.SheetNames[0]].B2.v).toBe('')
    expect(wb.Sheets[wb.SheetNames[0]].C2.v).toBe('')
  })

  it('updates numeric request parameters and qualifiers when week and stage change', async () => {
    await showGames()
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: '0' } })
    await waitFor(() => expect(specs.get('Games').api.params).toEqual({ season: 5, stage: 1, week: 0 }))
    expect(client.getGames).toHaveBeenLastCalledWith(5, 1, 0)
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '2' } })
    await waitFor(() => expect(specs.get('Games').api.params).toEqual({ season: 5, stage: 2, week: 19 }))
    expect(client.getGames).toHaveBeenLastCalledWith(5, 2, 19)
    expect(specs.get('Games').qualifier).toBe('Season 108 · Playoffs · Divisional · 1 games')
  })

  it('ignores an older week response after the selected week has resolved', async () => {
    const old = deferred()
    const latest = { ...game, gameId: 12, awayScore: 28 }
    client.getGames.mockReturnValueOnce(old.promise).mockResolvedValueOnce([latest])
    render(<MemoryRouter><GamesPage /></MemoryRouter>)
    await waitFor(() => expect(client.getGames).toHaveBeenCalledWith(5, 1, 1))
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: '0' } })
    await waitFor(() => expect(specs.get('Games')?.api.params.week).toBe(0))
    await act(async () => old.resolve([game]))
    const spec = specs.get('Games')
    expect(spec.rows).toEqual([latest])
    expect(spec.api.params).toEqual({ season: 5, stage: 1, week: 0 })
    expect(spec.qualifier).toContain('Week 1')
    expect(screen.getByText('28')).toBeInTheDocument()
    expect(screen.queryByText('7')).not.toBeInTheDocument()
  })

  it('keeps playoff week options when an older regular-season weeks request resolves', async () => {
    const old = deferred()
    client.getAvailableWeeks.mockImplementation((season, stage) => stage === 1 ? old.promise : Promise.resolve([18, 19]))
    render(<MemoryRouter><GamesPage /></MemoryRouter>)
    await waitFor(() => expect(client.getAvailableWeeks).toHaveBeenCalledWith(5, 1))
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '2' } })
    await waitFor(() => expect(specs.get('Games')?.api.params).toEqual({ season: 5, stage: 2, week: 19 }))
    await act(async () => old.resolve([0, 1]))
    expect(screen.getAllByRole('combobox')[2]).toHaveValue('19')
    expect(screen.getByRole('option', { name: 'Divisional' })).toBeInTheDocument()
    expect(specs.get('Games').api.params).toEqual({ season: 5, stage: 2, week: 19 })
  })

  it('stops loading and drops stale games when the new stage has no weeks', async () => {
    await showGames()
    const pending = deferred()
    client.getAvailableWeeks.mockImplementation((season, stage) => Promise.resolve(stage === 2 ? [] : [0, 1]))
    client.getGames.mockReturnValueOnce(pending.promise)
    fireEvent.change(screen.getByDisplayValue('Regular Season'), { target: { value: '2' } })
    await screen.findByText('No games found for this week.')
    expect(screen.queryByText('Loading...')).toBeNull()
    await act(async () => pending.resolve([game]))
    expect(screen.getByText('No games found for this week.')).toBeTruthy()
    expect(screen.queryByText('Loading...')).toBeNull()
  })

  it('ignores an older stage response after playoff rows have resolved', async () => {
    const old = deferred()
    const playoff = { ...game, gameId: 13, homeScore: 35 }
    client.getGames.mockImplementation((season, stage) => stage === 1 ? old.promise : Promise.resolve([playoff]))
    render(<MemoryRouter><GamesPage /></MemoryRouter>)
    await waitFor(() => expect(client.getGames).toHaveBeenCalledWith(5, 1, 1))
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '2' } })
    await waitFor(() => expect(specs.get('Games')?.api.params).toEqual({ season: 5, stage: 2, week: 19 }))
    await act(async () => old.resolve([game]))
    expect(specs.get('Games').rows).toEqual([playoff])
    expect(specs.get('Games').api.params).toEqual({ season: 5, stage: 2, week: 19 })
    expect(screen.getByText('35')).toBeInTheDocument()
  })
})

describe('Home Best Games exports', () => {
  const upcoming = (id, week, prob, season = 5) => ({
    gameId: id, season, week,
    awayTeam: { abbrName: `A${id}` }, homeTeam: { abbrName: `H${id}` },
    homeWinProbability: prob, awayWinProbability: 1 - prob,
  })

  async function showHome() {
    client.getEloUpcoming.mockResolvedValue([
      upcoming(1, 18, 0.85), upcoming(2, 19, 0.25), upcoming(3, 18, 0.65),
      upcoming(4, 19, 0.42), upcoming(5, 18, 0.51), upcoming(6, 18, 0.95),
      upcoming(7, 20, 0.50), upcoming(8, 0, 0.50, 4),
    ])
    render(<MemoryRouter><HomePage /><Location /></MemoryRouter>)
    await waitFor(() => expect(specs.has('Best Games Ahead')).toBe(true))
    return specs.get('Best Games Ahead')
  }

  it('exports exactly the five displayed games, favorite probabilities and shared outlook tiers', async () => {
    const spec = await showHome()
    expect(toRows(spec)[0]).toEqual(['Week', 'Away', 'Home', 'Favored', 'Favored Win Prob', 'Outlook'])
    expect(toRows(spec).slice(1)).toEqual([
      ['Wild Card', 'A5', 'H5', 'H5', '51%', TIERS[0].label],
      ['Divisional', 'A4', 'H4', 'A4', '58%', TIERS[1].label],
      ['Wild Card', 'A3', 'H3', 'H3', '65%', TIERS[2].label],
      ['Divisional', 'A2', 'H2', 'A2', '75%', TIERS[3].label],
      ['Wild Card', 'A1', 'H1', 'H1', '85%', TIERS[4].label],
    ])
    const card = within(screen.getByRole('link', { name: /Best Games Ahead/ }))
    expect(card.getAllByText(/^(A|H)\d+$/).map(n => n.textContent)).toEqual(toRows(spec).slice(1).flatMap(r => [r[1], r[2]]))
    expect(card.getAllByText(/^(Toss-up|Tilt|Lean|Likely|Solid)$/).map(n => n.textContent)).toEqual(TIERS.map(t => t.label))
    expect(spec.cols.every(c => c.desc?.trim())).toBe(true)
    const outlook = spec.cols.find(c => c.label === 'Outlook')
    expect(outlook.color(spec.rows[0])).toBe(lean(spec.rows[0].game).shade)
    TIERS.forEach((t, i) => expect(outlook.desc).toContain(`${t.label} ${i === TIERS.length - 1 ? `at least ${Math.round(t.lo * 100)}%` : `below ${Math.round(t.hi * 100)}%`}`))
    expect(spec.qualifier).toContain('Season 108 · Wild Card–Divisional · 5 games · closest first')
    expect(spec.api).toMatchObject({ path: '/elo/upcoming', params: {} })
    expect(client.getEloUpcoming).toHaveBeenCalledWith()
    expect(aiText(spec, 'https://example.com')).toContain('GET https://example.com/api/elo/upcoming\n')
    expect(spec.api.note).toContain('|home win prob - 0.5|')
    const wb = buildWorkbook(spec)
    expect(wb.Sheets[wb.SheetNames[0]].E2).toMatchObject({ t: 'n', v: 0.51, z: '0%' })
  })

  it('copies an export from inside the card without navigating', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await showHome()
    const card = within(screen.getByRole('link', { name: /Best Games Ahead/ }))
    fireEvent.click(card.getByRole('button', { name: 'AI' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('# RZS Stats — Best Games Ahead')))
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
    expect(card.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})
