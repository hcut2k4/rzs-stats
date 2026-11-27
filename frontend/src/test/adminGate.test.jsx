import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import * as client from '../api/client'
import AdminPage from '../pages/AdminPage'

vi.mock('../api/client')

const ELO_CONFIG = { initialRating: 1500, k: 25, divisor: 400, movEnabled: true, marginCap: 21, homeFieldAdvantage: 0, offseasonRetention: 0.9 }

describe('AdminPage passcode gate', () => {
  beforeEach(() => {
    client.getAdminStatus.mockResolvedValue({ pipeline: {}, qb: {}, warm: {}, settings: { intervalMinutes: 15, lastCheckedAt: null, lastChangedAt: null, nextRunAt: null } })
    client.getEloConfig.mockResolvedValue(ELO_CONFIG)
    client.getSeasons.mockResolvedValue([0, 1, 2])
  })
  afterEach(() => vi.clearAllMocks())

  it('shows admin tools straight away when no passcode is required', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(await screen.findByText('Sync now')).toBeInTheDocument()
  })

  it('asks for a passcode when the backend rejects the request', async () => {
    client.checkAdminAuth.mockRejectedValue({ response: { status: 401 } })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(await screen.findByLabelText('Passcode')).toBeInTheDocument()
    expect(screen.queryByText('Sync now')).toBeNull()
  })

  it('unlocks and remembers the passcode when it is accepted', async () => {
    client.checkAdminAuth.mockRejectedValueOnce({ response: { status: 401 } }).mockResolvedValueOnce({ ok: true })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.type(await screen.findByLabelText('Passcode'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByText('Sync now')).toBeInTheDocument()
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
    const k = await screen.findByLabelText('K factor')
    await userEvent.clear(k)
    await userEvent.type(k, '30')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/Request failed/)).toBeInTheDocument()
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
    expect(await screen.findByText('boom')).toBeInTheDocument()
    expect(client.triggerProbabilityBackfill).toHaveBeenCalledWith(2)
  })
  it('saves an interval preset from the select', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    client.putSyncSettings.mockImplementation(async () => {
      client.getAdminStatus.mockResolvedValue({ pipeline: {}, qb: {}, warm: {}, settings: { intervalMinutes: 120, nextRunAt: null } })
      return { intervalMinutes: 120, nextRunAt: null }
    })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const input = await screen.findByLabelText('Auto-sync interval')
    await waitFor(() => expect(input).toHaveValue('15'))
    await userEvent.selectOptions(input, '120')
    expect(client.putSyncSettings).toHaveBeenCalledWith(120)
    await waitFor(() => expect(input).toHaveValue('120'))
  })

  it('saves a custom interval only after Save and enforces the allowed range', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    client.putSyncSettings.mockResolvedValue({ intervalMinutes: 45, nextRunAt: null })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    const preset = await screen.findByLabelText('Auto-sync interval')
    await waitFor(() => expect(preset).toHaveValue('15'))
    await userEvent.selectOptions(preset, 'custom')
    const input = screen.getByLabelText('Custom interval in minutes')
    await userEvent.clear(input)
    await userEvent.type(input, '10081')
    expect(screen.getByRole('button', { name: 'Save interval' })).toBeDisabled()
    await userEvent.clear(input)
    await userEvent.type(input, '45')
    expect(client.putSyncSettings).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Save interval' }))
    expect(client.putSyncSettings).toHaveBeenCalledWith(45)
  })

  it('shows the backend busy message when another operation wins the lock', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    client.triggerSync.mockRejectedValue({ response: { status: 409, data: 'Busy: Auto-sync is running' } })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: 'Sync now' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Busy: Auto-sync is running')
  })

  it('passes the chosen season to the player and team repair', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    client.triggerQbSync.mockResolvedValue({ message: 'QB sync started' })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.selectOptions(await screen.findByLabelText('Stats season'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Re-sync player & team stats' }))
    expect(client.triggerQbSync).toHaveBeenCalledWith(1)
  })

  it('requires confirmation before repairing all seasons', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: 'Re-sync player & team stats' }))
    expect(client.triggerQbSync).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm re-sync player & team stats' }))
    expect(client.triggerQbSync).toHaveBeenCalledWith(undefined)
  })

  it('keeps Elo Save disabled until a field changes', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('shows a scheduled auto-sync without a user action and refreshes settings', async () => {
    vi.useFakeTimers()
    try {
      client.checkAdminAuth.mockResolvedValue({ ok: true })
      const idle = { pipeline: {}, qb: {}, warm: {}, settings: { intervalMinutes: 15 } }
      client.getAdminStatus.mockResolvedValueOnce(idle).mockResolvedValue({ ...idle, pipeline: { inProgress: true, operation: 'Auto-sync', startedAt: new Date().toISOString(), message: 'Running' }, settings: { intervalMinutes: 15, lastChangedAt: new Date().toISOString() } })
      await act(async () => { render(<MemoryRouter><AdminPage /></MemoryRouter>) })
      expect(screen.getByText('No runs yet')).toBeInTheDocument()
      await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
      expect(screen.getByText('Auto-sync')).toBeInTheDocument()
      expect(screen.getByText('Waiting for Auto-sync to finish')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled()
      expect(screen.getByText('Data last changed').nextSibling).toHaveTextContent('0s ago')
      await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
      expect(client.getAdminStatus).toHaveBeenCalledTimes(3)
    } finally { vi.useRealTimers() }
  })

  it('keeps polling fast when the first status after a cache rebuild is idle', async () => {
    vi.useFakeTimers()
    try {
      client.checkAdminAuth.mockResolvedValue({ ok: true })
      client.triggerCacheWarm.mockResolvedValue({ message: 'Cache warming started' })
      await act(async () => { render(<MemoryRouter><AdminPage /></MemoryRouter>) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Rebuild caches' })) })
      const before = client.getAdminStatus.mock.calls.length
      await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
      expect(client.getAdminStatus.mock.calls.length).toBeGreaterThan(before)
      client.getAdminStatus.mockResolvedValue({ pipeline: { inProgress: true, operation: 'Cache rebuild' }, qb: {}, warm: { inProgress: true, message: 'Season 1 of 3' }, settings: { intervalMinutes: 15 } })
      await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
      expect(screen.getByText('Season 1 of 3')).toBeInTheDocument()
    } finally { vi.useRealTimers() }
  })

  it('pauses hidden polling and refreshes on visibility and focus', async () => {
    vi.useFakeTimers()
    try {
      client.checkAdminAuth.mockResolvedValue({ ok: true })
      await act(async () => { render(<MemoryRouter><AdminPage /></MemoryRouter>) })
      const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
      await act(async () => { fireEvent(document, new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(20000) })
      expect(client.getAdminStatus).toHaveBeenCalledTimes(1)
      hidden.mockReturnValue(false)
      await act(async () => { fireEvent(document, new Event('visibilitychange')) })
      expect(client.getAdminStatus).toHaveBeenCalledTimes(2)
      await act(async () => { fireEvent(window, new Event('focus')) })
      expect(client.getAdminStatus).toHaveBeenCalledTimes(3)
      hidden.mockRestore()
    } finally { vi.useRealTimers() }
  })
})
