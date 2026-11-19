import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { TIERS, UPSET_LEVELS, pct0 } from '../utils/eloLean'

const renderAt = path => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)

it('renders the dated changelog with every feature and the shared Elo scale', () => {
  renderAt('/changelog')

  expect(screen.getByRole('heading', { level: 1, name: "What's new in the Red Zone" })).toBeInTheDocument()
  expect(screen.getByText('Red Zone Stats · Nov 11 – 18, 2026')).toBeInTheDocument()
  for (const name of ['Elo Ratings', 'QB Rankings', 'Team Efficiency', 'Home Page', 'Standings', 'Export Anything', 'Also new']) {
    expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
  }
  const tiers = within(screen.getByRole('list', { name: "Matchup tiers by favorite's win chance" })).getAllByRole('listitem')
  TIERS.forEach((tier, index) => {
    expect(within(tiers[index]).getByText(tier.label)).toBeInTheDocument()
    const range = `${Math.round(tier.lo * 100)}${index === TIERS.length - 1 ? '%+' : `–${pct0(tier.hi)}`}`
    expect(within(tiers[index]).getByText(range)).toBeInTheDocument()
  })
  for (const level of UPSET_LEVELS) expect(screen.getByText(level.label)).toBeInTheDocument()
  expect(screen.getAllByText('Try this')).toHaveLength(6)
  expect(within(screen.getByRole('navigation', { name: 'Main' })).queryByRole('link', { name: 'Changelog' })).not.toBeInTheDocument()
})

it('links the feature index, app pages, and full screenshots', () => {
  renderAt('/changelog')

  const index = screen.getByRole('navigation', { name: 'Jump to a feature' })
  for (const link of within(index).getAllByRole('link')) {
    expect(document.getElementById(link.hash.slice(1))).toBeInTheDocument()
  }
  for (const [name, path] of [
    ['Elo → Games', '/elo?tab=games'], ['QB leaderboard', '/qb'],
    ['Efficiency overview', '/efficiency'], ['Best Games Ahead', '/'],
    ['Season History', '/standings?tab=history'], ['About page', '/about'],
  ]) {
    const link = screen.getByRole('link', { name })
    expect(link).toHaveAttribute('href', path)
    expect(link).not.toHaveAttribute('target')
  }
  const images = screen.getAllByRole('img')
  expect(images).toHaveLength(8)
  for (const image of images) {
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image.alt.length).toBeGreaterThan(20)
    expect(image.closest('a')).toHaveAttribute('href', image.getAttribute('src'))
    expect(image.closest('a')).toHaveAttribute('target', '_blank')
  }
})

it('links to the changelog from About', () => {
  renderAt('/about')
  expect(screen.getByRole('link', { name: 'Changelog' })).toHaveAttribute('href', '/changelog')
})
