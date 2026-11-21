import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import * as client from '../api/client'
import GamesPage from '../pages/GamesPage'
import { weekLabel } from '../utils/playoffRounds'

vi.mock('../api/client')

describe('weekLabel', () => {
  it('names playoff rounds', () => {
    expect([18, 19, 20, 22].map(w => weekLabel(2, w))).toEqual(['Wild Card', 'Divisional', 'Conference', 'Super Bowl'])
  })

  it('numbers regular season weeks from 1', () => {
    expect(weekLabel(1, 0)).toBe('Week 1')
  })

  it('falls back for unknown playoff weeks', () => {
    expect(weekLabel(2, 21)).toBe('Playoffs Week 22')
  })
})

describe('GamesPage playoffs', () => {
  afterEach(() => vi.clearAllMocks())

  it('labels playoff weeks by round name', async () => {
    client.getSeasons.mockResolvedValue([1])
    client.getAvailableWeeks.mockImplementation((_, stage) => Promise.resolve(stage === 2 ? [18, 19, 20, 22] : [0, 1]))
    client.getGames.mockResolvedValue([])

    render(<MemoryRouter><GamesPage /></MemoryRouter>)
    await userEvent.selectOptions(await screen.findByDisplayValue('Regular season'), 'Playoffs')

    expect(await screen.findByRole('option', { name: 'Wild Card' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Super Bowl' })).toBeInTheDocument()
  })
})
