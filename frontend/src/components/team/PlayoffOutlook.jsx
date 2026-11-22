import { Link } from 'react-router-dom'
import { getPlayoffOdds, getPlayoffLeverage } from '../../api/client'
import { useLoad } from '../../utils/useLoad'
import { GOALS, formatOdds, swingPoints } from '../../utils/playoffOdds'
import { seasonLabel } from '../../utils/seasons'
import { weekName } from '../../utils/playoffRounds'
import ExportMenu from '../ExportMenu'
import Section from './Section'

export default function PlayoffOutlook({ teamId, season, nextWeek }) {
  const odds = useLoad(`playoffs-odds-${season}-madden`, async () => getPlayoffOdds(season, 'madden'))
  const row = odds.data?.conferences?.flatMap(c => c.teams).find(r => r.team.teamId === teamId)
  const leverage = useLoad(row && nextWeek != null ? `playoffs-leverage-${season}-madden-${nextWeek}` : null, async () => getPlayoffLeverage(season, nextWeek, 'madden'))
  if (!row) return null
  const game = leverage.data?.games?.find(g => g.teams.some(t => t.team.teamId === teamId))
  const next = game?.teams.find(t => t.team.teamId === teamId)
  const opp = next && (next.side === 'home' ? game.away : game.home)
  const rows = GOALS.map(g => ({ ...g, current: row.odds[g.value], ...(next ? { loss: next.ifLoss[g.value], win: next.ifWin[g.value], swing: swingPoints(next, g.value) } : {}) }))
  const spec = {
    name: `${row.team.displayName} playoff outlook`, qualifier: `${seasonLabel(odds.data.season)} · Madden 27 rules`, rows,
    description: 'Current playoff odds, with the next game’s win and loss scenarios when available.',
    cols: [
      { label: 'Goal', desc: 'Postseason outcome.', text: r => r.label },
      ...[['current', 'Current'], ...(next ? [['loss', 'If lose'], ['win', 'If win']] : [])].map(([key, label]) => ({ label, desc: `${label} probability.`, text: r => formatOdds(r[key]), value: r => r[key], z: '0%' })),
      ...(next ? [{ label: 'Swing', desc: 'Win minus loss odds, in percentage points.', text: r => `${Math.round(r.swing)} pp`, value: r => r.swing, z: '0" pp"' }] : []),
    ], api: { path: '/playoffs/odds', params: { season: odds.data.season, rules: odds.data.rules }, fields: { Current: 'odds.playoffs, odds.division, odds.oneSeed' }, note: next ? `Scenarios from GET /api/playoffs/leverage?season=${leverage.data.season}&week=${leverage.data.week}&rules=${leverage.data.rules}, teams[].ifLoss and ifWin; swing=(ifWin-ifLoss)×100.` : 'This team only.' },
  }
  return <Section id="playoff-outlook" title="Playoff outlook" kicker="Postseason chances" actions={<ExportMenu spec={spec} />}>
    {next && <p className="text-sm text-muted mb-3">Next game: {weekName(leverage.data.week)} · {next.side === 'home' ? 'vs' : '@'} {opp.displayName}</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm" aria-label="Playoff outlook"><thead><tr>{spec.cols.map(c => <th className="th text-left" key={c.label}>{c.label}</th>)}</tr></thead><tbody>{rows.map(r => <tr className="border-t border-line" key={r.value}>{spec.cols.map(c => <td className="px-2 py-2 num" key={c.label}>{c.text(r)}</td>)}</tr>)}</tbody></table></div>
    <Link className="inline-block mt-3 text-sm text-accent hover:underline" to={`/playoffs?tab=leverage&rules=madden&season=${season}${nextWeek != null ? `&week=${nextWeek}` : ''}`}>See playoff leverage →</Link>
  </Section>
}
