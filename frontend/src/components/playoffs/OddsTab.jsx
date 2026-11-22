import { SeedBar } from './SeedBar'
import SeedLegend from './SeedLegend'
import PlayoffError from './PlayoffError'
import OddsHistory from './OddsHistory'
import InfoTip from '../InfoTip'
import { SortTh, useSorter } from '../SortTh'
import ClinchBadge, { useClinch, teamMarker, markerOdds, markerValue } from './ClinchBadge'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getPlayoffOdds, getPlayoffCalibration, getPlayoffChampionship } from '../../api/client'
import ExportMenu from '../ExportMenu'
import { TeamLogo } from '../TeamLogo'
import { useLoad } from '../../utils/useLoad'
import { usePlayoffLoad } from '../../utils/usePlayoffLoad'
import { formatOdds, formatComputed, GOALS, probShade, chanceShade } from '../../utils/playoffOdds'
import { seasonLabel, seasonNumber } from '../../utils/seasons'
import { recordText } from '../../utils/teamProfile'

export function TeamLink({ team, season, path = false }) {
  return <Link className="inline-flex items-center gap-2 font-semibold hover:text-accent whitespace-nowrap" to={path ? `/playoffs/${team.abbrName}?season=${season}` : `/teams/${team.abbrName}?season=${seasonNumber(season)}`} ><TeamLogo abbr={team.abbrName} size={20} />{team.displayName}</Link>
}

export function Calibration({ season }) {
  const [open, setOpen] = useState(false)
  const sorter = useSorter({ key: 'Bucket', asc: true })
  const { data, loading, error } = useLoad(open ? `playoffs-calibration-${season}` : null, () => getPlayoffCalibration(season))
  const spec = data && {
    name: 'Elo accuracy check', qualifier: seasonLabel(season), rows: sorter.apply(data.buckets, { Bucket: r => r.low, Games: r => r.games, Predicted: r => r.predicted, Actual: r => r.actual }),
    description: `Home-team win probability vs actual home win rate. Brier score ${data.brier}; coin flip ${data.coinFlipBrier}; ${data.games} games. Lower Brier is better.`,
    cols: [
      { label: 'Bucket', desc: 'Home win probability range.', text: r => `${Math.round(r.low * 100)}–${Math.round(r.high * 100)}%` },
      { label: 'Games', desc: 'Completed games in the bucket.', text: r => String(r.games), value: r => r.games, z: '0' },
      ...['predicted', 'actual'].map(key => ({ label: key === 'predicted' ? 'Predicted' : 'Actual', desc: key === 'predicted' ? 'Average predicted home win probability.' : 'Actual home win rate; ties count half.', text: r => `${Math.round(r[key] * 100)}%`, value: r => r[key], z: '0%' })),
    ], api: { path: '/playoffs/calibration', params: { season }, fields: { Bucket: 'low, high', Games: 'games', Predicted: 'predicted', Actual: 'actual' } },
  }
  return <details className="border-t border-line pt-3 mt-8" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">How accurate are these probabilities?</summary>
    <p className="text-sm text-muted my-3">Do teams given a 70% chance to win actually win about 70% of the time? This checks Elo game predictions against completed regular-season results, rather than testing simulated playoff outcomes.</p>
    {loading && <p>Loading…</p>}{error && <p className="text-muted">Accuracy check unavailable.</p>}
    {data && <><p className="text-sm mb-3">{data.games.toLocaleString()} games · Brier score: {data.brier?.toFixed(3) ?? '—'} vs a coin flip: {data.coinFlipBrier?.toFixed(3) ?? '—'}. Lower is better; zero is perfect.</p><ExportMenu spec={spec} /><table aria-label="Calibration buckets" className="w-full text-sm"><thead><tr>{spec.cols.map(c => <SortTh key={c.label} tip={c.desc} sortKey={c.label} state={sorter.sort} onSort={sorter.click}>{c.label}</SortTh>)}</tr></thead><tbody>{spec.rows.map((r, i) => <tr key={r.low} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>{spec.cols.map(c => <td className="px-2 py-1.5 num" key={c.label}>{c.text(r)}</td>)}</tr>)}</tbody></table></>}
  </details>
}

