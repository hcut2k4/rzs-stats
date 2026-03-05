import { useState, useEffect } from 'react'
import { getSeasons, getSeasonTrends, getWeeklyTrends } from '../api/client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

// ── Season history tab ────────────────────────────────────────────────────────

function SeasonHistoryTab({ data }) {
  // data: [{seasonIndex, weekIndex: null, standings: [...]}]
  const seasons = data.map(d => d.seasonIndex)
  // Collect all teams from last season entry
  const allTeams = data.length ? data[data.length - 1].standings : []

  if (!data.length) return <p className="text-gray-400">No season data available.</p>

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full text-sm">
        <thead className="bg-gray-900 text-gray-400">
          <tr>
            <th className="px-3 py-2 text-left">Team</th>
            {seasons.map(s => (
              <th key={s} className="px-3 py-2 text-center" colSpan={2}>Season {s + 1}</th>
            ))}
          </tr>
          <tr className="text-xs">
            <th />
            {seasons.map(s => (
              <>
                <th key={`${s}-wl`} className="px-2 py-1 text-center text-gray-500">W-L</th>
                <th key={`${s}-py`} className="px-2 py-1 text-center text-gray-500">PyPat</th>
              </>
            ))}
          </tr>
        </thead>
        <tbody>
          {allTeams.map(team => (
            <tr key={team.teamId} className="border-t border-gray-800 hover:bg-gray-800/50">
              <td className="px-3 py-2 font-medium whitespace-nowrap">{team.displayName}</td>
              {data.map(d => {
                const row = d.standings.find(s => s.teamId === team.teamId)
                return (
                  <>
                    <td key={`${d.seasonIndex}-wl`} className="px-2 py-2 text-center text-gray-300">
                      {row ? `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}` : '—'}
                    </td>
                    <td key={`${d.seasonIndex}-py`} className="px-2 py-2 text-center text-gray-300">
                      {row ? row.pythagoreanPat.toFixed(3) : '—'}
                    </td>
                  </>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Weekly progression tab ────────────────────────────────────────────────────

const COLORS = [
  '#22c55e','#3b82f6','#f59e0b','#ef4444','#a855f7','#06b6d4',
  '#f97316','#84cc16','#ec4899','#14b8a6','#6366f1','#fb923c',
]

function WeeklyTab({ season }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [hidden, setHidden] = useState(new Set())

  useEffect(() => {
    if (season == null) return
    setLoading(true)
    getWeeklyTrends(season)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [season])

  if (loading) return <p className="text-gray-400">Loading...</p>
  if (!data.length) return <p className="text-gray-400">No data available.</p>

  // Build chart data: [{week: 1, "Bills": 0.65, "Ravens": 0.55, ...}]
  const allTeams = data[0]?.standings.map(s => ({ id: s.teamId, name: s.displayName })) ?? []
  const chartData = data.map(d => {
    const point = { week: `Wk ${d.weekIndex + 1}` }
    d.standings.forEach(s => { point[s.displayName] = s.pythagoreanPat })
    return point
  })

  const toggleTeam = (name) =>
    setHidden(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {allTeams.map((t, i) => (
          <button
            key={t.id}
            onClick={() => toggleTeam(t.name)}
            className={`px-2 py-0.5 rounded text-xs border transition-opacity ${hidden.has(t.name) ? 'opacity-30' : ''}`}
            style={{ borderColor: COLORS[i % COLORS.length], color: COLORS[i % COLORS.length] }}
          >
            {t.name}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="week" tick={{ fill: '#9ca3af', fontSize: 12 }} />
          <YAxis domain={[0, 1]} tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={v => v.toFixed(2)} />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #374151' }}
            formatter={v => v.toFixed(4)}
          />
          {allTeams.map((t, i) => (
            <Line
              key={t.id}
              type="monotone"
              dataKey={t.name}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
              strokeWidth={2}
              hide={hidden.has(t.name)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TrendsPage() {
  const [tab, setTab] = useState('season')
  const [seasons, setSeasons] = useState([])
  const [season, setSeason] = useState(null)
  const [seasonData, setSeasonData] = useState([])

  useEffect(() => {
    getSeasons().then(s => { setSeasons(s); if (s.length) setSeason(s[s.length - 1]) })
    getSeasonTrends().then(setSeasonData)
  }, [])

  const tabClass = active =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? 'border-green-500 text-green-400'
        : 'border-transparent text-gray-400 hover:text-white'
    }`

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Trends</h1>

      <div className="flex gap-0 border-b border-gray-800 mb-6">
        <button className={tabClass(tab === 'season')} onClick={() => setTab('season')}>Season History</button>
        <button className={tabClass(tab === 'weekly')} onClick={() => setTab('weekly')}>Week by Week</button>
      </div>

      {tab === 'season' && <SeasonHistoryTab data={seasonData} />}

      {tab === 'weekly' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm text-gray-400">Season:</label>
            <select
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm"
              value={season ?? ''}
              onChange={e => setSeason(Number(e.target.value))}
            >
              {seasons.map(s => <option key={s} value={s}>Season {s + 1}</option>)}
            </select>
          </div>
          <WeeklyTab season={season} />
        </div>
      )}
    </div>
  )
}
