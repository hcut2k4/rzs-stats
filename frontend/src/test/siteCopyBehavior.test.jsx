import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { leaderboardQualifier } from '../pages/QbPage'
import { MatchupTab, homeTeamForSide } from '../pages/EloPage'
import SeasonHistoryTab from '../components/SeasonHistoryTab'
import { pyPatPercent } from '../components/WeeklyTab'
import App from '../App'

const defaults = { season: 2, scope: 'season', stage: 'regular', minAtt: '' }

describe('QB qualifiers', () => {
  it.each([
    [{}, 'Season 105 · Regular season · min 10 attempts per team game'],
    [{ minAtt: '27' }, 'Season 105 · Regular season · min 27 attempts'],
    [{ minAtt: '0' }, 'Season 105 · Regular season · min 0 attempts'],
    [{ scope: 'alltime' }, 'All seasons · Regular season · min 250 attempts'],
    [{ scope: 'alltime', stage: 'playoffs' }, 'All seasons · Playoffs · min 50 attempts'],
    [{ scope: 'alltime', stage: 'playoffs', minAtt: '7' }, 'All seasons · Playoffs · min 7 attempts'],
    [{ scope: 'alltime', stage: 'both' }, 'All seasons · Both · min 250 attempts'],
    [{ stage: 'playoffs' }, 'Season 105 · Playoffs · min 10 attempts per team game'],
    [{ scope: 'week', week: 6 }, 'Season 105 · Week 7 · Regular season · min 10 attempts'],
    [{ scope: 'week', week: 18, stage: 'playoffs' }, 'Season 105 · Wild Card · Playoffs · min 10 attempts'],
    [{ scope: 'week', week: 22, stage: 'playoffs', minAtt: '12' }, 'Season 105 · Super Bowl · Playoffs · min 12 attempts'],
  ])('describes the effective threshold and round for %j', (params, expected) => {
    expect(leaderboardQualifier({ ...defaults, ...params })).toBe(`${expected} · ranked by TANY/A`)
  })
})

it('shows season-history PyPAT as a percent and leaves missing values blank', () => {
  const team = { teamId: 1, displayName: 'Bears', abbrName: 'CHI', wins: 10, losses: 7, winPct: 10 / 17, winDiff: 0.2 }
  render(<MemoryRouter><SeasonHistoryTab data={[
    { seasonIndex: 1, standings: [{ ...team, pythagoreanPat: null }] },
    { seasonIndex: 2, standings: [{ ...team, pythagoreanPat: 0.6123 }] },
  ]} /></MemoryRouter>)
  const cells = within(screen.getAllByRole('row')[2]).getAllByRole('cell')
  expect(cells[2]).toHaveTextContent('—')
  expect(cells[5]).toHaveTextContent('61.2%')
  expect(screen.queryByText('0.612')).not.toBeInTheDocument()
})

it('keeps home field attached to the selected matchup side when its team changes', () => {
  const ratedTeams = [
    { teamId: 1, displayName: 'Bears' }, { teamId: 2, displayName: 'Bills' }, { teamId: 3, displayName: 'Chiefs' },
  ]
  render(<MemoryRouter><MatchupTab ratedTeams={ratedTeams} /></MemoryRouter>)
  const home = screen.getByLabelText('Home team')
  expect(within(home).getAllByRole('option').map(o => o.textContent)).toEqual(['Neutral', 'Bears', 'Bills'])
  fireEvent.change(home, { target: { value: 'a' } })
  fireEvent.change(screen.getByLabelText('Team A'), { target: { value: '3' } })
  expect(home.selectedOptions[0]).toHaveTextContent('Chiefs')
  expect(home.value).toBe('a')
  expect(homeTeamForSide(home.value, 3, 2)).toBe(3)
  fireEvent.change(home, { target: { value: 'b' } })
  fireEvent.change(screen.getByLabelText('Team B'), { target: { value: '1' } })
  expect(home.selectedOptions[0]).toHaveTextContent('Bears')
  expect(homeTeamForSide(home.value, 3, 1)).toBe(1)
  fireEvent.change(home, { target: { value: '' } })
  expect(home.selectedOptions[0]).toHaveTextContent('Neutral')
  expect(homeTeamForSide(home.value, 3, 1)).toBeUndefined()
})

it('gives unknown URLs a home link and navigation', () => {
  render(<MemoryRouter initialEntries={['/missing-page']}><App /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'home page' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('navigation', { name: 'Main' })).toBeVisible()
})

it('shows cumulative PyPAT hover values in percent rather than raw fractions', () => {
  expect(pyPatPercent(0.6123)).toBe('61.2%')
  expect(pyPatPercent(0)).toBe('0.0%')
  expect(pyPatPercent(1)).toBe('100.0%')
})
