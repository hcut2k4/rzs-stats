import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ThemeToggle from '../components/ThemeToggle'
import { getStoredTheme } from '../utils/theme'

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('defaults to light when nothing is stored', () => {
    expect(getStoredTheme()).toBe('light')
  })

  it('switches to dark, applies the class and remembers the choice', async () => {
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button', { name: /dark mode/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(getStoredTheme()).toBe('dark')
  })

  it('switches back to light', async () => {
    localStorage.setItem('rzs-theme', 'dark')
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button', { name: /light mode/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(getStoredTheme()).toBe('light')
  })
})
