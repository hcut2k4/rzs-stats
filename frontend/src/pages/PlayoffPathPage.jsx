import PlayoffError from '../components/playoffs/PlayoffError'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getPlayoffPath, getPlayoffRemaining } from '../api/client'
import { usePlayoffLoad } from '../utils/usePlayoffLoad'
import { formatOdds, GOALS, probShade, chanceShade, swingShade } from '../utils/playoffOdds'
import { pathScenario } from '../utils/playoffScenario'
import { recordText } from '../utils/teamProfile'
import { seasonLabel } from '../utils/seasons'
import PageHeader from '../components/PageHeader'
import ExportMenu from '../components/ExportMenu'
import PlayoffDataTable from '../components/team/PlayoffDataTable'
import { TeamLogo } from '../components/TeamLogo'
import ClinchBadge, { markerOdds } from '../components/playoffs/ClinchBadge'

function PathTable({ title, rows, cols, data, notes = [] }) {
  const spec = { name: `${data.team.displayName} — ${title}`, qualifier: `${seasonLabel(data.season)}`, description: title, rows, cols, notes, api: { path: `/playoffs/path/${data.team.abbrName}`, params: { season: data.season, rules: data.rules }, fields: Object.fromEntries(cols.map(c => [c.label, c.desc])) } }
  return <section aria-label={title}><h2 className="font-display font-bold uppercase text-xl leading-none mb-2">{title}</h2>{notes.map(note => <p key={note} className="text-sm text-muted mb-2">{note}</p>)}{rows.length ? <PlayoffDataTable title={title} spec={spec} /> : <div className="flex items-center justify-between flex-wrap gap-2"><p className="text-muted text-sm">No games with a meaningful swing listed.</p><ExportMenu spec={spec} /></div>}</section>
}
const scenarioCols = [
  { label: 'Goal', desc: 'Postseason goal.', text: r => r.label },
  { label: 'Status', desc: 'in: secured; out: impossible; open: unresolved.', text: r => r.status },
  ...[['clinchedBy', 'We clinch with ...'], ['eliminatedBy', 'We are eliminated if ...']].map(([key, label]) => ({
    label, desc: `Sufficient game results; scenarios.goals[].${key}[].text.`,
    text: r => r[key].map(entry => entry.text).join('; '),
    render: r => r[key].length ? r[key].map(entry => entry.text).join('; ') : '—',
  })),
]
const chanceCol = (key, label) => ({ label, desc: `Probability of ${label}; ${key}.`, text: r => formatOdds(r[key]), value: r => r[key], z: '0%', color: r => (key === 'playoffs' ? probShade : chanceShade)(r[key]) })
const rootCols = [
  { label: 'Game', desc: 'Away team at home team.', text: r => `${r.away.abbrName} @ ${r.home.abbrName}`, render: r => <span className="inline-flex items-center gap-1.5"><TeamLogo abbr={r.away.abbrName} size={20} />{r.away.abbrName} @ <TeamLogo abbr={r.home.abbrName} size={20} />{r.home.abbrName}</span> },
  { label: 'Root for', desc: 'The side whose result helps this team; rootFor.', text: r => r.rootFor === 'tie' ? 'Tie' : r[r.rootFor].displayName, render: r => r.rootFor === 'tie' ? 'Tie' : <span className="inline-flex items-center gap-1.5"><TeamLogo abbr={r[r.rootFor].abbrName} size={20} />{r[r.rootFor].displayName}</span>, logo: r => r.rootFor === 'tie' ? null : r[r.rootFor].abbrName },
  { label: 'Swing', desc: 'Magnitude of playoff probability change in percentage points; swing.', text: r => `${Math.round(Math.abs(r.swing) * 100)} pp`, value: r => Math.abs(r.swing) * 100, z: '0" pp"', color: r => swingShade(r.swing * 100) },
]
export default function PlayoffPathPage() {
  const { abbr } = useParams()
  const [params] = useSearchParams()
  const value = params.get('season')
  const season = value != null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined
  const rules = 'madden'
  const path = usePlayoffLoad(`playoffs-path-${abbr.toUpperCase()}-${season ?? 'current'}-${rules}`, () => getPlayoffPath(abbr.toUpperCase(), season, 'madden'))
  const data = path.data
  const remaining = usePlayoffLoad(data ? `playoffs-remaining-${data.season}` : null, () => getPlayoffRemaining(data.season))
  if (path.loading) return <p className="text-muted">Loading path to the playoffs…</p>
  if (path.error || !data) return <><PageHeader title="Path to the playoffs" /><PlayoffError error={path.error} retry={path.retry}>No playoff path available for this team or season. Check the team abbreviation or try again later.</PlayoffError><Link className="text-accent" to="/playoffs">Back to Playoffs</Link></>
  return <div className="space-y-5">
    <header><PageHeader title={<span className="inline-flex gap-3 items-center"><TeamLogo abbr={data.team.abbrName} />{data.team.displayName}: Path to the playoffs</span>} qualifier={`${seasonLabel(data.season)} · ${recordText(data)}`} /><ClinchBadge markers={data.markers} /></header>
    {data.scenarios != null && <PathTable title="Final-week scenarios" data={data} notes={[data.scenarios.assumes]} rows={GOALS.map(g => ({ ...g, ...data.scenarios.goals[g.value] }))} cols={scenarioCols} />}
    <section><h2 className="font-display font-bold uppercase text-xl leading-none mb-3">Do we control our destiny?</h2><p>{data.winOut.controlsDestiny ? 'Yes: winning out is proven to get us in' : `Not guaranteed: winning out still leaves ${formatOdds(data.winOut.playoffs)} playoff probability (we can still miss; a playoff spot is not proven).`}</p><p className="text-sm text-muted mt-2">If we win out: {GOALS.map(g => `${g.label} ${markerOdds(data.winOut[g.value], data.markers?.[g.value])}`).join(' · ')}</p></section>
    <section><h2 className="font-display font-bold uppercase text-xl leading-none mb-3">What's our ceiling?</h2><p>{data.ceiling.bestSeed == null ? 'No playoff seed remains in these simulations.' : `Best simulated seed: No. ${data.ceiling.bestSeed}`}</p></section>
    <PathTable title="Seed distribution" data={data} rows={data.ceiling.seedOdds.map((chance, i) => ({ seed: i + 1, chance }))} cols={[{ label: 'Seed', desc: 'Playoff seed, 1–7.', text: r => String(r.seed), value: r => r.seed, z: '0' }, chanceCol('chance', 'Chance')]} />
    <PathTable title="How many wins do we need?" data={data} rows={data.winsNeeded} cols={[{ label: 'Final record', desc: 'Final regular-season record; record.', text: r => r.record, sort: r => r.finalWins }, chanceCol('chance', 'Chance of record'), ...GOALS.map(g => chanceCol(g.value, g.label))]} />
    {!data.winOutRisks.length && !data.rootThisWeek.length
      ? <div className="flex items-center justify-between flex-wrap gap-2"><p className="text-sm text-muted">No games with a meaningful swing listed for winning out or rooting this week.</p><ExportMenu spec={{ name: `${data.team.displayName} — Games to watch`, qualifier: seasonLabel(data.season), description: 'Win-out risks and helpful results this week. Neither has games with a meaningful swing.', rows: [], cols: rootCols, api: { path: `/playoffs/path/${data.team.abbrName}`, params: { season: data.season, rules: data.rules }, fields: { Games: 'winOutRisks and rootThisWeek' } } }} /></div>
      : <><PathTable title="If we win out, what can still go wrong" data={data} rows={data.winOutRisks} cols={rootCols} /><PathTable title="Root for this week" data={data} rows={data.rootThisWeek} cols={rootCols} /></>}
    {remaining.loading && <p className="text-muted">Loading win-out scenario…</p>}{remaining.error && <PlayoffError error={remaining.error} retry={remaining.retry}>Could not load the remaining schedule for What-If.</PlayoffError>}{remaining.data && <Link className="inline-block field text-accent" to={pathScenario(data, remaining.data.games)}>Load win out + helpful results into What-If</Link>}
  </div>
}
