import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import * as client from '../api/client'
import AdminPage from '../pages/AdminPage'

vi.mock('../api/client')

const ELO_CONFIG = { initialRating: 1500, k: 25, divisor: 400, movEnabled: true, marginCap: 21, homeFieldAdvantage: 0, offseasonRetention: 0.9 }

describe('AdminPage passcode gate', () => {
  beforeEach(() => {
    client.getSyncStatus.mockResolvedValue({})
    client.getSyncSettings.mockResolvedValue({ intervalMinutes: 15, lastCheckedAt: null, lastChangedAt: null, nextRunAt: '2026-11-26T12:00:00Z' })
    client.getCacheWarmStatus.mockResolvedValue({})
    client.getQbSyncStatus.mockResolvedValue({})
    client.getEloConfig.mockResolvedValue(ELO_CONFIG)
    client.getSeasons.mockResolvedValue([0, 1, 2])
  })
  afterEach(() => vi.clearAllMocks())

  it('shows admin tools straight away when no passcode is required', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(await screen.findByText('Sync Now')).toBeInTheDocument()
  })

  it('asks for a passcode when the backend rejects the request', async () => {
    client.checkAdminAuth.mockRejectedValue({ response: { status: 401 } })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(await screen.findByLabelText('Passcode')).toBeInTheDocument()
    expect(screen.queryByText('Sync Now')).toBeNull()
  })

  it('unlocks and remembers the passcode when it is accepted', async () => {
    client.checkAdminAuth.mockRejectedValueOnce({ response: { status: 401 } }).mockResolvedValueOnce({ ok: true })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.type(await screen.findByLabelText('Passcode'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByText('Sync Now')).toBeInTheDocument()
    expect(client.setAdminToken).toHaveBeenCalledWith('secret')
  })

  it('shows an error and forgets the passcode when it is wrong', async () => {
    client.checkAdminAuth.mockRejectedValue({ response: { status: 401 } })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.type(await screen.findByLabelText('Passcode'), 'bad')
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByText('Incorrect passcode.')).toBeInTheDocument()
    expect(client.setAdminToken).toHaveBeenLastCalledWith(null)
  })

  it('saves edited Elo settings', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    client.putEloConfig.mockImplementation(c => Promise.resolve(c))
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const k = await screen.findByLabelText('K factor')
    await userEvent.clear(k)
    await userEvent.type(k, '30')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(client.putEloConfig).toHaveBeenCalledWith({ ...ELO_CONFIG, k: 30 })
    expect(await screen.findByText(/Saved/)).toBeInTheDocument()
  })

  it('shows an error when the backend rejects Elo settings', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    client.putEloConfig.mockRejectedValue({ response: { status: 400 } })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/Rejected/)).toBeInTheDocument()
  })

  it('backfills the playoff probability history for the chosen season and shows the result', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    client.triggerProbabilityBackfill.mockResolvedValue({ season: 1, created: 5, skipped: 1 })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Season' }), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Backfill probability history' }))
    expect(client.triggerProbabilityBackfill).toHaveBeenCalledWith(1)
    expect(await screen.findByText('Saved 5 weeks; 1 already saved.')).toBeInTheDocument()
  })

  it('shows a failure message when the backfill request fails', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    client.triggerProbabilityBackfill.mockRejectedValue(new Error('boom'))
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: 'Backfill probability history' }))
    expect(await screen.findByText('Request failed')).toBeInTheDocument()
    expect(client.triggerProbabilityBackfill).toHaveBeenCalledWith(2)
  })
  it('saves Off and shows that the next check is disabled', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    client.putSyncSettings.mockResolvedValue({ intervalMinutes: 0, nextRunAt: null })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.selectOptions(await screen.findByLabelText('Auto-sync interval'), '0')
    expect(client.putSyncSettings).toHaveBeenCalledWith(0)
    await waitFor(() => expect(screen.getByLabelText('Auto-sync interval')).toHaveValue('0'))
    expect(screen.getByText('Last checked:')).toBeInTheDocument()
    expect(screen.getByText('Last data change:')).toBeInTheDocument()
    expect(screen.getByText('Next check:')).toBeInTheDocument()
  })

  it('keeps the saved interval when updating it fails', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    client.putSyncSettings.mockRejectedValue(new Error('failed'))
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.selectOptions(await screen.findByLabelText('Auto-sync interval'), '5')
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save auto-sync interval')
    expect(screen.getByLabelText('Auto-sync interval')).toHaveValue('15')
  })

  it('keeps Sync Now disabled until the background run completes', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    client.triggerSync.mockResolvedValue({ success: true, message: 'Sync started' })
    client.getSyncStatus.mockResolvedValueOnce({ inProgress: false })
      .mockResolvedValueOnce({ inProgress: true })
      .mockResolvedValue({ inProgress: false, success: true, message: 'Completed' })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: 'Sync Now' }))
    expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync Now' })).toBeEnabled(), { timeout: 3500 })
    expect(client.getSyncStatus.mock.calls.length).toBeGreaterThan(2)
  })

})
