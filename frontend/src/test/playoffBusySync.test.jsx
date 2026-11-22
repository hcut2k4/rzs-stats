import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../App'
import OddsTab from '../components/playoffs/OddsTab'
import { clearLoadCache } from '../utils/useLoad'
import { withBusyRetry } from '../utils/usePlayoffLoad'
import * as client from '../api/client'


import syncFixture from './fixtures/playoffs/sync-status.json'
import emptySyncFixture from './fixtures/playoffs/sync-status-empty.json'
import oddsFixture from './fixtures/playoffs/odds.json'

vi.mock('../api/client')
beforeEach(() => { vi.resetAllMocks(); clearLoadCache() })
afterEach(() => vi.useRealTimers())

it.each([
  [syncFixture.lastSyncAt, 'Last synced Dec 31, 7:00 PM ET.'],
  ['2026-11-22T09:02:11Z', 'Last synced Nov 22, 4:02 AM ET.'],
  ['2026-07-22T09:02:11Z', 'Last synced Jul 22, 5:02 AM ET.'],
])('shares one sync request between the footer and About, formatting %s in Eastern time', async (lastSyncAt, text) => {
  client.getPublicSyncStatus.mockResolvedValue({ ...syncFixture, lastSyncAt })
  render(<MemoryRouter initialEntries={['/about']}><App /></MemoryRouter>)
  await waitFor(() => expect(screen.getAllByText(text, { exact: false })).toHaveLength(2))
  expect(client.getPublicSyncStatus).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('link', { name: 'Changelog' }))
  await waitFor(() => expect(screen.getAllByText(text, { exact: false })).toHaveLength(2))
  expect(client.getPublicSyncStatus).toHaveBeenCalledTimes(1)
})

it.each(['loading', 'error', 'null'])('keeps the schedule fallback when sync status is %s', async mode => {
  if (mode === 'loading') client.getPublicSyncStatus.mockReturnValue(new Promise(() => {}))
  if (mode === 'error') client.getPublicSyncStatus.mockRejectedValue(new Error('unavailable'))
  if (mode === 'null') client.getPublicSyncStatus.mockResolvedValue(emptySyncFixture)
  render(<MemoryRouter initialEntries={['/about']}><App /></MemoryRouter>)
  await act(async () => {})
  expect(screen.getAllByText(/Stats sync from NeonSportz nightly at 4 AM ET/)).toHaveLength(2)
  fireEvent.click(screen.getByRole('link', { name: 'Changelog' }))
  await act(async () => {})
  expect(screen.getAllByText(/Stats sync from NeonSportz nightly at 4 AM ET/)).toHaveLength(2)
  expect(client.getPublicSyncStatus).toHaveBeenCalledTimes(1)
})

it('retries a shared busy odds request only once after a delay of one to three seconds', async () => {
  vi.useFakeTimers()
  client.getPlayoffOdds.mockRejectedValue({ response: { status: 503 } })
  render(<MemoryRouter><OddsTab season={2} rules="madden" /></MemoryRouter>)
  await act(async () => {})
  await act(async () => vi.advanceTimersByTimeAsync(999))
  expect(client.getPlayoffOdds).toHaveBeenCalledTimes(1)
  await act(async () => vi.advanceTimersByTimeAsync(2002))
  expect(client.getPlayoffOdds).toHaveBeenCalledTimes(2)
  expect(screen.getByText('The server is busy. Try again')).toBeInTheDocument()
  await act(async () => vi.advanceTimersByTimeAsync(10000))
  expect(client.getPlayoffOdds).toHaveBeenCalledTimes(2)
  client.getPlayoffOdds.mockResolvedValue({ ...oddsFixture, conferences: [] })
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await act(async () => {})
  expect(screen.getByText('No playoff odds available.')).toBeInTheDocument()
})

it('does not automatically retry a 500 response', async () => {
  vi.useFakeTimers()
  client.getPlayoffOdds.mockRejectedValue({ response: { status: 500 } })
  render(<MemoryRouter><OddsTab season={2} rules="madden" /></MemoryRouter>)
  await act(async () => {})
  expect(screen.getByText('Could not load playoff odds.')).toBeInTheDocument()
  await act(async () => vi.advanceTimersByTimeAsync(10000))
  expect(client.getPlayoffOdds).toHaveBeenCalledTimes(1)
})

it.each([{ name: 'AbortError' }, { code: 'ERR_CANCELED' }])('does not retry aborted requests even with a 503 status: %j', async cancellation => {
  const error = { response: { status: 503 }, ...cancellation }
  const loader = vi.fn().mockRejectedValue(error)
  await expect(withBusyRetry(loader)).rejects.toBe(error)
  expect(loader).toHaveBeenCalledTimes(1)
})
