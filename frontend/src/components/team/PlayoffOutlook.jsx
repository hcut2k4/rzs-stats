import PlayoffError from '../playoffs/PlayoffError'
import ClinchBadge, { useClinch, teamMarker, markerOdds, markerValue } from '../playoffs/ClinchBadge'
import { Link, useNavigate } from 'react-router-dom'
import { getPlayoffOdds, getPlayoffLeverage, getPlayoffChampionship, getPlayoffOddsHistory } from '../../api/client'
import { usePlayoffLoad } from '../../utils/usePlayoffLoad'
import { GOALS, formatOdds, swingPoints } from '../../utils/playoffOdds'
import { seasonLabel } from '../../utils/seasons'
import { weekLabel, weekName } from '../../utils/playoffRounds'
import ExportMenu from '../ExportMenu'
import Section from './Section'

export default function PlayoffOutlook({ teamId, season, nextWeek }) {
  const navigate = useNavigate()
  const clinch = useClinch(season, 'madden')
  const markers = teamMarker(clinch, teamId)
  const odds = usePlayoffLoad(`playoffs-odds-${season}-madden`, async () => getPlayoffOdds(season, 'madden'))
  const row = odds.data?.conferences?.flatMap(c => c.teams).find(r => r.team.teamId === teamId)
  const leverage = usePlayoffLoad(row && nextWeek != null ? `playoffs-leverage-${season}-madden-${nextWeek}` : null, async () => getPlayoffLeverage(season, nextWeek, 'madden'))
  const championship = usePlayoffLoad(row ? `playoffs-championship-${season}-madden` : null, async () => getPlayoffChampionship(season, 'madden'))
  const history = usePlayoffLoad(row ? `playoffs-history-${season}` : null, async () => getPlayoffOddsHistory(season))
  const title = championship.data?.teams?.find(r => r.team.teamId === teamId)
  const snapshots = history.data?.snapshots?.slice().sort((a, b) => (a.week ?? Infinity) - (b.week ?? Infinity)) ?? []
  const points = snapshots.map(s => ({ week: s.week, p: s.teams.find(r => r.team.teamId === teamId)?.playoffs })).filter(s => s.p != null)
  if (odds.error?.response?.status === 404) return null
  if (odds.error) return <Section id="playoff-outlook" title="Playoff outlook"><PlayoffError error={odds.error} retry={odds.retry}>Playoff probability unavailable.</PlayoffError></Section>
  if (!row) return null
  const game = leverage.data?.games?.find(g => g.teams.some(t => t.team.teamId === teamId))
  const next = game?.teams.find(t => t.team.teamId === teamId)
  const opp = next && (next.side === 'home' ? game.away : game.home)
  const rows = GOALS.map(g => ({ ...g, current: row.odds[g.value], ...(next ? { loss: next.ifLoss[g.value], win: next.ifWin[g.value], swing: swingPoints(next, g.value) } : {}) }))
  const spec = {
    name: `${row.team.displayName} playoff outlook`, qualifier: `${seasonLabel(odds.data.season)}`, rows,
    description: 'Current playoff probability, with the next game’s win and loss scenarios when available.',
    cols: [
      { label: 'Goal', desc: 'Postseason outcome.', text: r => r.label },
      ...[['current', 'Current'], ...(next ? [['loss', 'If lose'], ['win', 'If win']] : [])].map(([key, label]) => ({ label, desc: `${label} probability.`, text: r => key === 'current' ? markerOdds(r[key], markers?.[r.value]) : formatOdds(r[key]), value: r => key === 'current' ? markerValue(r[key], markers?.[r.value]) : r[key], z: '0%' })),
      ...(next ? [{ label: 'Swing', desc: 'Win minus loss probability, in percentage points.', text: r => `${Math.round(r.swing)} pp`, value: r => r.swing, z: '0" pp"' }] : []),
    ], api: { path: '/playoffs/odds', params: { season: odds.data.season, rules: odds.data.rules }, fields: { Current: 'odds.playoffs, odds.division, odds.oneSeed' }, note: next ? `Scenarios from GET /api/playoffs/leverage?season=${leverage.data.season}&week=${leverage.data.week}&rules=${leverage.data.rules}, teams[].ifLoss and ifWin; swing=(ifWin-ifLoss)×100.` : 'This team only.' },
  }
  return <Section id="playoff-outlook" title="Playoff outlook" kicker="Postseason chances" actions={<ExportMenu spec={spec} />}>
    <ClinchBadge markers={markers} />
    {[leverage, championship, history].filter(load => load.error).map((load, i) => <PlayoffError key={i} error={load.error} retry={load.retry}>Playoff data unavailable.</PlayoffError>)}
    {title?.champion != null && <p className="text-sm font-semibold my-2">Title probability {formatOdds(title.champion)}</p>}
    {points.length >= 2 && <svg className="text-accent my-2" width="160" height="36" viewBox="0 0 160 36" role="img" aria-label={`Playoff probability went from ${Math.round(points[0].p * 100)}% to ${Math.round(points.at(-1).p * 100)}% over ${points.length} weeks`}>
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points.map((s, i) => `${3 + i / Math.max(1, points.length - 1) * 154},${33 - s.p * 30}`).join(' ')} />
    </svg>}
    {points.length >= 2 && <details className="my-2"><summary className="cursor-pointer text-sm">Show data table</summary><ExportMenu spec={{ name: `${row.team.displayName} playoff probability history`, qualifier: seasonLabel(odds.data.season), rows: points, cols: [
      { label: 'Week', desc: 'Saved snapshot week.', text: r => r.week == null ? 'Final' : weekLabel(1, r.week) },
      { label: row.team.abbrName, desc: 'Playoff probability.', text: r => `${Math.round(r.p * 100)}%`, value: r => r.p, z: '0%' },
    ], api: { path: '/playoffs/odds/history', params: { season: history.data.season }, fields: { Week: 'snapshots[].week', Probability: 'snapshots[].teams[].playoffs' } } }} /><table className="w-full text-sm" aria-label="Playoff outlook history data"><thead><tr><th className="th text-left">Week</th><th className="th text-left">{row.team.abbrName}</th></tr></thead><tbody>{points.map((point, i) => <tr className="border-t border-line" key={i}><td className="p-2">{point.week == null ? 'Final' : weekLabel(1, point.week)}</td><td className="p-2 num">{Math.round(point.p * 100)}%</td></tr>)}</tbody></table></details>}
    <button className="block text-sm text-accent hover:underline my-2" onClick={() => navigate(`/playoffs/${row.team.abbrName}?season=${season}`)}>Path to the playoffs →</button>
    {next && <p className="text-sm text-muted mb-3">Next game: {weekName(leverage.data.week)} · {next.side === 'home' ? 'vs' : '@'} {opp.displayName}</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm" aria-label="Playoff outlook"><thead><tr>{spec.cols.map(c => <th className="th text-left" key={c.label}>{c.label}</th>)}</tr></thead><tbody>{rows.map(r => <tr className="border-t border-line" key={r.value}>{spec.cols.map(c => <td className="px-2 py-2 num" key={c.label}>{c.text(r)}</td>)}</tr>)}</tbody></table></div>
    <Link className="inline-block mt-3 text-sm text-accent hover:underline" to={`/playoffs?tab=leverage&season=${season}${nextWeek != null ? `&week=${nextWeek}` : ''}`}>See playoff leverage →</Link>
  </Section>
}
