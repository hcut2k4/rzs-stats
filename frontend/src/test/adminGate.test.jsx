import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import * as client from '../api/client'
import AdminPage from '../pages/AdminPage'

vi.mock('../api/client')

describe('AdminPage passcode gate', () => {
  beforeEach(() => {
    client.getSyncStatus.mockResolvedValue({})
    client.getCacheWarmStatus.mockResolvedValue({})
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
})
