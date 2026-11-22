import WhatIfTab from '../components/playoffs/WhatIfTab'
import ClinchBadge, { useClinch, teamMarker, markerOdds, markerValue } from '../components/playoffs/ClinchBadge'
import OddsTab from '../components/playoffs/OddsTab'
import LeverageTab from '../components/playoffs/LeverageTab'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getPlayoffPicture, getSeasons } from '../api/client'
import PageHeader from '../components/PageHeader'
import Tabs from '../components/Tabs'
import InfoTip from '../components/InfoTip'
import ExportMenu from '../components/ExportMenu'
import { TeamLogo } from '../components/TeamLogo'
import { useLoad } from '../utils/useLoad'
import { seasonLabel, seasonNumber } from '../utils/seasons'
import { weekName } from '../utils/playoffRounds'
import { recordText } from '../utils/teamProfile'

const TABS = [{ value: 'picture', label: 'Picture' }, { value: 'probability', label: 'Probability' }, { value: 'leverage', label: 'Leverage' }, { value: 'whatif', label: 'What-If' }]
const status = row => row.seed == null ? 'In the hunt' : row.divisionWinner ? 'Division leader' : 'Wild card'
const oddsText = row => row.odds?.playoffs == null ? '' : markerOdds(row.odds.playoffs, row.markers?.playoffs)

function pictureLabel(data) {
  const progress = data.throughWeek == null ? ' · No games played yet' : ` after ${weekName(data.throughWeek)}`
  return `If the season ended today · ${seasonLabel(data.season)}${progress}${data.nextWeek == null && data.throughWeek != null ? ' · Regular season complete' : ''}`
}

function Conference({ conference, data, clinch }) {
  const rows = [...conference.seeds, ...conference.hunt].map(r => ({ ...r, markers: teamMarker(clinch, r.team.teamId) }))
  const hasOdds = rows.some(row => row.odds != null)
  const spec = {
    name: `Playoffs — ${conference.name}`,
    qualifier: pictureLabel(data),
    description: 'Playoff seeds and every team in the hunt, using completed regular-season games only and end-of-season tiebreakers.',
    rows,
    cols: [
      { label: 'Seed', desc: 'Playoff seed, 1–7; empty for teams outside the field.', text: r => String(r.seed ?? ''), value: r => r.seed, z: '0' },
      { label: 'Rank', desc: 'Conference position, including teams outside the playoff field.', text: r => String(r.seed ?? r.rank), value: r => r.seed ?? r.rank, z: '0', imageHidden: true },
      { label: 'Team', desc: 'Team name.', text: r => r.team.displayName, logo: r => r.team.abbrName },
      { label: 'Record', desc: 'Completed regular-season wins, losses and ties.', text: recordText },
      { label: 'Position', desc: 'Division leader, wild card or in the hunt.', text: status },
      { label: 'Tiebreakers', desc: 'Reasons a tiebreak determined this position.', text: r => r.reasons.join(' ') },
      ...(hasOdds ? [{ label: 'Playoff probability', desc: 'Chance of making the playoffs, rounded to a whole percent.', text: oddsText, value: r => markerValue(r.odds?.playoffs, r.markers?.playoffs), z: '0%' }] : []),
    ],
    api: {
      path: '/playoffs/picture', params: { season: data.season, rules: data.rules },
      note: `Only ${conference.name}; seeds followed by hunt in API order.`,
      fields: { Seed: 'seeds[].seed; empty for hunt[]', Rank: 'seed or rank', Team: 'team.displayName', Record: 'wins-losses[-ties]', Position: 'seed and divisionWinner', Tiebreakers: 'reasons joined as sentences', ...(hasOdds ? { 'Playoff probability': 'odds.playoffs × 100, whole percent; absent means empty' } : {}) },
    },
  }
  const renderRow = row => (
    <tr key={row.team.teamId} className="border-b border-line">
      <td className="py-3 pr-2 num text-muted align-top">{row.seed ?? '—'}</td>
      <td className="py-3 pr-2">
        <div className="flex items-center gap-2">
          <TeamLogo abbr={row.team.abbrName} />
          <Link to={`/teams/${row.team.abbrName}?season=${seasonNumber(data.season)}`} className="font-semibold hover:text-accent hover:underline">{row.team.displayName}</Link>
        </div>
        <ClinchBadge markers={row.markers} /><div className="text-xs text-muted mt-1">{status(row)}</div>
        {row.reasons.length > 0 && (
          <details className="text-xs mt-1">
            <summary className="cursor-pointer text-muted">Tiebreak details</summary>
            {row.reasons.map(reason => <p key={reason} className="mt-1">{reason}</p>)}
          </details>
        )}
      </td>
      <td className="py-3 text-right num align-top whitespace-nowrap">{recordText(row)}</td>
      {hasOdds && <td className="py-3 pl-3 text-right num align-top">{oddsText(row)}</td>}
    </tr>
  )
  return (
    <section aria-label={conference.name} className="min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-2 border-b-2 border-rule pb-2">
        <h2 className="font-display font-bold text-2xl">{conference.name}</h2>
        <ExportMenu spec={spec} />
      </div>
      <table className="w-full text-sm" aria-label={`${conference.name} playoff picture`}>
        <thead><tr className="text-xs text-muted border-b border-line">
          <th scope="col" className="py-2 pr-2 text-left">Seed</th>
          <th scope="col" className="py-2 text-left">Team</th>
          <th scope="col" className="py-2 text-right">Record</th>
          {hasOdds && <th scope="col" className="py-2 pl-3 text-right">Playoff probability</th>}
        </tr></thead>
        <tbody>{rows.filter(r => r.seed != null).map(renderRow)}</tbody>
        <tbody>
          <tr><th colSpan={hasOdds ? 4 : 3} className="text-left py-3 border-y-2 border-rule bg-surface text-xs uppercase tracking-wide">In the hunt</th></tr>
          {rows.filter(r => r.seed == null).map(renderRow)}
        </tbody>
      </table>
    </section>
  )
}

