import { getPlayoffChampionship } from '../../api/client'
import { useLoad } from '../../utils/useLoad'
import { formatOdds } from '../../utils/playoffOdds'
import { seasonLabel } from '../../utils/seasons'
import ExportMenu from '../ExportMenu'
import { TeamLink } from './OddsTab'

const ROUNDS = [
  ['playoffs', 'Make playoffs'], ['round2', 'Reach round 2'],
  ['conferenceFinal', 'Conference final'], ['final', 'Final'], ['champion', 'Champion'],
]
const NOTE = 'Each simulation plays out a seven-seed bracket per conference. Seed 1 gets a bye; the better remaining seed hosts the lower seed. Games use Elo with home field, except the neutral-site final. Ratings stay fixed and games have no ties.'

export default function ChampionshipOdds({ season, rules }) {
  const { data, loading, error } = useLoad(`playoffs-championship-${season}-${rules}`, async () => getPlayoffChampionship(season, rules))
  const rows = data?.teams?.slice().sort((a, b) => b.champion - a.champion) ?? []
  const spec = data && {
    name: 'Championship odds', qualifier: `${seasonLabel(data.season)} · ${data.rules} rules`, rows,
    description: 'Chance of reaching each playoff round and winning the title.', notes: [NOTE],
    cols: [
      { label: 'Team', desc: 'Team name.', text: r => r.team.displayName, logo: r => r.team.abbrName },
      { label: 'Conference', desc: 'Conference the team plays in.', text: r => r.conference },
      ...ROUNDS.map(([key, label]) => ({ label, desc: `Probability of ${key === 'champion' ? 'winning the championship' : label.toLowerCase()}.`, text: r => formatOdds(r[key]), value: r => r[key], z: '0%' })),
    ], api: { path: '/playoffs/championship', params: { season: data.season, rules: data.rules }, note: 'Champion odds descending.', fields: { Team: 'team.displayName', Conference: 'conference', ...Object.fromEntries(ROUNDS.map(([key, label]) => [label, key])) } },
  }
  return <section aria-label="Championship odds" className="mt-8 min-w-0">
    <div className="flex flex-wrap justify-between gap-2 border-b-2 border-rule pb-2"><h2 className="font-display text-2xl font-bold">Championship odds</h2>{rows.length > 0 && <ExportMenu spec={spec} />}</div>
    <p className="text-sm text-muted my-3">{NOTE}</p>
    {loading && <p className="text-muted">Loading…</p>}
    {error && <p className="text-muted">Championship odds unavailable.</p>}
    {!loading && !error && !rows.length && <p className="text-muted">No championship odds available.</p>}
    {rows.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm" aria-label="Championship odds"><thead><tr>{spec.cols.map(c => <th className="th whitespace-nowrap text-right first:text-left" key={c.label} title={c.desc}>{c.label}</th>)}</tr></thead><tbody>{rows.map(r => <tr className="border-t border-line" key={r.team.teamId}><td className="py-3 pr-2"><TeamLink team={r.team} season={data.season} /></td><td className="px-2 text-right">{r.conference}</td>{ROUNDS.map(([key]) => <td key={key} className="px-2 num text-right">{formatOdds(r[key])}</td>)}</tr>)}</tbody></table></div>}
  </section>
}
