import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import * as client from '../api/client'
import AdminPage from '../pages/AdminPage'

vi.mock('../api/client')

const ELO_CONFIG = { initialRating: 1500, k: 25, divisor: 400, movEnabled: true, marginCap: 21, homeFieldAdvantage: 0, offseasonRetention: 0.9 }

describe('AdminPage passcode gate', () => {
  beforeEach(() => {
    client.getSyncStatus.mockResolvedValue({})
    client.getCacheWarmStatus.mockResolvedValue({})
    client.getEloConfig.mockResolvedValue(ELO_CONFIG)
  })
  afterEach(() => vi.clearAllMocks())

  it('shows admin tools straight away when no passcode is required', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    render(<AdminPage />)
    expect(await screen.findByText('Sync Now')).toBeInTheDocument()
  })

  it('asks for a passcode when the backend rejects the request', async () => {
    client.checkAdminAuth.mockRejectedValue({ response: { status: 401 } })
    render(<AdminPage />)
    expect(await screen.findByLabelText('Passcode')).toBeInTheDocument()
    expect(screen.queryByText('Sync Now')).toBeNull()
  })

  it('unlocks and remembers the passcode when it is accepted', async () => {
    client.checkAdminAuth.mockRejectedValueOnce({ response: { status: 401 } }).mockResolvedValueOnce({ ok: true })
    render(<AdminPage />)
    await userEvent.type(await screen.findByLabelText('Passcode'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByText('Sync Now')).toBeInTheDocument()
    expect(client.setAdminToken).toHaveBeenCalledWith('secret')
  })

  it('shows an error and forgets the passcode when it is wrong', async () => {
    client.checkAdminAuth.mockRejectedValue({ response: { status: 401 } })
    render(<AdminPage />)
    await userEvent.type(await screen.findByLabelText('Passcode'), 'bad')
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByText('Incorrect passcode.')).toBeInTheDocument()
    expect(client.setAdminToken).toHaveBeenLastCalledWith(null)
  })

  it('saves edited Elo settings', async () => {
    client.checkAdminAuth.mockResolvedValue({ ok: true })
    client.putEloConfig.mockImplementation(c => Promise.resolve(c))
    render(<AdminPage />)
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
    render(<AdminPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/Rejected/)).toBeInTheDocument()
  })
})
