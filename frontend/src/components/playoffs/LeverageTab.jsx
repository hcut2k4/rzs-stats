import PlayoffError from './PlayoffError'
import { getPlayoffLeverage } from '../../api/client'
import { usePlayoffLoad } from '../../utils/usePlayoffLoad'
import { GOALS, LOSS, WIN, formatOdds, swingPoints, probShade, swingShade } from '../../utils/playoffOdds'
import { seasonLabel } from '../../utils/seasons'
import { weekName } from '../../utils/playoffRounds'
import { leveragePanel } from '../../utils/chartImage'
import { SortTh, useSorter } from '../SortTh'
import InfoTip from '../InfoTip'
import ExportMenu from '../ExportMenu'
import { TeamLogo } from '../TeamLogo'
import { TeamLink } from './OddsTab'

function Range({ row, goal, logo = false }) {
  const loss = row.ifLoss[goal] * 100, win = row.ifWin[goal] * 100
  return <div className="relative h-8 min-w-28" aria-label={`If lose ${formatOdds(row.ifLoss[goal])}, current ${formatOdds(row.current[goal])}, if win ${formatOdds(row.ifWin[goal])}`}>
    <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
    <div className="absolute top-1/2 h-1 -translate-y-1/2" style={{ left: `${Math.min(loss, win)}%`, width: `${Math.abs(win - loss)}%`, background: `linear-gradient(to right, rgb(${LOSS}), rgb(${WIN}))` }} />
    {[[loss, LOSS], [win, WIN]].map(([p, color], i) => <span key={i} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2 w-2 rounded-full" style={{ left: `${p}%`, background: `rgb(${color})` }} />)}
    {logo && <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2" style={{ left: `${row.current[goal] * 100}%` }} title={`Current: ${formatOdds(row.current[goal])}`}><TeamLogo abbr={row.team.abbrName} size={20} /></span>}
  </div>
}

export default function LeverageTab({ season, rules, params, updateParam }) {
  const goal = GOALS.some(g => g.value === params.get('goal')) ? params.get('goal') : 'playoffs'
  const weekParam = params.get('week')
  const week = weekParam != null && /^\d+$/.test(weekParam) && Number(weekParam) < 18 ? Number(weekParam) : undefined
  const small = params.get('small') === 'true'
  const { data, loading, error, retry } = usePlayoffLoad(season == null ? null : `playoffs-leverage-${season}-${rules}-${week ?? 'next'}`, () => getPlayoffLeverage(season, week, 'madden'))
  const sorter = useSorter({ key: 'Swing', asc: false })
  const gameSorter = useSorter({ key: 'Importance', asc: false })
  const rows = (data?.games ?? []).flatMap(game => game.teams.map(row => ({ ...row, game, opp: row.side === 'home' ? game.away : game.home })))
  const shown = sorter.apply(rows.filter(r => small || swingPoints(r, goal) >= 10 - 1e-9), { Team: r => r.team.displayName, Opp: r => r.opp.abbrName, 'If lose': r => r.ifLoss[goal], Range: r => r.current[goal], 'If win': r => r.ifWin[goal], Swing: r => swingPoints(r, goal) })
  const smallCount = rows.filter(r => swingPoints(r, goal) < 10 - 1e-9).length
  const label = GOALS.find(g => g.value === goal).label
  const qualifier = data ? `${seasonLabel(data.season)} · ${weekName(data.week)} · ${label}` : ''
  const spec = {
    name: 'How much does each game matter', qualifier, rows: shown,
    description: 'Probability if this team loses or wins its game; swing is the difference in percentage points.',
    cols: [
      { label: 'Team', desc: 'Team playing this week.', text: r => r.team.displayName, logo: r => r.team.abbrName },
      { label: 'Opp', desc: 'Opponent; vs means home, @ means away.', text: r => `${r.side === 'home' ? 'vs' : '@'} ${r.opp.abbrName}` },
      ...[['ifLoss', 'If lose'], ['ifWin', 'If win']].map(([key, title]) => ({ label: title, desc: `${label} probability: ${title.toLowerCase()}.`, text: r => formatOdds(r[key][goal]), value: r => r[key][goal], z: '0%', color: r => probShade(r[key][goal]) })),
      { label: 'Swing', desc: 'Win minus loss probability in percentage points.', text: r => `${Math.round(swingPoints(r, goal))} pp`, value: r => swingPoints(r, goal), z: '0" pp"', color: r => swingShade(swingPoints(r, goal)) },
    ], api: { path: '/playoffs/leverage', params: data ? { season: data.season, week: data.week, rules: data.rules } : {}, note: `${label}; ${sorter.sort.key} ${sorter.sort.asc ? 'ascending' : 'descending'}; ${small ? 'all swings' : 'swings of at least 10 points'}.`, fields: { Team: 'teams[].team.displayName', Opp: 'side, home, away', 'If lose': `teams[].ifLoss.${goal}`, Current: `teams[].current.${goal}`, 'If win': `teams[].ifWin.${goal}`, Swing: `(ifWin.${goal} - ifLoss.${goal}) × 100` } },
  }
  spec.cols.splice(3, 0, { label: 'Range', desc: 'Current probability, shown by the logo between loss and win.', text: r => formatOdds(r.current[goal]), value: r => r.current[goal], z: '0%' })
  spec.image = { draw: (ctx, width) => leveragePanel(ctx, width, shown, goal) }
  const others = g => g.others.filter(o => o.goal === goal && Math.abs(Math.round(o.swing * 100)) >= 1).slice(0, 3).map(o => `${o.team.displayName} (${o.swing >= 0 ? '+' : ''}${Math.round(o.swing * 100)} pp with a home win)`).join('; ') || 'No other teams listed'
  const games = gameSorter.apply(data?.games ?? [], { Game: g => `${g.away.abbrName} @ ${g.home.abbrName}`, Importance: g => g.importance[goal], 'Others affected': others })
  const gamesSpec = { name: 'Biggest games this week', qualifier, rows: games, description: 'Ranked by total probability moved across all teams, divided by two.', cols: [
    { label: 'Game', desc: 'Away at home.', text: g => `${g.away.displayName} @ ${g.home.displayName}` },
    { label: 'Importance', desc: 'Sum of absolute probability changes across all teams, divided by two; measured in probability points.', text: g => `${Math.round(g.importance[goal] * 100)} pp`, value: g => g.importance[goal] * 100, z: '0" pp"', color: g => swingShade(g.importance[goal] * 100) },
    { label: 'Others affected', desc: 'Top other teams for this goal; signed change with a home win.', text: others },
  ], api: { ...spec.api, note: `${label}; ${gameSorter.sort.key} ${gameSorter.sort.asc ? 'ascending' : 'descending'}.`, fields: { Game: 'away, home', Importance: `importance.${goal} × 100`, 'Others affected': `others filtered by goal=${goal}, largest three in API order` } } }
  return <>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 text-sm">
      <label>Week <select className="field" aria-label="Week" value={week ?? data?.week ?? ''} onChange={e => updateParam('week', e.target.value)}>{data?.week == null && week == null && <option value="">Next week</option>}{Array.from({ length: 18 }, (_, i) => <option key={i} value={i}>{weekName(i)}</option>)}</select></label>
      <label>Goal <select className="field" aria-label="Goal" value={goal} onChange={e => updateParam('goal', e.target.value)}>{GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select></label>
    </div>
    {loading && <p className="text-muted">Loading…</p>}{error && <PlayoffError error={error} retry={retry}>Could not load playoff leverage.</PlayoffError>}
    {data && !rows.length && <p className="text-muted">No remaining games this week.</p>}
    {rows.length > 0 && <div className="space-y-8">
      <section aria-label="Swing table" className="min-w-0"><div className="flex items-center justify-between flex-wrap gap-2 mb-2"><h2 className="font-display font-bold uppercase text-xl leading-none">How much does each game matter</h2><ExportMenu spec={spec} /></div>
        <div className="overflow-x-auto border-y border-rule whitespace-nowrap"><table aria-label="Game swings" className="w-full text-sm num"><thead><tr className="border-b border-rule">{spec.cols.map(c => <SortTh key={c.label} sortKey={c.label} state={sorter.sort} onSort={sorter.click} tip={c.desc} className={['Team', 'Opp'].includes(c.label) ? 'text-left' : 'text-right'}>{c.label}</SortTh>)}</tr></thead><tbody>{shown.map((r, i) => <tr key={r.team.teamId} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
          <td className="px-2 py-1 [&_img]:!w-5 [&_img]:!h-5"><TeamLink team={r.team} season={data.season} rules={data.rules} path /></td><td className="px-2 py-1">{r.side === 'home' ? 'vs' : '@'} {r.opp.abbrName}</td>
          <td className="px-2 py-1 num text-right" style={{ background: probShade(r.ifLoss[goal]) }}>{formatOdds(r.ifLoss[goal])}</td><td className="px-3 w-1/3"><Range row={r} goal={goal} logo /></td>
          <td className="px-2 py-1 num text-right" style={{ background: probShade(r.ifWin[goal]) }}>{formatOdds(r.ifWin[goal])}</td><td className="px-2 py-1 num text-right" style={{ background: swingShade(swingPoints(r, goal)) }}>{Math.round(swingPoints(r, goal))} pp</td>
        </tr>)}</tbody></table></div>{!shown.length && <p className="text-muted text-sm mt-2">No swings of 10 points or more. Show small swings to see all teams.</p>}
        {(small || smallCount > 0) && <button type="button" className="field mt-2 text-xs" aria-expanded={small} onClick={() => updateParam('small', String(!small))}>{small ? 'Hide small swings' : `Show ${smallCount} more teams with small swings`}</button>}
      </section>
      <section aria-label="Biggest games" className="min-w-0"><div className="flex items-center justify-between flex-wrap gap-2 mb-2"><h2 className="th mb-1">Biggest games this week</h2><ExportMenu spec={gamesSpec} /></div><p className="text-xs text-muted mb-2">Importance is how much playoff probability moves across all teams depending on who wins, in percentage points. Others affected shows how a home win changes other teams.</p><div className="overflow-x-auto border-y border-rule whitespace-nowrap"><table className="w-full text-sm num" aria-label="Biggest games this week"><thead><tr className="border-b border-rule">{gamesSpec.cols.map(c => <SortTh key={c.label} sortKey={c.label} state={gameSorter.sort} onSort={gameSorter.click} tip={c.desc} className={c.label === 'Importance' ? 'text-right' : 'text-left'}>{c.label}</SortTh>)}</tr></thead><tbody>{games.map((g, i) => <tr key={g.gameId} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
        <td className="px-2 py-2">{g.away.displayName} @ {g.home.displayName}</td><td className="px-2 py-2 num text-right" style={{ background: swingShade(g.importance[goal] * 100) }}>{Math.round(g.importance[goal] * 100)} pp</td>
        <td className="px-2 py-2 text-muted">{g.others.filter(o => o.goal === goal && Math.abs(Math.round(o.swing * 100)) >= 1).slice(0, 3).map(o => `${o.team.displayName} ${o.swing >= 0 ? '+' : '−'}${Math.abs(Math.round(o.swing * 100))} pp`).join(', ') || 'No other teams affected'}</td>
      </tr>)}</tbody></table></div></section>
    </div>}
  </>
}
