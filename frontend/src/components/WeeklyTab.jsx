import { useState, useEffect } from 'react'
import { getWeeklyTrends } from '../api/client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import ExportMenu from './ExportMenu'
import { seasonLabel } from '../utils/seasons'
import { weekLabel } from '../utils/playoffRounds'
import { PYPAT_TIP } from '../utils/siteCopy'
import { COLORS } from '../utils/chartColors'

export const pyPatPercent = v => (v * 100).toFixed(1) + '%'

export default function WeeklyTab({ season }) {
  const [{ data, dataSeason }, setData] = useState({ data: [], dataSeason: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [focus, setFocus] = useState(new Set())
  const [hover, setHover] = useState(null)

  useEffect(() => {
    if (season == null) return
    let current = true
    setLoading(true)
    setError(false)
    getWeeklyTrends(season)
      .then(d => { if (current) { setData({ data: d, dataSeason: season }); setLoading(false) } })
      .catch(() => { if (current) { setData({ data: [], dataSeason: season }); setError(true); setLoading(false) } })
    return () => { current = false }
  }, [season])

  if (loading) return <p className="text-muted">Loading…</p>
  if (error) return <p className="text-bad">Couldn&apos;t load week-by-week data. Try again in a moment.</p>
  if (!data.length) return <p className="text-muted">No data available.</p>

  const allTeams = (data[0]?.standings.map(s => ({ id: s.teamId, name: s.displayName, abbr: s.abbrName })) ?? [])
    .sort((a, b) => (a.abbr ?? a.name).localeCompare(b.abbr ?? b.name))
  const chartData = data.map(d => {
    const point = { week: `Wk ${d.weekIndex + 1}` }
    d.standings.forEach(s => { point[s.displayName] = s.pythagoreanPat })
    return point
  })

  const spec = {
    name: 'Week by Week',
    qualifier: `${seasonLabel(dataSeason)} · cumulative PyPAT by week`,
    description: 'One row per team in chart legend order, with cumulative PyPAT at each week.',
    rows: allTeams,
    cols: [
      { label: 'Team', desc: 'Team name.', text: team => team.name, align: 'left' },
      ...data.map(d => {
        const value = team => d.standings.find(r => r.teamId === team.id)?.pythagoreanPat
        const label = d.weekIndex >= 18 ? weekLabel(2, d.weekIndex) : `Wk ${d.weekIndex + 1}`
        return { label, desc: `PyPAT so far, counting every game through ${label} of ${seasonLabel(dataSeason)}. ${PYPAT_TIP}`, value, text: team => value(team) == null ? '' : (value(team) * 100).toFixed(1) + '%', z: '0.0%' }
      }),
    ],
    api: { path: '/trends/weekly', params: { season: dataSeason }, fields: { Team: 'standings[].displayName', 'Week columns': 'Match standings[].teamId within each weekIndex; value is standings[].pythagoreanPat.' }, note: 'Highlighting teams only changes chart emphasis; all chart teams are included.' },
  }

  const toggleTeam = name =>
    setFocus(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })

  const emphasised = name => focus.has(name) || hover === name
  const anyEmphasis = focus.size > 0 || hover != null

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-xs text-muted">
        <span title={PYPAT_TIP}>Each team's PyPAT so far, after every week. Click teams to highlight them. The rest fade back.</span>
        <button onClick={() => setFocus(new Set())} className="text-ink font-medium hover:text-accent">Clear</button>
      </div>
      <div className="flex flex-wrap gap-1 mb-4">
        {allTeams.map((t, i) => (
          <button
            key={t.id}
            onClick={() => toggleTeam(t.name)}
            onMouseEnter={() => setHover(t.name)}
            onMouseLeave={() => setHover(null)}
            aria-pressed={focus.has(t.name)}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border transition-colors ${
              focus.has(t.name) ? 'border-rule bg-surface font-semibold' : 'border-line text-muted hover:text-ink'
            }`}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            {t.abbr ?? t.name}
          </button>
        ))}
      </div>
      {allTeams.length > 0 && <div className="flex justify-end mb-2"><ExportMenu spec={spec} /></div>}
      <ResponsiveContainer width="100%" height={420}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--line))" />
          <XAxis dataKey="week" tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} stroke="rgb(var(--line))" />
          <YAxis domain={[0, 1]} tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} stroke="rgb(var(--line))" tickFormatter={v => v.toFixed(2)} />
          <Tooltip
            contentStyle={{ background: 'rgb(var(--bg))', border: '1px solid rgb(var(--rule))', borderRadius: 3 }}
            itemSorter={item => -item.value}
            formatter={pyPatPercent}
          />
          {allTeams.map((t, i) => (
            <Line
              key={t.id}
              type="monotone"
              dataKey={t.name}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
              strokeWidth={emphasised(t.name) ? 3 : 1.5}
              strokeOpacity={anyEmphasis && !emphasised(t.name) ? 0.12 : 1}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
