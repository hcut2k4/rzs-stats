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

const TABS = [{ value: 'picture', label: 'Picture' }]
const RULES = [{ value: 'madden', label: 'Madden 27' }, { value: 'nfl', label: 'Real NFL' }]
const RULES_TIP = 'Madden 27 uses different tiebreakers than the real NFL. Switching rules can change which tied teams make the playoffs and their seeds.'
const status = row => row.seed == null ? 'In the hunt' : row.divisionWinner ? 'Division leader' : 'Wild card'
const otherSeed = row => row.otherRulesSeed == null ? 'out' : `seed ${row.otherRulesSeed}`
const otherLabel = rules => rules === 'madden' ? 'Real NFL rules' : 'Madden 27 rules'
const oddsText = row => row.odds?.playoffs == null ? '' : `${Math.round(row.odds.playoffs * 100)}%`

function pictureLabel(data) {
  const progress = data.throughWeek == null ? ' · No games played yet' : ` after ${weekName(data.throughWeek)}`
  return `If the season ended today · ${seasonLabel(data.season)}${progress}${data.nextWeek == null && data.throughWeek != null ? ' · Regular season complete' : ''}`
}

function Conference({ conference, data }) {
  const rows = [...conference.seeds, ...conference.hunt]
  const hasOdds = rows.some(row => row.odds != null)
  const spec = {
    name: `Playoffs — ${conference.name}`,
    qualifier: `${pictureLabel(data)} · ${data.rules === 'madden' ? 'Madden 27' : 'Real NFL'} rules`,
    description: 'Playoff seeds and every team in the hunt, using completed regular-season games only and end-of-season tiebreakers.',
    rows,
    cols: [
      { label: 'Seed', desc: 'Playoff seed, 1–7; empty for teams outside the field.', text: r => String(r.seed ?? ''), value: r => r.seed, z: '0' },
      { label: 'Rank', desc: 'Conference position, including teams outside the playoff field.', text: r => String(r.seed ?? r.rank), value: r => r.seed ?? r.rank, z: '0', imageHidden: true },
      { label: 'Team', desc: 'Team name.', text: r => r.team.displayName, logo: r => r.team.abbrName },
      { label: 'Record', desc: 'Completed regular-season wins, losses and ties.', text: recordText },
      { label: 'Position', desc: 'Division leader, wild card or in the hunt.', text: status },
      { label: otherLabel(data.rules), desc: 'Playoff seed under the other tiebreak rules, or out.', text: otherSeed },
      { label: 'Tiebreakers', desc: 'Reasons a tiebreak determined this position.', text: r => r.reasons.join(' ') },
      ...(hasOdds ? [{ label: 'Playoffs odds', desc: 'Chance of making the playoffs, rounded to a whole percent.', text: oddsText, value: r => r.odds?.playoffs, z: '0%' }] : []),
    ],
    api: {
      path: '/playoffs/picture', params: { season: data.season, rules: data.rules },
      note: `Only ${conference.name}; seeds followed by hunt in API order.`,
      fields: { Seed: 'seeds[].seed; empty for hunt[]', Rank: 'seed or rank', Team: 'team.displayName', Record: 'wins-losses[-ties]', Position: 'seed and divisionWinner', [otherLabel(data.rules)]: 'otherRulesSeed; null means out', Tiebreakers: 'reasons joined as sentences', ...(hasOdds ? { 'Playoffs odds': 'odds.playoffs × 100, whole percent; absent means empty' } : {}) },
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
        <div className="text-xs text-muted mt-1">{status(row)}</div>
        {row.otherRulesSeed !== (row.seed ?? null) && <div className="text-xs text-accent mt-1">{otherLabel(data.rules)}: {otherSeed(row)}</div>}
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
          {hasOdds && <th scope="col" className="py-2 pl-3 text-right">Playoffs odds</th>}
        </tr></thead>
        <tbody>{conference.seeds.map(renderRow)}</tbody>
        <tbody>
          <tr><th colSpan={hasOdds ? 4 : 3} className="text-left py-3 border-y-2 border-rule bg-surface text-xs uppercase tracking-wide">In the hunt</th></tr>
          {conference.hunt.map(renderRow)}
        </tbody>
      </table>
    </section>
  )
}

export default function PlayoffsPage() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(t => t.value === params.get('tab')) ? params.get('tab') : 'picture'
  const rules = params.get('rules') === 'nfl' ? 'nfl' : 'madden'
  const seasons = useLoad('seasons', getSeasons)
  const requestedSeason = params.get('season')
  const season = requestedSeason != null && seasons.data?.includes(Number(requestedSeason))
    ? Number(requestedSeason) : seasons.data?.at(-1)
  const picture = useLoad(season == null ? null : `playoffs-picture-${season}-${rules}`, () => getPlayoffPicture(season, rules))
  useEffect(() => {
    if (params.get('tab') === tab && params.get('rules') === rules) return
    setParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      next.set('rules', rules)
      return next
    }, { replace: true })
  }, [params, tab, rules, setParams])
  const updateParam = (key, value) => setParams(prev => {
    const next = new URLSearchParams(prev)
    next.set(key, value)
    return next
  }, { replace: true })
  const data = picture.data
  const hasRows = data?.conferences.some(c => c.seeds.length || c.hunt.length)
  return (
    <div>
      <PageHeader title="Playoffs" qualifier={data ? pictureLabel(data) : 'If the season ended today'}>
        <select aria-label="Season" className="field" value={season ?? ''} onChange={e => updateParam('season', e.target.value)}>
          {(seasons.data ?? []).map(s => <option key={s} value={s}>{seasonLabel(s)}</option>)}
        </select>
      </PageHeader>
      <Tabs tabs={TABS} value={tab} onChange={value => updateParam('tab', value)} />
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <div className="flex border border-line rounded overflow-hidden" role="group" aria-label="Tiebreak rules">
          {RULES.map(rule => <button key={rule.value} aria-pressed={rules === rule.value} onClick={() => updateParam('rules', rule.value)} className={`px-3 py-1.5 text-sm ${rules === rule.value ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}>{rule.label}</button>)}
        </div>
        <InfoTip text={RULES_TIP}><span className="text-xs text-muted" tabIndex={0}>Why different rules?</span></InfoTip>
      </div>
      {(seasons.error || picture.error) && <p className="text-bad">Could not load playoff picture. Try again in a moment.</p>}
      {(seasons.loading || picture.loading) && <p className="text-muted">Loading…</p>}
      {((seasons.data?.length === 0) || (data && (data.throughWeek == null || !hasRows))) && <p className="text-muted">No playoff picture yet. Completed regular-season games will appear here.</p>}
      {data?.throughWeek != null && hasRows && <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">{data.conferences.map(conference => <Conference key={conference.name} conference={conference} data={data} />)}</div>}
    </div>
  )
}
