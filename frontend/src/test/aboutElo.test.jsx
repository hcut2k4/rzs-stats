import { beforeEach, vi } from 'vitest'
import * as client from '../api/client'
import { clearLoadCache } from '../utils/useLoad'
import { TANYA_BENCHMARK, TANYA_TIP } from '../utils/qb'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AboutPage from '../pages/AboutPage'

vi.mock('../api/client')

beforeEach(() => {
  clearLoadCache()
  client.getPublicEloConfig.mockResolvedValue(null)
})

describe('AboutPage Elo content', () => {
  it('explains Elo and the Elo page', () => {
    render(<MemoryRouter><AboutPage /></MemoryRouter>)
    expect(screen.getAllByText('Elo')).toHaveLength(2)
    expect(screen.getByText(/Every team starts at 1500/)).toBeInTheDocument()
    expect(screen.getByText(/Matchup — pick any two teams/)).toBeInTheDocument()
  })

  it('links the SCORE introduction to NFL Elo ratings', () => {
    render(<MemoryRouter><AboutPage /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Introduction to NFL Elo Ratings — SCORE' }))
      .toHaveAttribute('href', 'https://modules.scorenetwork.org/football/nfl-elo-ratings/')
  })
})

it('uses the supplied TANY/A benchmark in About and the tooltip', () => {
  const benchmark = "An average starter is around 6. By the same formula, Peyton Manning's record 2013 season works out to 8.3 and Lamar Jackson's 2019 MVP season to 7.9."
  expect(TANYA_BENCHMARK).toBe(benchmark)
  expect(TANYA_TIP).toContain(benchmark)
  render(<MemoryRouter><AboutPage /></MemoryRouter>)
  expect(screen.getByText(benchmark)).toBeInTheDocument()
})

it.each([true, false])('uses the public margin cap on About when MOV is %s', async movEnabled => {
  client.getPublicEloConfig.mockResolvedValue({ movEnabled, marginCap: 14, homeFieldAdvantage: 50 })
  render(<MemoryRouter><AboutPage /></MemoryRouter>)
  expect(await screen.findByText(movEnabled ? /up to a 14-point margin/ : /the configured margin cap/)).toBeInTheDocument()
})

it('keeps the About explanation when config cannot load', async () => {
  client.getPublicEloConfig.mockRejectedValue(new Error('unavailable'))
  render(<MemoryRouter><AboutPage /></MemoryRouter>)
  expect(await screen.findByText(/the configured margin cap/)).toBeInTheDocument()
})


it('explains the playoff picture and the season 104 tiebreak examples', async () => {
  render(<MemoryRouter><AboutPage /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'Playoffs' })).toBeInTheDocument()
  expect(screen.getByText(/completed regular-season games only/)).toBeInTheDocument()
  expect(screen.getByText(/Madden 27 breaks ties differently from the real NFL/)).toBeInTheDocument()
  expect(screen.getByText(/Washington swept Philadelphia, but Washington still missed/)).toBeInTheDocument()
  expect(screen.getByText(/Detroit and Philadelphia ahead of Washington/)).toBeInTheDocument()
  await screen.findByText(/the configured margin cap/)
})
