import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, useLocation } from 'react-router-dom'
import ExportMenu from '../components/ExportMenu'
import { copyImage } from '../utils/tableImage'
import * as tableExport from '../utils/exportTable'

vi.mock('../utils/tableImage', () => ({ copyImage: vi.fn() }))
const spec = { name: 'Table', qualifier: 'Season 108', description: 'Data', rows: [], cols: [], api: { path: '/standings', params: { season: 5 } } }
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue() } })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) })
  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers() })

it('shows four inline buttons on mobile', () => {
  render(<ExportMenu spec={spec} />)
  expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['XLSX', 'CSV', 'PNG', 'AI'])
  screen.getAllByRole('button').forEach(button => {
    expect(button).toBeVisible()
    for (let el = button; el; el = el.parentElement) expect(el.className).not.toMatch(/hidden|sm:/)
  })
})

it('copies AI data during the click and announces success', async () => {
  render(<ExportMenu spec={spec} />)
  fireEvent.click(screen.getByRole('button', { name: 'AI' }))
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('```csv'))
  await screen.findByRole('button', { name: 'Copied' })
  expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Copied')
})

it('reports Saved when AI copy falls back to a file', async () => {
  navigator.clipboard.writeText.mockRejectedValue(new Error('denied'))
  render(<ExportMenu spec={spec} />)
  fireEvent.click(screen.getByRole('button', { name: 'AI' }))
  expect(await screen.findByRole('button', { name: 'Saved' })).toBeVisible()
})

it.each([['copied', 'Copied'], ['downloaded', 'Saved'], ['toobig', 'Too big for an image']])('maps PNG %s to %s', async (result, label) => {
  copyImage.mockResolvedValue(result)
  render(<ExportMenu spec={spec} />)
  fireEvent.click(screen.getByRole('button', { name: 'PNG' }))
  expect(copyImage).toHaveBeenCalledWith(spec)
  const button = await screen.findByRole('button', { name: label })
  if (result === 'toobig') expect(button.title).toContain('use CSV/AI')
})

it('uses the image override for PNG', async () => {
  const imageSpec = { name: 'Image grid', rows: [], cols: [] }
  copyImage.mockResolvedValue('copied')
  render(<ExportMenu spec={{ ...spec, imageSpec }} />)
  fireEvent.click(screen.getByRole('button', { name: 'PNG' }))
  expect(copyImage).toHaveBeenCalledWith(imageSpec)
  await screen.findByRole('button', { name: 'Copied' })
})

it.each([['XLSX', 'exportExcel'], ['CSV', 'exportCsv'], ['AI', 'copyAi']])('keeps the original spec for %s with an image override', async (label, method) => {
  const original = { ...spec, imageSpec: { name: 'Image grid', rows: [], cols: [] } }
  const exporter = vi.spyOn(tableExport, method).mockResolvedValue('copied')
  render(<ExportMenu spec={original} />)
  fireEvent.click(screen.getByRole('button', { name: label }))
  expect(exporter).toHaveBeenCalledWith(original)
  await screen.findByRole('button', { name: 'Copied' })
})

it('reports thrown errors', async () => {
  copyImage.mockImplementation(() => { throw new Error('failed') })
  render(<ExportMenu spec={spec} />)
  fireEvent.click(screen.getByRole('button', { name: 'PNG' }))
  expect(await screen.findByRole('button', { name: 'Failed' })).toBeVisible()
})

it('prevents the default link action and stops propagation', async () => {
  const parentClick = vi.fn()
  function Where() { return <span data-testid="location">{useLocation().pathname}</span> }
  render(<MemoryRouter initialEntries={['/']}><Link to="/other" onClick={parentClick}><ExportMenu spec={spec} /></Link><Where /></MemoryRouter>)
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  fireEvent(screen.getByRole('button', { name: 'AI' }), event)
  expect(event.defaultPrevented).toBe(true)
  expect(parentClick).not.toHaveBeenCalled()
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  await screen.findByRole('button', { name: 'Copied' })
})

it('disables every button during a copy', async () => {
  let resolve
  copyImage.mockReturnValue(new Promise(r => { resolve = r }))
  render(<ExportMenu spec={spec} />)
  fireEvent.click(screen.getByRole('button', { name: 'PNG' }))
  screen.getAllByRole('button').forEach(b => expect(b).toBeDisabled())
  await act(async () => resolve('copied'))
  screen.getAllByRole('button').forEach(b => expect(b).toBeEnabled())
})

it('restores the label after 1600 ms and clears the timer on unmount', async () => {
  vi.useFakeTimers()
  copyImage.mockResolvedValue('copied')
  const view = render(<ExportMenu spec={spec} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'PNG' })))
  expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible()
  act(() => vi.advanceTimersByTime(1600))
  expect(screen.getByRole('button', { name: 'PNG' })).toBeVisible()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'PNG' })))
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('saves CSV through the download path', async () => {
  render(<ExportMenu spec={spec} />)
  fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Saved' })).toBeVisible())
  expect(URL.createObjectURL).toHaveBeenCalled()
})

it('does not leave a feedback timer when a copy finishes after unmount', async () => {
  vi.useFakeTimers()
  let resolve
  copyImage.mockReturnValue(new Promise(r => { resolve = r }))
  const view = render(<ExportMenu spec={spec} />)
  fireEvent.click(screen.getByRole('button', { name: 'PNG' }))
  view.unmount()
  await act(async () => resolve('copied'))
  expect(vi.getTimerCount()).toBe(0)
})

it('prefers the panel image over the image table override', async () => {
  const original = { ...spec, image: { width: 390, draw: vi.fn() }, imageSpec: { rows: [], cols: [] } }
  copyImage.mockResolvedValue('copied')
  render(<ExportMenu spec={original} />)
  fireEvent.click(screen.getByRole('button', { name: 'PNG' }))
  expect(copyImage).toHaveBeenCalledWith(original)
  await screen.findByRole('button', { name: 'Copied' })
})
