import { useState, useEffect } from 'react'
import { getWeeklyTrends } from '../api/client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { COLORS } from '../utils/chartColors'

export default function WeeklyTab({ season }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [focus, setFocus] = useState(new Set())
  const [hover, setHover] = useState(null)

  useEffect(() => {
    if (season == null) return
    setLoading(true)
    getWeeklyTrends(season)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [season])

  if (loading) return <p className="text-muted">Loading...</p>
  if (!data.length) return <p className="text-muted">No data available.</p>

  const allTeams = (data[0]?.standings.map(s => ({ id: s.teamId, name: s.displayName, abbr: s.abbrName })) ?? [])
    .sort((a, b) => (a.abbr ?? a.name).localeCompare(b.abbr ?? b.name))
  const chartData = data.map(d => {
    const point = { week: `Wk ${d.weekIndex + 1}` }
    d.standings.forEach(s => { point[s.displayName] = s.pythagoreanPat })
    return point
  })

  const toggleTeam = name =>
    setFocus(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })

  const emphasised = name => focus.has(name) || hover === name
  const anyEmphasis = focus.size > 0 || hover != null

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-xs text-muted">
        <span>Click teams to highlight them. The rest fade back.</span>
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
      <ResponsiveContainer width="100%" height={420}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--line))" />
          <XAxis dataKey="week" tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} stroke="rgb(var(--line))" />
          <YAxis domain={[0, 1]} tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} stroke="rgb(var(--line))" tickFormatter={v => v.toFixed(2)} />
          <Tooltip
            contentStyle={{ background: 'rgb(var(--bg))', border: '1px solid rgb(var(--rule))', borderRadius: 3 }}
            itemSorter={item => -item.value}
            formatter={v => v.toFixed(4)}
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
