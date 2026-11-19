import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AboutPage from '../pages/AboutPage'

describe('AboutPage Elo content', () => {
  it('explains Elo and the Elo page', () => {
    render(<MemoryRouter><AboutPage /></MemoryRouter>)
    expect(screen.getAllByText('Elo')).toHaveLength(2)
    expect(screen.getByText(/Every team starts at 1500/)).toBeInTheDocument()
    expect(screen.getByText(/Matchup — pick any two teams/)).toBeInTheDocument()
  })

  it('links the SCORE introduction to NFL Elo ratings', () => {
    render(<MemoryRouter><AboutPage /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Introduction to NFL Elo Ratings — SCORE' }))
      .toHaveAttribute('href', 'https://modules.scorenetwork.org/football/nfl-elo-ratings/')
  })
})
