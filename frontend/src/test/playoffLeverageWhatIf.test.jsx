import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import LeverageTab from '../components/playoffs/LeverageTab'
import WhatIfTab from '../components/playoffs/WhatIfTab'
import { clearLoadCache } from '../utils/useLoad'
import { probShade, chanceShade, swingShade, swingPoints } from '../utils/playoffOdds'
import * as client from '../api/client'
import * as exports from '../utils/exportTable'
import leverage from './fixtures/playoffs/leverage.json'
import remaining from './fixtures/playoffs/remaining.json'
import scenario from './fixtures/playoffs/simulate.json'
import exact from './fixtures/playoffs/simulate-exact.json'

vi.mock('../api/client')
beforeEach(() => {
  vi.resetAllMocks()
  clearLoadCache()
  client.getPlayoffLeverage.mockResolvedValue(structuredClone(leverage))
  client.getPlayoffRemaining.mockResolvedValue(structuredClone(remaining))
  client.simulatePlayoffs.mockResolvedValue(structuredClone(scenario))
})
const bodyRows = table => within(table).getAllByRole('row').slice(1)
const compare = (a, b) => typeof a === 'string' ? b.localeCompare(a) : b - a

it('combines participant probabilities into one table sorted by swing with matching exports and shading', async () => {
  const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
  render(<MemoryRouter><LeverageTab season={2} rules="madden" params={new URLSearchParams('small=true')} updateParam={() => {}} /></MemoryRouter>)
  const table = await screen.findByRole('table', { name: 'Game swings' })
  expect(screen.getAllByRole('table')).toHaveLength(2)
  expect(screen.queryByRole('region', { name: 'Win or lose chart' })).not.toBeInTheDocument()
  const participants = leverage.games.flatMap(g => g.teams.map(r => ({ ...r, opp: r.side === 'home' ? g.away : g.home })))
  const sorted = [...participants].sort((a, b) => swingPoints(b, 'playoffs') - swingPoints(a, 'playoffs'))
  expect(bodyRows(table).map(r => r.children[0].textContent)).toEqual(sorted.map(r => r.team.displayName))
  const first = bodyRows(table)[0]
  expect(first.children[2]).toHaveStyle({ background: probShade(sorted[0].ifLoss.playoffs) })
  expect(first.children[5]).toHaveStyle({ background: swingShade(swingPoints(sorted[0], 'playoffs')) })
  expect(within(first).getByRole('link')).toHaveAttribute('href', `/playoffs/${sorted[0].team.abbrName}?season=2`)
  const getters = { Team: r => r.team.displayName, Opp: r => r.opp.abbrName, 'If lose': r => r.ifLoss.playoffs, Range: r => r.current.playoffs, 'If win': r => r.ifWin.playoffs, Swing: r => swingPoints(r, 'playoffs') }
  for (const [label, get] of Object.entries(getters)) {
    const header = within(table).getByRole('columnheader', { name: new RegExp(`^${label}`) })
    await userEvent.click(header)
    expect(header).toHaveAttribute('aria-sort', 'descending')
    const expected = [...participants].sort((a, b) => compare(get(a), get(b)))
    expect(bodyRows(table).map(r => r.children[0].textContent)).toEqual(expected.map(r => r.team.displayName))
    await userEvent.click(within(table.closest('section')).getByTitle('Download every row of the table, in its current sort and columns, as CSV'))
    expect(csv.mock.lastCall[0].rows.map(r => r.team.teamId)).toEqual(expected.map(r => r.team.teamId))
    expect(csv.mock.lastCall[0].image.draw).toBeTypeOf('function')
  }
  const games = screen.getByRole('table', { name: 'Biggest games this week' })
  for (const header of within(games).getAllByRole('columnheader')) {
    await userEvent.click(header)
    expect(header.getAttribute('aria-sort')).not.toBe('none')
  }
  csv.mockRestore()
})

