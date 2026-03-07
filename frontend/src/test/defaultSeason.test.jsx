import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import StandingsPage from '../pages/StandingsPage'
import GamesPage from '../pages/GamesPage'
import * as client from '../api/client'

vi.mock('../api/client')

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('Default season selection', () => {
  afterEach(() => vi.clearAllMocks())

  describe('StandingsPage', () => {
    it('defaults to the latest (last) season when multiple seasons exist', async () => {
      client.getSeasons.mockResolvedValue([3, 4, 5])
      client.getStandings.mockResolvedValue([])

      renderWithRouter(<StandingsPage />)

      await waitFor(() => {
        const select = screen.getByRole('combobox')
        expect(select.value).toBe('5')
      })
    })

    it('defaults to the only season when a single season exists', async () => {
      client.getSeasons.mockResolvedValue([5])
      client.getStandings.mockResolvedValue([])

      renderWithRouter(<StandingsPage />)

      await waitFor(() => {
        const select = screen.getByRole('combobox')
        expect(select.value).toBe('5')
      })
    })
  })

  describe('GamesPage', () => {
    it('defaults to the latest season when multiple seasons exist', async () => {
      client.getSeasons.mockResolvedValue([3, 4, 5])
      client.getAvailableWeeks.mockResolvedValue([0, 1, 2])
      client.getGames.mockResolvedValue([])

      renderWithRouter(<GamesPage />)

      await waitFor(() => {
        // The season selector is the first combobox
        const selects = screen.getAllByRole('combobox')
        expect(selects[0].value).toBe('5')
      })
    })

    it('defaults to the only season when a single season exists', async () => {
      client.getSeasons.mockResolvedValue([5])
      client.getAvailableWeeks.mockResolvedValue([0])
      client.getGames.mockResolvedValue([])

      renderWithRouter(<GamesPage />)

      await waitFor(() => {
        const selects = screen.getAllByRole('combobox')
        expect(selects[0].value).toBe('5')
      })
    })
  })
})
