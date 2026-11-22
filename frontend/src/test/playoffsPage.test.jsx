import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PlayoffsPage from '../pages/PlayoffsPage'
import App from '../App'
import * as client from '../api/client'
import * as exports from '../utils/exportTable'
import { clearLoadCache } from '../utils/useLoad'

import pictureFixture from './fixtures/playoffs/picture.json'

vi.mock('../api/client')

const response = (extra = {}) => ({ ...structuredClone(pictureFixture), ...extra })
function Where() {
  return <div data-testid="where">{useLocation().search}</div>
}
const show = (url = '/playoffs') => render(<MemoryRouter initialEntries={[url]}><PlayoffsPage /><Where /></MemoryRouter>)
const afc = () => within(screen.getByRole('region', { name: 'AFC' }))
beforeEach(() => {
  vi.resetAllMocks()
  clearLoadCache()
  client.getSeasons.mockResolvedValue([0, 1])
  client.getPlayoffPicture.mockImplementation((season, rules) => Promise.resolve(response({ season, rules })))
})

describe('Playoff picture', () => {
  it('renders seven seeds and the hunt in each conference with team profile links', async () => {
    show()
    await screen.findByText('If the season ended today · Season 104 after Week 16')
    for (const name of ['AFC', 'NFC']) {
      const conference = within(screen.getByRole('region', { name }))
      for (const { seed, team } of pictureFixture.conferences.find(c => c.name === name).seeds) {
        const link = conference.getByRole('link', { name: team.displayName })
        expect(link).toHaveAttribute('href', `/teams/${team.abbrName}?season=104`)
        expect(within(link.closest('tr')).getAllByRole('cell')[0]).toHaveTextContent(String(seed))
      }
      expect(conference.getAllByText('Division leader')).toHaveLength(4)
      expect(conference.getAllByText('Wild card')).toHaveLength(3)
      expect(conference.getByRole('columnheader', { name: 'In the hunt' })).toBeInTheDocument()
      expect(conference.getByRole('link', { name: pictureFixture.conferences.find(c => c.name === name).hunt[0].team.displayName })).toBeInTheDocument()
    }
    expect(screen.getByRole('tab', { name: 'Picture', selected: true })).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('?tab=picture')
  })

  it('ignores old rules parameters and hides the comparison UI', async () => {
    show('/playoffs?rules=nfl')
    await screen.findByRole('region', { name: 'AFC' })
    expect(client.getPlayoffPicture).toHaveBeenCalledWith(1, 'madden')
    expect(screen.queryByRole('group', { name: 'Tiebreak rules' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Real NFL|Why different rules/)).not.toBeInTheDocument()
    expect(screen.getByTestId('where')).not.toHaveTextContent('rules=')
  })

  it('expands the plain-English reasons for a tiebreak', async () => {
    const data = response()
    for (const c of data.conferences) for (const row of [...c.seeds, ...c.hunt]) row.reasons = []
    data.conferences[0].seeds[4].reasons = ['Philadelphia and Detroit won the tiebreak.', 'Washington missed the field.']
    client.getPlayoffPicture.mockResolvedValue(data)
    show()
    await userEvent.click(await screen.findByText('Tiebreak details'))
    const reason = screen.getByText('Philadelphia and Detroit won the tiebreak.')
    expect(reason.closest('details')).toHaveAttribute('open')
    expect(screen.getByText('Washington missed the field.')).toBeVisible()
  })

  it('shows an empty state when no regular-season game has been completed', async () => {
    client.getPlayoffPicture.mockResolvedValue(response({ throughWeek: null, nextWeek: 0 }))
    show()
    expect(await screen.findByText(/No playoff picture yet/)).toBeInTheDocument()
    expect(screen.getByText(/No games played yet/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('labels a completed regular season', async () => {
    client.getPlayoffPicture.mockResolvedValue(response({ throughWeek: 17, nextWeek: null }))
    show()
    expect(await screen.findByText('If the season ended today · Season 105 after Week 18 · Regular season complete')).toBeInTheDocument()
  })

  it('offers every export format for each conference with the displayed rows and response parameters', async () => {
    const csv = vi.spyOn(exports, 'exportCsv').mockReturnValue('saved')
    show()
    await screen.findByRole('region', { name: 'AFC' })
    for (const name of ['AFC', 'NFC']) {
      const conference = within(screen.getByRole('region', { name }))
      for (const format of ['XLSX', 'CSV', 'PNG', 'AI']) expect(conference.getByRole('button', { name: format })).toBeInTheDocument()
      await userEvent.click(conference.getByRole('button', { name: 'CSV' }))
      const spec = csv.mock.lastCall[0]
      expect(spec.rows).toHaveLength(16)
      expect(spec.api).toMatchObject({ path: '/playoffs/picture', params: { season: 1, rules: 'madden' } })
      expect(spec.cols.every(col => col.desc)).toBe(true)
      const hunt = pictureFixture.conferences.find(c => c.name === name).hunt[0]
      expect(exports.toRows(spec)[8]).toEqual(['', '8', hunt.team.displayName, `${hunt.wins}-${hunt.losses}`, 'In the hunt', hunt.reasons.join(' '), `${Math.round(hunt.odds.playoffs * 100)}%`])
    }
    csv.mockRestore()
  })

  it('renders whole-percent odds only when the response includes odds', async () => {
    const data = response()
    for (const row of [...data.conferences[1].seeds, ...data.conferences[1].hunt]) delete row.odds
    data.conferences[0].seeds[0].odds = { playoffs: 0.645, division: 0.31, oneSeed: 0.03 }
    client.getPlayoffPicture.mockResolvedValue(data)
    show()
    await screen.findByRole('region', { name: 'AFC' })
    const row = afc().getByRole('link', { name: data.conferences[0].seeds[0].team.displayName }).closest('tr')
    expect(within(row).getByText('65%')).toBeInTheDocument()
    expect(afc().getByRole('columnheader', { name: 'Playoff probability' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'NFC' })).queryByRole('columnheader', { name: 'Playoff probability' })).not.toBeInTheDocument()
  })

  it('ignores a late response for a season the user has left', async () => {
    let finish
    client.getPlayoffPicture.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    show('/playoffs?season=0')
    await waitFor(() => expect(client.getPlayoffPicture).toHaveBeenCalledWith(0, 'madden'))
    await userEvent.selectOptions(screen.getByLabelText('Season'), '1')
    await screen.findByRole('region', { name: 'AFC' })
    await act(async () => finish(response({ throughWeek: 0 })))
    expect(screen.getByText(/after Week 16/)).toBeInTheDocument()
    expect(screen.queryByText(/after Week 1$/)).not.toBeInTheDocument()
  })

  it('loads a selected season from the URL and refetches on season changes', async () => {
    show('/playoffs?tab=picture&rules=nfl&season=0')
    await screen.findByText(/Season 103 after Week 16/)
    expect(client.getPlayoffPicture).toHaveBeenCalledWith(0, 'madden')
    await userEvent.selectOptions(screen.getByLabelText('Season'), '1')
    await screen.findByText(/Season 104 after Week 16/)
    expect(client.getPlayoffPicture).toHaveBeenLastCalledWith(1, 'madden')
    expect(screen.getByTestId('where')).toHaveTextContent('season=1')
  })

  it('shows loading while waiting for the API', async () => {
    client.getPlayoffPicture.mockReturnValue(new Promise(() => {}))
    show()
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText(/No playoff picture yet/)).not.toBeInTheDocument()
  })

  it.each(['getSeasons', 'getPlayoffPicture'])('shows an error when %s fails', async method => {
    client[method].mockRejectedValue(new Error('unavailable'))
    show()
    expect(await screen.findByText(/Could not load playoff picture/)).toBeInTheDocument()
    expect(screen.queryByText(/No playoff picture yet/)).not.toBeInTheDocument()
  })

  it('shows an empty state when no seasons exist', async () => {
    client.getSeasons.mockResolvedValue([])
    show()
    expect(await screen.findByText(/No playoff picture yet/)).toBeInTheDocument()
    expect(client.getPlayoffPicture).not.toHaveBeenCalled()
  })

  it('falls back to Picture and Madden for unknown query values', async () => {
    show('/playoffs?tab=unknown&rules=unknown')
    await screen.findByRole('region', { name: 'AFC' })
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Picture')
    expect(screen.getByTestId('where')).toHaveTextContent('tab=picture')
  })

  it('registers the page and labels the navigation entry Beta', async () => {
    render(<MemoryRouter initialEntries={['/playoffs']}><App /></MemoryRouter>)
    await screen.findByRole('region', { name: 'AFC' })
    const link = within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: /Playoffs/ })
    expect(link).toHaveAttribute('href', '/playoffs')
    expect(within(link).getByText('Beta')).toBeInTheDocument()
  })
})
