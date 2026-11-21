import { StrictMode } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import EfficiencyPage from '../pages/EfficiencyPage'
import * as client from '../api/client'

vi.mock('../api/client')

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }

const side = (extra = {}) => ({
  drives: 20, plays: 100, pointsPerDrive: 2.5, pointsPerPlay: 0.5, yardsPerPlay: 5,
  seriesRate: 0.7, thirdDownRate: 0.4, redZoneTdRate: 0.6, giveawayRate: 0.1, sackRate: 0.05,
  ...extra,
})
const row = (teamId, displayName, extra = {}) => ({
  teamId, displayName, abbrName: displayName.slice(0, 3).toUpperCase(), games: 2,
  offense: side(), defense: side({ pointsPerDrive: 1.1, giveawayRate: 0.3 }), netPointsPerDrive: 0.4,
  ...extra,
})

function Where() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  return <>
    <div data-testid="where">{pathname + search}</div>
    <div data-testid="navType">{useNavigationType()}</div>
    <button onClick={() => navigate(-1)}>Back</button>
  </>
}

const renderAt = (url = '/efficiency') => render(
  <MemoryRouter initialEntries={['/previous', url]} initialIndex={1}>
    <EfficiencyPage />
    <Where />
  </MemoryRouter>,
)
const selected = () => screen.getByRole('tab', { selected: true }).textContent
const teamRow = name => screen.getByText(name).closest('tr')
const cells = name => within(teamRow(name)).getAllByRole('cell')
const teamOrder = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
  .map(r => within(r).getAllByRole('cell')[0].textContent)

