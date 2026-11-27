import axios from 'axios'
import { vi } from 'vitest'

vi.unmock('../api/client')

let client, adapter
beforeAll(async () => {
  adapter = axios.defaults.adapter
  axios.defaults.adapter = config => Promise.resolve({ data: config, status: 200, config })
  client = await import('../api/client')
})
afterAll(() => { axios.defaults.adapter = adapter })
afterEach(() => { localStorage.clear() })

it('gives status requests an eight second deadline and forwards cancellation', async () => {
  const controller = new AbortController()
  const config = await client.getAdminStatus(controller.signal)
  expect(config.timeout).toBe(8000)
  expect(config.signal).toBe(controller.signal)
})

it.each(['/admin/status', '/admin/sync', '/admin/elo/config'])('clears the token and announces a 401 from %s', async url => {
  vi.resetModules()
  axios.defaults.adapter = config => Promise.reject(new axios.AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, { status: 401 }))
  const api = await import('../api/client')
  api.setAdminToken('expired')
  const unauthorized = vi.fn()
  window.addEventListener('admin-unauthorized', unauthorized)
  try {
    const request = url === '/admin/status' ? api.getAdminStatus() : url === '/admin/sync' ? api.triggerSync() : api.putEloConfig({})
    await expect(request).rejects.toThrow('Unauthorized')
    expect(api.getAdminToken()).toBeNull()
    expect(unauthorized).toHaveBeenCalledOnce()
  } finally { window.removeEventListener('admin-unauthorized', unauthorized) }
})
