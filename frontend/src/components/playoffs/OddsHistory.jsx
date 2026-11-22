import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getPlayoffOddsHistory } from '../../api/client'
import { useLoad } from '../../utils/useLoad'
import { GOALS } from '../../utils/playoffOdds'
import { COLORS } from '../../utils/chartColors'
import { teamColor } from '../../utils/teamProfile'
import { weekLabel } from '../../utils/playoffRounds'
import { seasonLabel } from '../../utils/seasons'
import { oddsHistoryPanel } from '../../utils/chartImage'
import ExportMenu from '../ExportMenu'

const weekText = week => weekLabel(1, week)
const NOTE = 'Weekly snapshots saved after each sync; weeks without a snapshot are not shown'

export default function OddsHistory({ season, currentTeams }) {
  const [open, setOpen] = useState(false)
  const [goal, setGoal] = useState('playoffs')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => [...new Map(currentTeams.slice().sort((a, b) => b.odds.playoffs - a.odds.playoffs).map(r => [r.team.teamId, r.team])).keys()].slice(0, 6))
  const { data, loading, error } = useLoad(open ? `playoffs-history-${season}` : null, async () => getPlayoffOddsHistory(season))
  const snapshots = data?.snapshots?.slice().sort((a, b) => a.week - b.week) ?? []
  const teams = [...new Map([...snapshots.flatMap(s => s.teams), ...currentTeams].map(r => [r.team.teamId, r.team])).values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
  const lines = teams.map((team, i) => ({ ...team, color: teamColor(team.primaryColor) ?? COLORS[i % COLORS.length] })).filter(t => selected.includes(t.teamId))
  const rows = snapshots.map(s => ({ week: s.week, ...Object.fromEntries(s.teams.map(r => [r.team.teamId, r[goal]])) }))
  const goalLabel = GOALS.find(g => g.value === goal).label
  const spec = data && {
    name: 'Odds over time', qualifier: `${seasonLabel(data.season)} · ${goalLabel} · Madden rules`, rows,
    description: 'Saved weekly odds for the selected teams.', notes: [NOTE],
    cols: [
      { label: 'Week', desc: 'Snapshot week.', text: r => weekText(r.week), value: r => r.week + 1, z: '"Week "0' },
      ...lines.map(t => ({ label: t.abbrName, desc: `${t.displayName}: ${goalLabel} probability.`, text: r => r[t.teamId] == null ? '' : `${Math.round(r[t.teamId] * 100)}%`, value: r => r[t.teamId], z: '0%' })),
    ],
    image: { draw: (ctx, width) => oddsHistoryPanel(ctx, width, rows, lines, weekText) },
    api: { path: '/playoffs/odds/history', params: { season: data.season }, fields: { Week: 'snapshots[].week', Teams: `snapshots[].teams[].${goal}` }, note: `${goalLabel}; selected teams: ${lines.map(t => t.abbrName).join(', ')}. Madden rules only.` },
  }
  return <details className="border-t border-line pt-3 mt-8" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">Odds over time</summary>
    <section aria-label="Odds over time" className="mt-3">
      <p className="text-sm text-muted">{NOTE}</p>
      <p className="text-sm text-muted mb-3">Saved with Madden rules.</p>
      {loading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-muted">Odds history unavailable.</p>}
      {data && snapshots.length < 2 && <p className="text-muted">History starts building after the first sync of the season</p>}
      {snapshots.length >= 2 && <>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <label className="text-sm">History goal<select className="block bg-bg border border-line p-2" value={goal} onChange={e => setGoal(e.target.value)}>{GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select></label>
          <ExportMenu spec={spec} />
        </div>
        <fieldset className="border border-line p-3 mb-3"><legend className="text-sm font-semibold">Teams</legend>
          <label className="text-sm">Search teams<input type="search" className="block bg-bg border border-line p-2 w-full mb-2" value={search} onChange={e => setSearch(e.target.value)} /></label>
          <div className="max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 gap-2">{teams.filter(t => `${t.abbrName} ${t.displayName}`.toLowerCase().includes(search.toLowerCase())).map(t => <label className="text-sm flex items-center gap-2" key={t.teamId}><input type="checkbox" checked={selected.includes(t.teamId)} onChange={e => setSelected(ids => e.target.checked ? [...ids, t.teamId] : ids.filter(id => id !== t.teamId))} />{t.displayName}</label>)}</div>
        </fieldset>
        {!lines.length ? <p className="text-muted">Select a team to see its odds history.</p> : <>
          <div className="flex flex-wrap gap-3 text-sm mb-2">{lines.map(t => <span key={t.teamId} style={{ color: t.color }}>{t.displayName}</span>)}</div>
          <div className="h-72" role="img" aria-label={`${goalLabel} odds history: ${lines.map(t => t.displayName).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--line))" />
              <XAxis dataKey="week" tickFormatter={weekText} stroke="rgb(var(--muted))" />
              <YAxis domain={[0, 1]} ticks={[0, .25, .5, .75, 1]} tickFormatter={p => `${Math.round(p * 100)}%`} stroke="rgb(var(--muted))" />
              <Tooltip labelFormatter={weekText} formatter={p => `${Math.round(p * 100)}%`} contentStyle={{ background: 'rgb(var(--bg))', borderColor: 'rgb(var(--line))' }} />
              {lines.map(t => <Line key={t.teamId} name={t.displayName} dataKey={String(t.teamId)} type="linear" stroke={t.color} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />)}
            </LineChart></ResponsiveContainer>
          </div>
        </>}
      </>}
    </section>
  </details>
}
