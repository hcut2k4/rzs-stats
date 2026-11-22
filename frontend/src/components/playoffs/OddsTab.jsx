import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getPlayoffOdds, getPlayoffCalibration } from '../../api/client'
import ExportMenu from '../ExportMenu'
import { TeamLogo } from '../TeamLogo'
import { useLoad } from '../../utils/useLoad'
import { formatOdds, GOALS } from '../../utils/playoffOdds'
import { seasonLabel, seasonNumber } from '../../utils/seasons'
import { recordText } from '../../utils/teamProfile'

export function TeamLink({ team, season }) {
  return <Link className="inline-flex items-center gap-2 font-semibold hover:text-accent whitespace-nowrap" to={`/teams/${team.abbrName}?season=${seasonNumber(season)}`}><TeamLogo abbr={team.abbrName} size={24} />{team.displayName}</Link>
}

export function Calibration({ season }) {
  const [open, setOpen] = useState(false)
  const { data, loading, error } = useLoad(open ? `playoffs-calibration-${season}` : null, () => getPlayoffCalibration(season))
  const spec = data && {
    name: 'Elo accuracy check', qualifier: seasonLabel(season), rows: data.buckets,
    description: `Home-team win probability vs actual home win rate. Brier score ${data.brier}; coin flip ${data.coinFlipBrier}; ${data.games} games. Lower Brier is better.`,
    cols: [
      { label: 'Bucket', desc: 'Home win probability range.', text: r => `${Math.round(r.low * 100)}–${Math.round(r.high * 100)}%` },
      { label: 'Games', desc: 'Completed games in the bucket.', text: r => String(r.games), value: r => r.games, z: '0' },
      ...['predicted', 'actual'].map(key => ({ label: key === 'predicted' ? 'Predicted' : 'Actual', desc: key === 'predicted' ? 'Average predicted home win probability.' : 'Actual home win rate; ties count half.', text: r => `${Math.round(r[key] * 100)}%`, value: r => r[key], z: '0%' })),
    ], api: { path: '/playoffs/calibration', params: { season }, fields: { Bucket: 'low, high', Games: 'games', Predicted: 'predicted', Actual: 'actual' } },
  }
  return <details className="border-t border-line pt-3 mt-8" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">How accurate are these odds?</summary>
    <p className="text-sm text-muted my-3">Do teams given a 70% chance to win actually win about 70% of the time? This checks Elo game predictions against completed regular-season results, rather than testing simulated playoff outcomes.</p>
    {loading && <p>Loading…</p>}{error && <p className="text-muted">Accuracy check unavailable.</p>}
    {data && <><p className="text-sm mb-3">{data.games.toLocaleString()} games · Brier score: {data.brier?.toFixed(3) ?? '—'} vs a coin flip: {data.coinFlipBrier?.toFixed(3) ?? '—'}. Lower is better; zero is perfect.</p><ExportMenu spec={spec} /><table aria-label="Calibration buckets" className="w-full text-sm"><thead><tr>{spec.cols.map(c => <th className="th text-left" key={c.label}>{c.label}</th>)}</tr></thead><tbody>{data.buckets.map(r => <tr key={r.low} className="border-t border-line">{spec.cols.map(c => <td className="px-2 py-2 num" key={c.label}>{c.text(r)}</td>)}</tr>)}</tbody></table></>}
  </details>
}

export default function OddsTab({ season, rules }) {
  const { data, loading, error } = useLoad(season == null ? null : `playoffs-odds-${season}-${rules}`, () => getPlayoffOdds(season, rules))
  if (loading) return <p className="text-muted">Loading…</p>
  if (error) return <p className="text-bad">Could not load playoff odds.</p>
  if (!data?.conferences?.some(c => c.teams.length)) return <p className="text-muted">No playoff odds available.</p>
  return <>
    <p className="text-sm text-muted mb-2">{data.simulations.toLocaleString()} simulations of the remaining games, computed {data.computedAt}</p>
    <p className="text-sm text-muted mb-6">Win probabilities come from Elo ratings and home field. They stay fixed within a simulated season; simulated games have no ties.</p>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">{data.conferences.map(c => {
      const rows = [...c.teams].sort((a, b) => b.odds.playoffs - a.odds.playoffs)
      const spec = {
        name: `${c.name} playoff odds`, qualifier: `${seasonLabel(data.season)} · ${data.rules} rules`, rows,
        description: 'Simulated chances of making the playoffs, winning the division and earning the No. 1 seed.',
        notes: [`${data.simulations.toLocaleString()} simulations of the remaining games, computed ${data.computedAt}. Elo win probabilities stay fixed within a simulated season; no simulated ties.`],
        cols: [
          { label: 'Team', desc: 'Team name.', text: r => r.team.displayName, logo: r => r.team.abbrName },
          { label: 'Record', desc: 'Completed regular-season record.', text: recordText },
          ...GOALS.map(g => ({ label: g.label, desc: `Probability of ${g.label}.`, text: r => formatOdds(r.odds[g.value]), value: r => r.odds[g.value], z: '0%' })),
          ...Array.from({ length: 7 }, (_, i) => ({ label: `Seed ${i + 1}`, desc: `Probability of finishing as seed ${i + 1}.`, text: r => formatOdds(r.seedOdds[i]), value: r => r.seedOdds[i], z: '0%' })),
        ], api: { path: '/playoffs/odds', params: { season: data.season, rules: data.rules }, note: `${c.name}; playoffs odds descending.`, fields: { Team: 'team.displayName', Record: 'wins-losses[-ties]', ...Object.fromEntries(GOALS.map(g => [g.label, `odds.${g.value}`])), Seeds: 'seedOdds[0..6]' } },
      }
      return <section key={c.name} aria-label={`${c.name} odds`} className="min-w-0"><div className="flex justify-between flex-wrap gap-2 border-b-2 border-rule pb-2"><h2 className="font-display text-2xl font-bold">{c.name}</h2><ExportMenu spec={spec} /></div>
        <div className="overflow-x-auto"><table className="w-full text-sm" aria-label={`${c.name} playoff odds`}><thead><tr><th className="th text-left">Team</th><th className="th">Record</th>{GOALS.map(g => <th className="th text-right whitespace-nowrap" key={g.value}>{g.label}</th>)}<th className="th">Seeds 1–7</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.team.teamId} className="border-t border-line"><td className="py-3 pr-2"><TeamLink team={r.team} season={data.season} /></td><td className="px-2 num whitespace-nowrap">{recordText(r)}</td>{GOALS.map(g => <td className="px-2 text-right num" key={g.value}>{formatOdds(r.odds[g.value])}</td>)}<td className="pl-3"><div className="flex w-28 h-3 bg-line overflow-hidden rounded" role="img" aria-label={r.seedOdds.map((p, i) => `Seed ${i + 1}: ${formatOdds(p)}`).join(', ')}>{r.seedOdds.map((p, i) => <span key={i} title={`Seed ${i + 1}: ${formatOdds(p)}`} style={{ width: `${p * 100}%`, background: `hsl(${215 + i * 18} 65% ${35 + i * 5}%)` }} />)}</div></td></tr>)}</tbody></table></div></section>
    })}</div><Calibration season={data.season} />
  </>
}