export default function PlayoffsPage() {
  const [params, setParams] = useSearchParams()
  const requestedTab = params.get('tab') === 'odds' ? 'probability' : params.get('tab')
  const tab = TABS.some(t => t.value === requestedTab) ? requestedTab : 'picture'
  const rules = 'madden'
  const seasons = useLoad('seasons', getSeasons)
  const requestedSeason = params.get('season')
  const season = requestedSeason != null && seasons.data?.includes(Number(requestedSeason))
    ? Number(requestedSeason) : seasons.data?.at(-1)
  const picture = useLoad(season == null || tab !== 'picture' ? null : `playoffs-picture-${season}-${rules}`, () => getPlayoffPicture(season, 'madden'))
  useEffect(() => {
    if (params.get('tab') === tab && !params.has('rules')) return
    setParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      next.delete('rules')
      return next
    }, { replace: true })
  }, [params, tab, rules, setParams])
  const updateParam = (key, value) => setParams(prev => {
    const next = new URLSearchParams(prev)
    next.set(key, value)
    return next
  }, { replace: true })
  const clinch = useClinch(season, rules)
  const data = picture.data
  const hasRows = data?.conferences.some(c => c.seeds.length || c.hunt.length)
  return (
    <div>
      <PageHeader title="Playoffs" qualifier={tab === 'picture' ? (data ? pictureLabel(data) : 'If the season ended today') : tab === 'probability' ? 'Chances of reaching the postseason' : tab === 'whatif' ? 'Pick results and explore playoff scenarios' : 'What a win or loss changes'}>
        <select aria-label="Season" className="field" value={season ?? ''} onChange={e => updateParam('season', e.target.value)}>
          {(seasons.data ?? []).map(s => <option key={s} value={s}>{seasonLabel(s)}</option>)}
        </select>
        <InfoTip text="Seeds follow Madden 27's tiebreaker rules."><span className="text-xs text-muted" tabIndex={0}>How seeds are decided</span></InfoTip>
      </PageHeader>
      <Tabs tabs={TABS} value={tab} onChange={value => updateParam('tab', value)} />
      {tab === 'whatif' && season != null && <WhatIfTab season={season} rules={rules} />}
      {tab === 'probability' && season != null && <OddsTab season={season} rules={rules} />}
      {tab === 'leverage' && season != null && <LeverageTab season={season} rules={rules} params={params} updateParam={updateParam} />}
      {tab !== 'picture' && seasons.loading && <p className="text-muted">Loading…</p>}
      {tab !== 'picture' && seasons.data?.length === 0 && <p className="text-muted">No playoff data available.</p>}
      {tab !== 'picture' && seasons.error && <p className="text-bad">Could not load seasons.</p>}
      {tab === 'picture' && <>
      {(seasons.error || picture.error) && <p className="text-bad">Could not load playoff picture. Try again in a moment.</p>}
      {(seasons.loading || picture.loading) && <p className="text-muted">Loading…</p>}
      {((seasons.data?.length === 0) || (data && (data.throughWeek == null || !hasRows))) && <p className="text-muted">No playoff picture yet. Completed regular-season games will appear here.</p>}
      {data?.throughWeek != null && hasRows && <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">{data.conferences.map(conference => <Conference key={conference.name} conference={conference} data={data} clinch={clinch} />)}</div>}
      </>}
    </div>
  )
}
