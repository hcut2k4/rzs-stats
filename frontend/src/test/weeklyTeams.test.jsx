import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import * as client from '../api/client'
import StandingsPage from '../pages/StandingsPage'

vi.mock('../api/client')

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }

const team = (teamId, displayName) => ({ teamId, displayName, abbrName: displayName.slice(0, 3).toUpperCase(), pythagoreanPat: 0.5 })

describe('Week by Week team list', () => {
  it('lists teams alphabetically regardless of API order', async () => {
    client.getSeasons.mockResolvedValue([0])
    client.getStandings.mockResolvedValue([])
    client.getWeeklyTrends.mockResolvedValue([
      { weekIndex: 0, standings: [team(1, 'Wolves'), team(2, 'Aces'), team(3, 'Mavericks')] },
    ])

    render(<MemoryRouter><StandingsPage /></MemoryRouter>)
    fireEvent.click(await screen.findByText('Week by Week'))

    await waitFor(() => expect(screen.getAllByRole('button', { pressed: false }).length).toBeGreaterThan(2))
    const names = screen.getAllByRole('button', { pressed: false }).map(b => b.textContent)
    const order = ['ACE', 'MAV', 'WOL'].map(n => names.findIndex(t => t.includes(n)))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(order.every(i => i >= 0)).toBe(true)
  })
})
