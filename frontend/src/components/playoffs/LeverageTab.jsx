import { getPlayoffLeverage } from '../../api/client'
import { useLoad } from '../../utils/useLoad'
import { GOALS, LOSS, WIN, formatOdds, swingPoints } from '../../utils/playoffOdds'
import { seasonLabel } from '../../utils/seasons'
import { weekName } from '../../utils/playoffRounds'
import { leveragePanel } from '../../utils/chartImage'
import ExportMenu from '../ExportMenu'
import { TeamLogo } from '../TeamLogo'
import { TeamLink } from './OddsTab'

function Range({ row, goal, logo = false }) {
  const loss = row.ifLoss[goal] * 100, win = row.ifWin[goal] * 100
  return <div className="relative h-10 min-w-28" aria-label={`If lose ${formatOdds(row.ifLoss[goal])}, current ${formatOdds(row.current[goal])}, if win ${formatOdds(row.ifWin[goal])}`}>
    <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
    <div className="absolute top-1/2 h-1 -translate-y-1/2" style={{ left: `${Math.min(loss, win)}%`, width: `${Math.abs(win - loss)}%`, background: `linear-gradient(to right, rgb(${LOSS}), rgb(${WIN}))` }} />
    {[[loss, LOSS], [win, WIN]].map(([p, color], i) => <span key={i} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2 w-2 rounded-full" style={{ left: `${p}%`, background: `rgb(${color})` }} />)}
    {logo && <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2" style={{ left: `${row.current[goal] * 100}%` }} title={`Current: ${formatOdds(row.current[goal])}`}><TeamLogo abbr={row.team.abbrName} size={24} /></span>}
  </div>
}

export default function LeverageTab({ season, rules, params, updateParam }) {
  const goal = GOALS.some(g => g.value === params.get('goal')) ? params.get('goal') : 'playoffs'
  const weekParam = params.get('week')
  const week = weekParam != null && /^\d+$/.test(weekParam) && Number(weekParam) < 18 ? Number(weekParam) : undefined
  const small = params.get('small') === 'true'
  const { data, loading, error } = useLoad(season == null ? null : `playoffs-leverage-${season}-${rules}-${week ?? 'next'}`, () => getPlayoffLeverage(season, week, rules))
  const rows = (data?.games ?? []).flatMap(game => game.teams.map(row => ({ ...row, game, opp: row.side === 'home' ? game.away : game.home }))).sort((a, b) => b.current[goal] - a.current[goal])
  const shown = rows.filter(r => small || swingPoints(r, goal) >= 10 - 1e-9)
  const label = GOALS.find(g => g.value === goal).label
  const qualifier = data ? `${seasonLabel(data.season)} · ${weekName(data.week)} · ${data.rules} rules · ${label}` : ''
  const spec = {
    name: 'How much does each game matter', qualifier, rows: shown,
    description: 'Odds if this team loses or wins its game; swing is the difference in percentage points.',
    cols: [
      { label: 'Team', desc: 'Team playing this week.', text: r => r.team.displayName, logo: r => r.team.abbrName },
      { label: 'Opp', desc: 'Opponent; vs means home, @ means away.', text: r => `${r.side === 'home' ? 'vs' : '@'} ${r.opp.abbrName}` },
      ...[['ifLoss', 'If lose'], ['ifWin', 'If win']].map(([key, title]) => ({ label: title, desc: `${label} probability: ${title.toLowerCase()}.`, text: r => formatOdds(r[key][goal]), value: r => r[key][goal], z: '0%' })),
      { label: 'Swing', desc: 'Win minus loss odds in percentage points.', text: r => `${Math.round(swingPoints(r, goal))} pp`, value: r => swingPoints(r, goal), z: '0" pp"', color: r => `rgb(${WIN} / ${Math.min(0.5, Math.abs(swingPoints(r, goal)) / 100)})` },
    ], api: { path: '/playoffs/leverage', params: data ? { season: data.season, week: data.week, rules: data.rules } : {}, note: `${label}; current odds descending; ${small ? 'all swings' : 'swings of at least 10 points'}.`, fields: { Team: 'teams[].team.displayName', Opp: 'side, home, away', 'If lose': `teams[].ifLoss.${goal}`, Current: `teams[].current.${goal}`, 'If win': `teams[].ifWin.${goal}`, Swing: `(ifWin.${goal} - ifLoss.${goal}) × 100` } },
  }
  const chartSpec = { ...spec, cols: [...spec.cols.slice(0, 3), { label: 'Current', desc: 'Current probability, shown by the team logo.', text: r => formatOdds(r.current[goal]), value: r => r.current[goal], z: '0%' }, ...spec.cols.slice(3)], name: 'Win or lose: playoff leverage', rows, api: { ...spec.api, note: `${label}; all participants, current odds descending.` }, image: { draw: (ctx, width) => leveragePanel(ctx, width, rows, goal) } }
  const games = [...(data?.games ?? [])].sort((a, b) => b.importance[goal] - a.importance[goal])
  const others = g => g.others.filter(o => o.goal === goal).slice(0, 3).map(o => `${o.team.displayName} (${o.swing >= 0 ? '+' : ''}${Math.round(o.swing * 100)} pp with a home win)`).join('; ') || 'No other teams listed'
  const gamesSpec = { name: 'Biggest games this week', qualifier, rows: games, description: 'Ranked by total probability moved across all teams, divided by two.', cols: [
    { label: 'Game', desc: 'Away at home.', text: g => `${g.away.displayName} @ ${g.home.displayName}` },
    { label: 'Importance', desc: 'Sum of absolute probability changes across all teams, divided by two; measured in probability points.', text: g => `${Math.round(g.importance[goal] * 100)} pp`, value: g => g.importance[goal] * 100, z: '0" pp"' },
    { label: 'Others affected', desc: 'Top other teams for this goal; signed change with a home win.', text: others },
  ], api: { ...spec.api, note: `${label}; importance descending.`, fields: { Game: 'away, home', Importance: `importance.${goal} × 100`, 'Others affected': `others filtered by goal=${goal}, largest three in API order` } } }
  return <>
    <div className="flex flex-wrap gap-4 mb-5"><label className="text-sm">Week <select className="field" aria-label="Week" value={week ?? data?.week ?? ''} onChange={e => updateParam('week', e.target.value)}>{data?.week == null && week == null && <option value="">Next week</option>}{Array.from({ length: 18 }, (_, i) => <option key={i} value={i}>{weekName(i)}</option>)}</select></label><label className="text-sm">Goal <select className="field" aria-label="Goal" value={goal} onChange={e => updateParam('goal', e.target.value)}>{GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select></label></div>
    {loading && <p className="text-muted">Loading…</p>}{error && <p className="text-bad">Could not load playoff leverage.</p>}
    {data && !rows.length && <p className="text-muted">No remaining games this week.</p>}
    {rows.length > 0 && <div className="space-y-8">
      <section aria-label="Win or lose chart"><div className="flex items-center justify-between flex-wrap gap-2"><h2 className="font-display text-2xl font-bold">Win or lose</h2><ExportMenu spec={chartSpec} /></div><p className="text-xs text-muted my-2">Orange: if lose · Logo: current odds · Blue: if win · {label}</p>
        <div className="overflow-x-auto"><div className="min-w-[520px]"><div className="ml-52 mr-14 flex justify-between text-xs text-muted"><span>0%</span><span>50%</span><span>100%</span></div>{rows.map(r => <div key={r.team.teamId} className="grid grid-cols-[9rem_3rem_1fr_3rem] items-center gap-2 border-t border-line text-sm"><TeamLink team={r.team} season={data.season} rules={data.rules} path /><span className="text-right num" style={{ color: `rgb(${LOSS})` }}>{formatOdds(r.ifLoss[goal])}</span><Range row={r} goal={goal} logo /><span className="num" style={{ color: `rgb(${WIN})` }}>{formatOdds(r.ifWin[goal])}</span></div>)}</div></div>
      </section>
      <section aria-label="Swing table"><div className="flex justify-between flex-wrap gap-2"><h2 className="font-display text-2xl font-bold">How much does each game matter</h2><ExportMenu spec={spec} /></div><label className="inline-flex items-center gap-2 text-sm my-3"><input type="checkbox" checked={small} onChange={e => updateParam('small', String(e.target.checked))} />Show small swings</label>
        <div className="overflow-x-auto"><table aria-label="Game swings" className="w-full text-sm"><thead><tr>{['Team', 'Opp', 'If lose %', 'Range', 'If win %', 'Swing'].map(t => <th key={t} className="th text-left whitespace-nowrap">{t}</th>)}</tr></thead><tbody>{shown.map(r => <tr key={r.team.teamId} className="border-t border-line"><td className="pr-3"><TeamLink team={r.team} season={data.season} rules={data.rules} path /></td><td className="pr-3 whitespace-nowrap">{r.side === 'home' ? 'vs' : '@'} {r.opp.abbrName}</td><td className="num" style={{ color: `rgb(${LOSS})` }}>{formatOdds(r.ifLoss[goal])}</td><td className="px-3 w-1/3"><Range row={r} goal={goal} /></td><td className="num" style={{ color: `rgb(${WIN})` }}>{formatOdds(r.ifWin[goal])}</td><td className="px-3 num whitespace-nowrap" style={{ background: spec.cols.at(-1).color(r) }}>{Math.round(swingPoints(r, goal))} pp</td></tr>)}</tbody></table></div>{!shown.length && <p className="text-muted text-sm mt-2">No swings of 10 points or more. Show small swings to see all teams.</p>}
      </section>
      <section aria-label="Biggest games"><div className="flex justify-between flex-wrap gap-2"><h2 className="font-display text-2xl font-bold">Biggest games this week</h2><ExportMenu spec={gamesSpec} /></div><p className="text-xs text-muted my-2">Importance measures how much probability moves across all teams, divided by two.</p><div className="overflow-x-auto"><table className="w-full text-sm" aria-label="Biggest games this week"><thead><tr>{gamesSpec.cols.map(c => <th className="th text-left" key={c.label}>{c.label}</th>)}</tr></thead><tbody>{games.map(g => <tr key={g.gameId} className="border-t border-line">{gamesSpec.cols.map(c => <td className="px-2 py-3" key={c.label}>{c.text(g)}</td>)}</tr>)}</tbody></table></div></section>
    </div>}
  </>
}
