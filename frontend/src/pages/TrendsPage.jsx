import React, { useState, useEffect } from 'react'
import { getSeasons, getSeasonTrends, getWeeklyTrends } from '../api/client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import PageHeader from '../components/PageHeader'
import Tabs from '../components/Tabs'
import { TeamLogo } from '../components/TeamLogo'
import { goodBadColor, divergeColor } from '../utils/heat'

// ── Season history tab ────────────────────────────────────────────────────────

function SeasonHistoryTab({ data }) {
  // data: [{seasonIndex, weekIndex: null, standings: [...]}]
  const seasons = data.map(d => d.seasonIndex)
  const allTeams = data.length ? data[data.length - 1].standings : []

  const lastSeason = seasons[seasons.length - 1]
  const [sortSeason, setSortSeason] = useState(lastSeason ?? null)
  const [sortCol, setSortCol] = useState('wl')
  const [sortAsc, setSortAsc] = useState(false)

  if (!data.length) return <p className="text-muted">No season data available.</p>

  const handleSort = (season, col) => {
    if (sortSeason === season && sortCol === col) setSortAsc(a => !a)
    else { setSortSeason(season); setSortCol(col); setSortAsc(false) }
  }

  const getVal = (r, col) => {
    if (!r) return null
    if (col === 'wl')    return r.winPct
    if (col === 'pypat') return r.pythagoreanPat
    if (col === 'luck')  return r.winDiff
  }

  const sortedTeams = [...allTeams].sort((a, b) => {
    const targetData = data.find(d => d.seasonIndex === sortSeason)
    const ra = targetData?.standings.find(s => s.teamId === a.teamId)
    const rb = targetData?.standings.find(s => s.teamId === b.teamId)
    const av = getVal(ra, sortCol), bv = getVal(rb, sortCol)
    if (av == null) return 1
    if (bv == null) return -1
    return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  const columnValues = {}
  for (const d of data) {
    for (const col of ['wl', 'pypat']) {
      columnValues[`${d.seasonIndex}-${col}`] = d.standings.map(r => getVal(r, col))
    }
  }

  const thClass = 'th text-center cursor-pointer hover:text-ink'
  const arrow = (s, col) => sortSeason === s && sortCol === col ? (sortAsc ? ' ▲' : ' ▼') : ''

  return (
    <div className="overflow-x-auto border-y border-rule">
      <table className="w-full text-sm num">
        <thead className="bg-bg">
          <tr className="border-b border-line">
            <th className="px-2 pt-2 text-left text-[11px] font-bold uppercase tracking-wider sticky left-0 bg-bg z-20">Team</th>
            {seasons.map(s => (
              <th key={s} className="px-2 pt-2 text-center text-[11px] font-bold uppercase tracking-wider border-l border-rule" colSpan={3}>
                Season {s + 2026}
              </th>
            ))}
          </tr>
          <tr className="border-b border-rule">
            <th className="sticky left-0 bg-bg z-20" />
            {seasons.map(s => (
              <React.Fragment key={s}>
                <th className={`${thClass} border-l border-rule`} onClick={() => handleSort(s, 'wl')}>W-L{arrow(s, 'wl')}</th>
                <th className={thClass} onClick={() => handleSort(s, 'pypat')}>PyPAT{arrow(s, 'pypat')}</th>
                <th className={thClass} onClick={() => handleSort(s, 'luck')}>Luck{arrow(s, 'luck')}</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedTeams.map((team, i) => {
            const rowBg = i % 2 ? 'bg-surface' : 'bg-bg'
            return (
              <tr key={team.teamId} className={`border-t border-line ${rowBg}`}>
                <td className={`px-2 py-1.5 font-semibold whitespace-nowrap sticky left-0 z-10 border-r border-line ${rowBg}`}>
                  <span className="inline-flex items-center gap-2">
                    <TeamLogo abbr={team.abbrName} size={22} />
                    {team.displayName}
                  </span>
                </td>
                {data.map(d => {
                  const row = d.standings.find(s => s.teamId === team.teamId)
                  return (
                    <React.Fragment key={d.seasonIndex}>
                      <td
                        className="px-2 py-1.5 text-center whitespace-nowrap border-l border-rule"
                        style={{ backgroundColor: goodBadColor(row?.winPct, columnValues[`${d.seasonIndex}-wl`]) }}
                      >
                        {row ? `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}` : '—'}
                      </td>
                      <td
                        className="px-2 py-1.5 text-center"
                        style={{ backgroundColor: goodBadColor(row?.pythagoreanPat, columnValues[`${d.seasonIndex}-pypat`]) }}
                      >
                        {row ? row.pythagoreanPat.toFixed(3) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-center" style={{ backgroundColor: divergeColor(row?.winDiff) }}>
                        {row?.winDiff != null ? (row.winDiff > 0 ? '+' : '') + row.winDiff.toFixed(1) : '—'}
                      </td>
                    </React.Fragment>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Weekly progression tab ────────────────────────────────────────────────────

const COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2',
  '#db2777', '#65a30d', '#ea580c', '#0d9488', '#4f46e5', '#ca8a04',
]

function WeeklyTab({ season }) {
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

  const allTeams = data[0]?.standings.map(s => ({ id: s.teamId, name: s.displayName, abbr: s.abbrName })) ?? []
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

  return (
    <div>
      <PageHeader title="Trends" qualifier="PyPAT and Luck across seasons and weeks">
        {tab === 'weekly' && (
          <select className="field" value={season ?? ''} onChange={e => setSeason(Number(e.target.value))}>
            {seasons.map(s => <option key={s} value={s}>Season {s + 2026}</option>)}
          </select>
        )}
      </PageHeader>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[{ value: 'season', label: 'Season History' }, { value: 'weekly', label: 'Week by Week' }]}
      />

      {tab === 'season' && <SeasonHistoryTab data={seasonData} />}
      {tab === 'weekly' && <WeeklyTab season={season} />}
    </div>
  )
}