describe('EfficiencyPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    client.getSeasons.mockResolvedValue([6, 7])
    client.getEfficiency.mockResolvedValue([
      row(1, 'Aces'),
      row(2, 'Wolves', { defense: side({ pointsPerDrive: 2.2, giveawayRate: 0.05 }), netPointsPerDrive: -0.25 }),
    ])
  })

  it.each(['resolve', 'reject'])('ignores a stale StrictMode seasons call that later %ss', async outcome => {
    let resolveSlow
    let rejectSlow
    client.getSeasons.mockReturnValueOnce(new Promise((resolve, reject) => {
      resolveSlow = resolve
      rejectSlow = reject
    }))
    render(
      <StrictMode>
        <MemoryRouter>
          <EfficiencyPage />
        </MemoryRouter>
      </StrictMode>,
    )
    await screen.findByRole('table')
    expect(client.getSeasons).toHaveBeenCalledTimes(2)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Season' }), '6')
    await waitFor(() => expect(client.getEfficiency).toHaveBeenLastCalledWith(6, 'regular'))
    await screen.findByRole('table')

    await act(async () => {
      if (outcome === 'resolve') resolveSlow([6, 7])
      else rejectSlow(new Error('Stale seasons request failed'))
    })

    expect(screen.getByRole('combobox', { name: 'Season' })).toHaveValue('6')
    expect(client.getEfficiency).toHaveBeenLastCalledWith(6, 'regular')
    expect(screen.queryByText("Couldn't load seasons. Try again in a moment.")).not.toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('opens Overview without a tab parameter', async () => {
    renderAt()
    await screen.findByRole('table')
    expect(selected()).toBe('Overview')
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/efficiency$/)
  })

  it('opens Defense from the tab parameter', async () => {
    renderAt('/efficiency?tab=defense')
    await screen.findByRole('table')
    expect(selected()).toBe('Defense')
  })

  it('falls back to Overview for an unknown tab', async () => {
    renderAt('/efficiency?tab=unknown')
    await screen.findByRole('table')
    expect(selected()).toBe('Overview')
  })

  it('removes the Overview parameter and replaces tab history so Back leaves the page', async () => {
    renderAt('/efficiency?tab=defense')
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('tab', { name: 'Offense' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/efficiency?tab=offense')
    expect(screen.getByTestId('navType')).toHaveTextContent('REPLACE')
    await userEvent.click(screen.getByRole('tab', { name: 'Overview' }))
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/efficiency$/)
    expect(screen.getByTestId('navType')).toHaveTextContent('REPLACE')
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/previous$/)
  })

  it('shows defensive values and rewards fewer points and more takeaways', async () => {
    renderAt('/efficiency?tab=defense')
    await screen.findByRole('table')
    expect(cells('Aces')[4]).toHaveTextContent('1.10')
    expect(cells('Wolves')[4]).toHaveTextContent('2.20')
    expect(cells('Aces')[4].style.backgroundColor.replaceAll(',', '')).toContain('22 163 74')
    expect(cells('Aces')[10]).toHaveTextContent('0.30')
    expect(cells('Aces')[10].style.backgroundColor.replaceAll(',', '')).toContain('22 163 74')
    await userEvent.click(screen.getByRole('tab', { name: 'Offense' }))
    expect(cells('Aces')[4]).toHaveTextContent('2.50')
  })

  it('renders undefined metrics as em dashes without NaN or zero rates', async () => {
    const empty = side(Object.fromEntries(Object.keys(side()).filter(k => !['drives', 'plays'].includes(k)).map(k => [k, null])))
    client.getEfficiency.mockResolvedValue([row(1, 'Aces', { offense: empty, defense: empty, netPointsPerDrive: null })])
    renderAt()
    await screen.findByRole('table')
    expect(within(teamRow('Aces')).getAllByText('—')).toHaveLength(5)
    for (const tab of ['Offense', 'Defense']) {
      await userEvent.click(screen.getByRole('tab', { name: tab }))
      expect(within(teamRow('Aces')).getAllByText('—')).toHaveLength(8)
      expect(teamRow('Aces')).not.toHaveTextContent('NaN')
      expect(teamRow('Aces')).not.toHaveTextContent('0.00')
    }
  })

  it('shows an empty state when no teams have stats', async () => {
    client.getEfficiency.mockResolvedValue([])
    renderAt()
    expect(await screen.findByText(/No team stats yet/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows a request error when efficiency cannot load', async () => {
    client.getEfficiency.mockRejectedValue(new Error('Unavailable'))
    renderAt()
    expect(await screen.findByText("Couldn't load efficiency stats. Try again in a moment.")).toBeInTheDocument()
    expect(screen.queryByText(/No team stats yet/)).not.toBeInTheDocument()
  })

  it('requests the selected season and each named stage', async () => {
    renderAt()
    await screen.findByRole('table')
    expect(client.getEfficiency).toHaveBeenLastCalledWith(7, 'regular')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Season' }), '6')
    await waitFor(() => expect(client.getEfficiency).toHaveBeenLastCalledWith(6, 'regular'))
    for (const stage of ['Playoffs', 'Both', 'Regular season']) {
      await userEvent.click(screen.getByRole('button', { name: stage }))
      await waitFor(() => expect(client.getEfficiency).toHaveBeenLastCalledWith(6, stage === 'Regular season' ? 'regular' : stage.toLowerCase()))
      expect(screen.getByRole('button', { name: stage })).toHaveAttribute('aria-pressed', 'true')
    }
  })

  it('ignores a previous season response that arrives after the selected season', async () => {
    let resolveSlow
    client.getEfficiency.mockReturnValueOnce(new Promise(resolve => { resolveSlow = resolve }))
      .mockResolvedValueOnce([row(2, 'Wolves')])
    renderAt()
    await waitFor(() => expect(client.getEfficiency).toHaveBeenCalledWith(7, 'regular'))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Season' }), '6')
    await screen.findByText('Wolves')
    await act(async () => { resolveSlow([row(1, 'Aces')]) })
    expect(screen.queryByText('Aces')).not.toBeInTheDocument()
    expect(screen.getByText('Wolves')).toBeInTheDocument()
  })

  it('sorts a clicked metric in both directions while nulls stay last', async () => {
    client.getEfficiency.mockResolvedValue([
      row(1, 'Aces', { offense: side({ yardsPerPlay: 4 }) }),
      row(2, 'Wolves', { offense: side({ yardsPerPlay: 7 }) }),
      row(3, 'Nulls', { offense: side({ yardsPerPlay: null }) }),
    ])
    renderAt('/efficiency?tab=offense')
    await screen.findByRole('table')
    const header = screen.getByRole('columnheader', { name: /Yds\/Play/ })
    await userEvent.click(header)
    expect(teamOrder()).toEqual(['Wolves', 'Aces', 'Nulls'])
    expect(header).toHaveAttribute('aria-sort', 'descending')
    await userEvent.click(header)
    expect(teamOrder()).toEqual(['Aces', 'Wolves', 'Nulls'])
    expect(header).toHaveAttribute('aria-sort', 'ascending')
  })

  it('shows signed net points per drive on Overview', async () => {
    renderAt()
    const table = within(await screen.findByRole('table'))
    expect(table.getByText('+0.40')).toBeInTheDocument()
    expect(table.getByText('-0.25')).toBeInTheDocument()
  })
})
