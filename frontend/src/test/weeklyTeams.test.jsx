import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import * as client from '../api/client'
import { clearLoadCache } from '../utils/useLoad'
import StandingsPage from '../pages/StandingsPage'

vi.mock('../api/client')

beforeEach(() => {
  clearLoadCache()
  client.getAvailableWeeks.mockResolvedValue([])
})

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

const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const weeks = (...names) => [{ weekIndex: 0, standings: names.map((n, i) => team(i + 1, n)) }]

describe('Week by Week season switching', () => {
  const requests = {}

  function renderWeekly() {
    client.getSeasons.mockResolvedValue([6, 7])
    client.getStandings.mockResolvedValue([])
    client.getWeeklyTrends.mockImplementation(season => (requests[season] = deferred()).promise)
    render(<MemoryRouter initialEntries={['/standings?tab=weekly']}><StandingsPage /></MemoryRouter>)
  }

  const switchTo = async season => {
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Season' }), String(season))
    await waitFor(() => expect(requests[season]).toBeDefined())
  }

  afterEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(requests)) delete requests[k]
  })

  it('ignores a slow response for a season the user has already left', async () => {
    renderWeekly()
    await waitFor(() => expect(requests[7]).toBeDefined())
    await switchTo(6)

    await act(async () => requests[6].resolve(weeks('Aces')))
    await screen.findByRole('button', { name: /ACE/ })
    await act(async () => requests[7].resolve(weeks('Wolves')))

    expect(screen.getByRole('button', { name: /ACE/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /WOL/ })).not.toBeInTheDocument()
  })

  it('shows an error, not the previous season, when the selected season fails to load', async () => {
    renderWeekly()
    await waitFor(() => expect(requests[7]).toBeDefined())
    await act(async () => requests[7].resolve(weeks('Wolves')))
    await screen.findByRole('button', { name: /WOL/ })

    await switchTo(6)
    await act(async () => requests[6].reject(new Error('boom')))

    expect(await screen.findByText("Couldn't load week-by-week data. Try again in a moment.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /WOL/ })).not.toBeInTheDocument()
  })

  it('clears an earlier failure once another season loads', async () => {
    renderWeekly()
    await waitFor(() => expect(requests[7]).toBeDefined())
    await act(async () => requests[7].reject(new Error('boom')))
    await screen.findByText("Couldn't load week-by-week data. Try again in a moment.")

    await switchTo(6)
    await act(async () => requests[6].resolve(weeks('Aces')))

    expect(await screen.findByRole('button', { name: /ACE/ })).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load week-by-week data. Try again in a moment.")).not.toBeInTheDocument()
  })
})
