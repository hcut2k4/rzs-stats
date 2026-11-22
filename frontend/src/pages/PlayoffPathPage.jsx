import PlayoffError from '../components/playoffs/PlayoffError'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getPlayoffPath, getPlayoffRemaining } from '../api/client'
import { usePlayoffLoad } from '../utils/usePlayoffLoad'
import { formatOdds, GOALS } from '../utils/playoffOdds'
import { pathScenario } from '../utils/playoffScenario'
import { recordText } from '../utils/teamProfile'
import { seasonLabel } from '../utils/seasons'
import PageHeader from '../components/PageHeader'
import ExportMenu from '../components/ExportMenu'
import { TeamLogo } from '../components/TeamLogo'
import ClinchBadge, { markerOdds } from '../components/playoffs/ClinchBadge'

function PathTable({ title, rows, cols, data, notes = [] }) {
  const spec = { name: `${data.team.displayName} — ${title}`, qualifier: `${seasonLabel(data.season)} · ${data.rules} rules`, description: title, rows, cols, notes, api: { path: `/playoffs/path/${data.team.abbrName}`, params: { season: data.season, rules: data.rules }, fields: Object.fromEntries(cols.map(c => [c.label, c.desc])) } }
  return <section aria-label={title}><div className="flex justify-between flex-wrap gap-2 mb-3"><h2 className="font-display text-2xl font-bold">{title}</h2><ExportMenu spec={spec} /></div>{notes.map(note => <p key={note} className="text-sm text-muted mb-3">{note}</p>)}{rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm" aria-label={title}><thead><tr>{cols.map(c => <th className="th text-left whitespace-nowrap" key={c.label}>{c.label}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr className="border-t border-line" key={i}>{cols.map(c => <td className="p-2 num" key={c.label}>{c.render ? c.render(r) : c.text(r)}</td>)}</tr>)}</tbody></table></div> : <p className="text-muted text-sm">No games with a meaningful swing listed.</p>}</section>
}
const scenarioCols = [
  { label: 'Goal', desc: 'Postseason goal.', text: r => r.label },
  { label: 'Status', desc: 'in: secured; out: impossible; open: unresolved.', text: r => r.status },
  ...[['clinchedBy', 'We clinch with ...'], ['eliminatedBy', 'We are eliminated if ...']].map(([key, label]) => ({
    label, desc: `Sufficient game results; scenarios.goals[].${key}[].text.`,
    text: r => r[key].map(entry => entry.text).join('; '),
    render: r => r[key].length ? <ul className="list-disc pl-4 space-y-1">{r[key].map(entry => <li key={entry.text}>{entry.text}</li>)}</ul> : '—',
  })),
]
const chanceCol = (key, label) => ({ label, desc: `Probability of ${label}; ${key}.`, text: r => formatOdds(r[key]), value: r => r[key], z: '0%' })
const rootCols = [
  { label: 'Game', desc: 'Away team at home team.', text: r => `${r.away.abbrName} @ ${r.home.abbrName}` },
  { label: 'Root for', desc: 'The side whose result helps this team; rootFor.', text: r => r.rootFor === 'tie' ? 'Tie' : r[r.rootFor].displayName },
  { label: 'Swing', desc: 'Magnitude of playoff probability change in percentage points; swing.', text: r => `${Math.round(Math.abs(r.swing) * 100)} pp`, value: r => Math.abs(r.swing) * 100, z: '0" pp"' },
]
export default function PlayoffPathPage() {
  const { abbr } = useParams()
  const [params] = useSearchParams()
  const value = params.get('season')
  const season = value != null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined
  const rules = params.get('rules') === 'nfl' ? 'nfl' : 'madden'
  const path = usePlayoffLoad(`playoffs-path-${abbr.toUpperCase()}-${season ?? 'current'}-${rules}`, () => getPlayoffPath(abbr.toUpperCase(), season, rules))
  const data = path.data
  const remaining = usePlayoffLoad(data ? `playoffs-remaining-${data.season}` : null, () => getPlayoffRemaining(data.season))
  if (path.loading) return <p className="text-muted">Loading path to the playoffs…</p>
  if (path.error || !data) return <><PageHeader title="Path to the playoffs" /><PlayoffError error={path.error} retry={path.retry}>No playoff path available for this team or season. Check the team abbreviation or try again later.</PlayoffError><Link className="text-accent" to="/playoffs">Back to Playoffs</Link></>
  return <div className="space-y-8">
    <header><PageHeader title={<span className="inline-flex gap-3 items-center"><TeamLogo abbr={data.team.abbrName} />{data.team.displayName}: Path to the playoffs</span>} qualifier={`${seasonLabel(data.season)} · ${recordText(data)} · ${rules} rules`} /><ClinchBadge markers={data.markers} /></header>
    {data.scenarios != null && <PathTable title="Final-week scenarios" data={data} notes={[data.scenarios.assumes]} rows={GOALS.map(g => ({ ...g, ...data.scenarios.goals[g.value] }))} cols={scenarioCols} />}
    <section><h2 className="font-display text-2xl font-bold mb-3">Do we control our destiny?</h2><p>{data.winOut.controlsDestiny ? 'Yes: winning out is proven to get us in' : `Not guaranteed: winning out still leaves ${formatOdds(data.winOut.playoffs)} playoff odds (we can still miss; a playoff spot is not proven).`}</p><p className="text-sm text-muted mt-2">If we win out: {GOALS.map(g => `${g.label} ${markerOdds(data.winOut[g.value], data.markers?.[g.value])}`).join(' · ')}</p></section>
    <section><h2 className="font-display text-2xl font-bold mb-3">What's our ceiling?</h2><p>{data.ceiling.bestSeed == null ? 'No playoff seed remains in these simulations.' : `Best simulated seed: No. ${data.ceiling.bestSeed}`}</p></section>
    <PathTable title="Seed distribution" data={data} rows={data.ceiling.seedOdds.map((chance, i) => ({ seed: i + 1, chance }))} cols={[{ label: 'Seed', desc: 'Playoff seed, 1–7.', text: r => String(r.seed), value: r => r.seed, z: '0' }, chanceCol('chance', 'Chance')]} />
    <PathTable title="How many wins do we need?" data={data} rows={data.winsNeeded} cols={[{ label: 'Final record', desc: 'Final regular-season record; record.', text: r => r.record }, chanceCol('chance', 'Chance of record'), ...GOALS.map(g => chanceCol(g.value, g.label))]} />
    <PathTable title="If we win out, what can still go wrong" data={data} rows={data.winOutRisks} cols={rootCols} />
    <PathTable title="Root for this week" data={data} rows={data.rootThisWeek} cols={rootCols} />
    {remaining.loading && <p className="text-muted">Loading win-out scenario…</p>}{remaining.error && <PlayoffError error={remaining.error} retry={remaining.retry}>Could not load the remaining schedule for What-If.</PlayoffError>}{remaining.data && <Link className="inline-block field text-accent" to={pathScenario(data, remaining.data.games)}>Load win out + helpful results into What-If</Link>}
  </div>
}