it('shows all teams by absolute playoff change in a sticky two-column workspace and sorts every result column', async () => {
  const data = structuredClone(scenario)
  data.conferences[0].teams[0].odds.playoffs = .1
  data.conferences[0].teams[0].baseline.playoffs = .95
  client.simulatePlayoffs.mockResolvedValue(data)
  const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
  render(<MemoryRouter><WhatIfTab season={2} rules="madden" /></MemoryRouter>)
  const table = await screen.findByRole('table', { name: 'Scenario probabilities' })
  const teams = data.conferences.flatMap(c => c.teams.map(r => ({ ...r, conference: c.name })))
  expect(bodyRows(table)).toHaveLength(32)
  const expected = [...teams].sort((a, b) => Math.abs(b.odds.playoffs - b.baseline.playoffs) - Math.abs(a.odds.playoffs - a.baseline.playoffs))
  expect(bodyRows(table).map(r => r.children[0].textContent)).toEqual(expected.map(r => r.team.displayName))
  expect(screen.getByLabelText('What-If workspace')).toHaveClass('lg:grid-cols-2')
  expect(screen.getByLabelText('Scenario results')).toHaveClass('lg:sticky', 'lg:top-4', 'lg:overflow-y-auto', 'lg:max-h-[calc(100dvh-2rem)]')
  const row = bodyRows(table).find(r => r.children[0].textContent === data.conferences[0].teams[0].team.displayName)
  expect(row.children[2]).toHaveStyle({ background: probShade(.1) })
  expect(row.children[3]).toHaveStyle({ background: chanceShade(data.conferences[0].teams[0].odds.division) })
  const getters = { Team: r => r.team.displayName, Conf: r => r.conference, Playoffs: r => r.odds.playoffs, Division: r => r.odds.division, 'No. 1 seed': r => r.odds.oneSeed }
  for (const [label, get] of Object.entries(getters)) {
    const header = within(table).getByRole('columnheader', { name: new RegExp(`^${label}`) })
    await userEvent.click(header)
    expect(header).toHaveAttribute('aria-sort', 'descending')
    expect(bodyRows(table).map(r => r.children[0].textContent)).toEqual([...teams].sort((a, b) => compare(get(a), get(b))).map(r => r.team.displayName))
    await userEvent.click(within(screen.getByRole('region', { name: 'What-If teams' })).getByTitle('Download every row of the table, in its current sort and columns, as CSV'))
    await waitFor(() => expect(csv.mock.lastCall[0].rows.map(r => r.team.teamId)).toEqual([...teams].sort((a, b) => compare(get(a), get(b))).map(r => r.team.teamId)))
  }
  csv.mockRestore()
})

it('toggles exact seeds, sorts seed tables and jumps to results from the mobile bar', async () => {
  client.simulatePlayoffs.mockResolvedValue(structuredClone(exact))
  const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
  render(<MemoryRouter><WhatIfTab season={2} rules="madden" /></MemoryRouter>)
  await screen.findByRole('table', { name: 'Scenario probabilities' })
  expect(screen.queryByRole('table', { name: 'AFC final seeds' })).not.toBeInTheDocument()
  const results = screen.getByLabelText('Scenario results')
  results.scrollIntoView = vi.fn()
  await userEvent.click(screen.getByRole('button', { name: /^Results ↓/ }))
  expect(results.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  expect(results).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'Final seeds' }))
  expect(screen.queryByRole('table', { name: 'Scenario probabilities' })).not.toBeInTheDocument()
  for (const conference of exact.conferences) {
    const table = screen.getByRole('table', { name: `${conference.name} final seeds` })
    const getters = { Seed: r => r.seed, Team: r => r.team.displayName, Record: r => r.wins + r.ties / 2, Details: r => [...r.reasons, r.dependsOnScores ? 'Winners alone do not decide this spot; point differential or a coin toss does.' : ''].filter(Boolean).join(' ') }
    for (const [label, get] of Object.entries(getters)) {
      await userEvent.click(within(table).getByRole('columnheader', { name: new RegExp(`^${label}`) }))
      const expected = [...conference.seeds].sort((a, b) => compare(get(a), get(b)))
      expect(bodyRows(table).map(r => r.children[1].textContent)).toEqual(expected.map(r => r.team.displayName))
      await userEvent.click(within(table.closest('section')).getByTitle('Download every row of the table, in its current sort and columns, as CSV'))
      expect(csv.mock.lastCall[0].rows.map(r => r.team.teamId)).toEqual(expected.map(r => r.team.teamId))
    }
  }
  await userEvent.click(screen.getByRole('button', { name: 'Teams', exact: true }))
  expect(screen.getByRole('table', { name: 'Scenario probabilities' })).toBeInTheDocument()
  csv.mockRestore()
})
