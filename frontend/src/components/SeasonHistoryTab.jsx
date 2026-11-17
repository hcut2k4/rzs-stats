import React, { useState } from 'react'
import { TeamLogo } from './TeamLogo'
import { goodBadColor, divergeColor } from '../utils/heat'
import { seasonNumber } from '../utils/seasons'

export default function SeasonHistoryTab({ data }) {
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
                Season {seasonNumber(s)}
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
                  <span className="flex items-center gap-2">
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