const TITLE_COLS = [
  ['final', 'Conf. title', 'Chance of winning the conference and reaching the final.'],
  ['champion', 'Title', 'Chance of winning the championship.'],
]
const PREPLAYOFF = 'Ratings are frozen at the end of the regular season. This is the pre-playoff projection, rather than a forecast updated during the postseason.'

function ConferenceProbability({ conference, data, clinch, championship }) {
  const sorter = useSorter({ key: 'playoffs', asc: false })
  const getters = {
    team: r => r.team.displayName,
    record: r => (r.wins + (r.ties ?? 0) / 2) / (r.wins + r.losses + (r.ties ?? 0) || 1),
    ...Object.fromEntries(GOALS.map(g => [g.value, r => markerValue(r.odds[g.value], r.markers?.[g.value])])),
    ...Object.fromEntries(TITLE_COLS.map(([key]) => [key, r => r.title?.[key]])),
    seeds: r => r.seedOdds.reduce((sum, p, i) => sum + p * (8 - i), 0),
  }
  const rows = sorter.apply(conference.teams.map(r => ({ ...r, markers: teamMarker(clinch, r.team.teamId), title: championship?.teams.find(t => t.team.teamId === r.team.teamId) })), getters)
  const goalCols = GOALS.map(g => ({ key: g.value, label: g.label, desc: `Chance of ${g.value === 'playoffs' ? 'making the playoffs. Green is high; red is low' : g.value === 'division' ? 'winning the division' : 'earning the No. 1 seed'}.`, text: r => markerOdds(r.odds[g.value], r.markers?.[g.value]), value: getters[g.value], z: '0%', color: r => (g.value === 'playoffs' ? probShade : chanceShade)(getters[g.value](r)) }))
  const titleCols = [...TITLE_COLS, ['round2', 'Reach round 2', 'Chance of reaching round 2, including a first-round bye.'], ['conferenceFinal', 'Conference final', 'Chance of reaching the conference final.']].map(([key, label, desc]) => ({ key, label, desc, text: r => formatOdds(r.title?.[key]), value: r => r.title?.[key], z: '0%', color: r => chanceShade(r.title?.[key]) }))
  const spec = {
    name: `${conference.name} playoff probability`, qualifier: seasonLabel(data.season), rows,
    description: 'Simulated playoff, division, No. 1 seed, conference title and championship chances.',
    notes: [`${data.simulations.toLocaleString()} simulations, computed ${formatComputed(data.computedAt)}. Elo and home field determine game probabilities; ratings stay fixed within each simulation, with no simulated ties.`, ...(championship?.preplayoff ? [PREPLAYOFF] : [])],
    cols: [
      { label: 'Team', desc: 'Team name.', text: r => r.team.displayName, logo: r => r.team.abbrName },
      { label: 'Record', desc: 'Completed regular-season record.', text: recordText },
      ...goalCols, ...titleCols,
      ...Array.from({ length: 7 }, (_, i) => ({ label: `Seed ${i + 1}`, desc: `Chance of finishing as seed ${i + 1}.`, text: r => formatOdds(r.seedOdds[i]), value: r => r.seedOdds[i], z: '0%' })),
    ],
    api: { path: '/playoffs/odds', params: { season: data.season, rules: data.rules }, note: `${conference.name}; sorted by ${sorter.sort.key} ${sorter.sort.asc ? 'ascending' : 'descending'}. Title columns come from GET /api/playoffs/championship with the same season and rules.`, fields: { Team: 'team.displayName', Record: 'wins-losses[-ties]', ...Object.fromEntries(GOALS.map(g => [g.label, `odds.${g.value}`])), ...Object.fromEntries(titleCols.map(c => [c.label, `/playoffs/championship teams[].${c.key}, matched by team.teamId`])), Seeds: 'seedOdds[0..6]' } },
  }
  const header = (key, label, tip) => <SortTh key={key} sortKey={key} tip={tip} state={sorter.sort} onSort={sorter.click} className={key === 'team' ? '!px-1' : 'text-right !px-1'}>{label}</SortTh>
  return <section aria-label={`${conference.name} probability`} className="min-w-0">
    <div className="flex justify-between flex-wrap gap-2 border-b-2 border-rule pb-2"><h2 className="font-display text-2xl font-bold">{conference.name}</h2><ExportMenu spec={spec} /></div>
    <div className="overflow-x-auto"><table className="w-full text-sm whitespace-nowrap" aria-label={`${conference.name} playoff probability`}>
      <thead><tr>
        {header('team', 'Team', 'Team and proven clinch or elimination status.')}
        {header('record', 'Record', 'Regular-season record; sorts by winning percentage.')}
        {goalCols.map(c => header(c.key, c.label, c.desc))}
        {TITLE_COLS.map(([key, label, tip]) => header(key, <>{label}{key === 'champion' && championship?.preplayoff && <span className="block rounded border border-line px-1 text-[10px] normal-case font-normal">Pre-playoff projection</span>}</>, `${tip}${key === 'champion' && championship?.preplayoff ? ` ${PREPLAYOFF}` : ''}`))}
        {header('seeds', 'Seeds', 'Chances of seeds 1–7. Sorts by seed strength, weighted toward higher seeds; missing the field counts zero.')}
      </tr></thead>
      <tbody>{rows.map((r, i) => <tr key={r.team.teamId} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
        <td className="px-1 py-1.5"><span className="inline-flex items-center gap-1.5"><TeamLink team={r.team} season={data.season} /><ClinchBadge markers={r.markers} compact /></span></td>
        <td className="px-1 num text-right">{recordText(r)}</td>
        {goalCols.map(c => <td key={c.key} className="px-1 num text-right" style={{ background: c.color(r) }}>{c.text(r)}</td>)}
        {titleCols.slice(0, 2).map(c => <td key={c.key} className="px-1 num text-right" style={{ background: c.color(r) }}><InfoTip text={`Reach round 2: ${formatOdds(r.title?.round2)}; conference final: ${formatOdds(r.title?.conferenceFinal)}.`}><span tabIndex={0}>{c.text(r)}</span></InfoTip></td>)}
        <td className="px-1"><SeedBar seedOdds={r.seedOdds} size={52} /></td>
      </tr>)}</tbody>
    </table></div>
  </section>
}

