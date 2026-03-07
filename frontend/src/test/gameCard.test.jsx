import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import * as client from '../api/client'
import GamesPage from '../pages/GamesPage'

vi.mock('../api/client')

const homeTeam = { abbrName: 'NE', displayName: 'Patriots' }
const awayTeam = { abbrName: 'BUF', displayName: 'Bills' }

const sampleGame = {
  gameId: 11263917,
  homeTeam,
  awayTeam,
  homeScore: 28,
  awayScore: 14,
  status: 2,
  simmed: false,
}

async function renderGamesWithGames(games) {
  client.getSeasons.mockResolvedValue([5])
  client.getAvailableWeeks.mockResolvedValue([0])
  client.getGames.mockResolvedValue(games)

  const { container } = render(
    <MemoryRouter>
      <GamesPage />
    </MemoryRouter>
  )

  // Wait for games to load
  await screen.findByText('NE')

  return container
}

describe('GameCard links', () => {
  afterEach(() => vi.clearAllMocks())

  it('renders a link to the NeonSportz game page', async () => {
    const container = await renderGamesWithGames([sampleGame])
    const link = container.querySelector(`a[href="https://neonsportz.com/leagues/RZS/games/11263917"]`)
    expect(link).not.toBeNull()
  })

  it('opens the link in a new tab', async () => {
    const container = await renderGamesWithGames([sampleGame])
    const link = container.querySelector(`a[href*="11263917"]`)
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('sets rel=noopener noreferrer on the link', async () => {
    const container = await renderGamesWithGames([sampleGame])
    const link = container.querySelector(`a[href*="11263917"]`)
    expect(link.rel).toContain('noopener')
  })

  it('displays team abbreviations and scores inside the card', async () => {
    await renderGamesWithGames([sampleGame])
    expect(screen.getByText('NE')).toBeInTheDocument()
    expect(screen.getByText('BUF')).toBeInTheDocument()
    expect(screen.getByText('28')).toBeInTheDocument()
    expect(screen.getByText('14')).toBeInTheDocument()
  })
})
