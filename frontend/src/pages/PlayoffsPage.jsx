import { Fragment, useEffect } from 'react'
import { SortTh, useSorter } from '../components/SortTh'
import { probShade } from '../utils/playoffOdds'
import WhatIfTab from '../components/playoffs/WhatIfTab'
import ClinchBadge, { useClinch, teamMarker, markerOdds, markerValue } from '../components/playoffs/ClinchBadge'
import OddsTab from '../components/playoffs/OddsTab'
import LeverageTab from '../components/playoffs/LeverageTab'
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
  const sorter = useSorter({ key: 'seed', asc: true })
  const rows = sorter.apply([...conference.seeds, ...conference.hunt].map(r => ({ ...r, markers: teamMarker(clinch, r.team.teamId) })), {
    seed: r => r.seed ?? r.rank, team: r => r.team.displayName,
    record: r => (r.wins + (r.ties ?? 0) / 2) / (r.wins + r.losses + (r.ties ?? 0) || 1),
    position: status, playoffs: r => markerValue(r.odds?.playoffs, r.markers?.playoffs), reasons: r => r.reasons.join(' '),
  })
  const showHunt = sorter.sort.key === 'seed' && sorter.sort.asc
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
      ...(hasOdds ? [{ label: 'Playoff probability', desc: 'Chance of making the playoffs, rounded to a whole percent.', text: oddsText, value: r => markerValue(r.odds?.playoffs, r.markers?.playoffs), z: '0%', color: r => probShade(markerValue(r.odds?.playoffs, r.markers?.playoffs)) }] : []),
    ],
    api: {
      path: '/playoffs/picture', params: { season: data.season, rules: data.rules },
      note: `Only ${conference.name}; sorted by ${sorter.sort.key} ${sorter.sort.asc ? 'ascending' : 'descending'}.`,
      fields: { Seed: 'seeds[].seed; empty for hunt[]', Rank: 'seed or rank', Team: 'team.displayName', Record: 'wins-losses[-ties]', Position: 'seed and divisionWinner', Tiebreakers: 'reasons joined as sentences', ...(hasOdds ? { 'Playoff probability': 'odds.playoffs × 100, whole percent; absent means empty' } : {}) },
    },
  }
  const headers = [
    ['seed', 'Seed', 'Conference seed; teams outside the field show a dash.'],
    ['team', 'Team', 'Team and proven clinch or elimination status.'],
    ['record', 'Record', 'Completed regular-season record; sorts by winning percentage.'],
    ['position', 'Position', 'Division leader, wild card or in the hunt.'],
    ...(hasOdds ? [['playoffs', 'Playoff probability', 'Chance of making the playoffs. Green is high; red is low.']] : []),
    ['reasons', 'Tiebreak', 'Why a tiebreak determined this position.'],
  ]
  return <section aria-label={conference.name} className="min-w-0">
    <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
      <h2 className="font-display font-bold uppercase text-xl leading-none">{conference.name}</h2><ExportMenu spec={spec} />
    </div>
    <div className="overflow-x-auto border-y border-rule whitespace-nowrap"><table className="w-full text-sm num" aria-label={`${conference.name} playoff picture`}>
      <thead><tr className="border-b border-rule">{headers.map(([key, label, tip]) => <SortTh key={key} sortKey={key} tip={tip} state={sorter.sort} onSort={sorter.click} className={['seed', 'record', 'playoffs'].includes(key) ? 'text-right' : ''}>{label}</SortTh>)}</tr></thead>
      <tbody>{rows.map((row, i) => <Fragment key={row.team.teamId}>
        {showHunt && row.seed == null && (i === 0 || rows[i - 1].seed != null) && <tr><th colSpan={headers.length} className="text-left px-2 py-1 border-y border-rule bg-surface text-xs uppercase tracking-wide">In the hunt</th></tr>}
        <tr className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
          <td className="px-2 py-1.5 num text-muted">{row.seed ?? '—'}</td>
          <td className="px-2 py-1.5"><span className="inline-flex items-center gap-1.5"><TeamLogo abbr={row.team.abbrName} size={20} /><Link to={`/teams/${row.team.abbrName}?season=${seasonNumber(data.season)}`} className="font-semibold hover:text-accent hover:underline">{row.team.displayName}</Link><ClinchBadge markers={row.markers} compact /></span></td>
          <td className="px-2 num text-right">{recordText(row)}</td>
          <td className="px-2 text-xs text-muted">{status(row)}</td>
          {hasOdds && <td className="px-2 text-right num" style={{ background: probShade(markerValue(row.odds?.playoffs, row.markers?.playoffs)) }}>{oddsText(row) || '—'}</td>}
          <td className="px-2 text-center">{row.reasons.length > 0 ? <InfoTip text={row.reasons.join(' ')}><span tabIndex={0} aria-label={`Tiebreak for ${row.team.displayName}`} className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-rule text-[10px] font-semibold leading-none cursor-help">i</span></InfoTip> : '—'}</td>
        </tr>
      </Fragment>)}</tbody>
    </table></div>
  </section>
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