export default function OddsTab({ season, rules }) {
  const [view, setView] = useState('table')
  const clinch = useClinch(season, rules)
  const { data, loading, error, retry } = usePlayoffLoad(season == null ? null : `playoffs-odds-${season}-${rules}`, () => getPlayoffOdds(season, 'madden'))
  const championship = usePlayoffLoad(season == null ? null : `playoffs-championship-${season}-${rules}`, () => getPlayoffChampionship(season, 'madden'))
  if (loading) return <p className="text-muted">Loading…</p>
  if (error) return <PlayoffError error={error} retry={retry}>Could not load playoff probability.</PlayoffError>
  if (!data?.conferences?.some(c => c.teams.length)) return <p className="text-muted">No playoff probability available.</p>
  return <>
    <div className="flex border border-line rounded overflow-hidden w-fit mb-2" role="group" aria-label="Probability view">
      {[['table', 'Table'], ['history', 'Over time']].map(([key, label]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)} className={`px-2 py-1 text-xs font-medium ${view === key ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}>{label}</button>)}
    </div>
    <p className="text-xs text-muted mb-2">{data.simulations.toLocaleString()} simulations · computed {formatComputed(data.computedAt)}</p>
    {view === 'history' ? <OddsHistory key={data.season} season={data.season} currentTeams={data.conferences.flatMap(c => c.teams)} /> : <>
      {championship.error && <p className="text-xs text-muted mb-2">Title probabilities unavailable. Playoff probabilities are shown below.</p>}
      <SeedLegend />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{data.conferences.map(conference => <ConferenceProbability key={conference.name} conference={conference} data={data} clinch={clinch} championship={championship.data} />)}</div>
    </>}
    <Calibration season={data.season} />
  </>
}
