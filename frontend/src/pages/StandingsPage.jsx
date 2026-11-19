import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getSeasons, getStandings, getSeasonTrends } from '../api/client'
import ExportMenu from '../components/ExportMenu'
import { specCols } from '../utils/exportTable'
import { TeamCell } from '../components/TeamLogo'
import PageHeader from '../components/PageHeader'
import InfoTip from '../components/InfoTip'
import Tabs from '../components/Tabs'
import SeasonHistoryTab from '../components/SeasonHistoryTab'
import WeeklyTab from '../components/WeeklyTab'
import { goodBadColor, divergeColor } from '../utils/heat'
import { seasonLabel, seasonNumber } from '../utils/seasons'

const pct = v => v != null ? (v * 100).toFixed(1) + '%' : '—'

const TABS = [
  { value: 'standings', label: 'Standings' },
  { value: 'history', label: 'Season History' },
  { value: 'weekly', label: 'Week by Week' },
]
const TAB_VALUES = TABS.map(t => t.value)

export default function StandingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = TAB_VALUES.includes(params.get('tab')) ? params.get('tab') : 'standings'
  // replace: switching tabs shouldn't make Back walk through every tab visited
  const setTab = next => setParams(prev => {
    const p = new URLSearchParams(prev)
    next === 'standings' ? p.delete('tab') : p.set('tab', next)
    return p
  }, { replace: true })
  const [seasons, setSeasons] = useState([])
  const [season, setSeason] = useState(null)
  const [standings, setStandings] = useState([])
  const [standingsSeason, setStandingsSeason] = useState(null)
  const [sortKey, setSortKey] = useState('pythagoreanPat')
  const [sortAsc, setSortAsc] = useState(false)
  const [groupByConf, setGroupByConf] = useState(false)
  const [sosMode, setSosMode] = useState('curr')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState(null)
  const [historyError, setHistoryError] = useState(false)
  const historyRequested = useRef(false)

  useEffect(() => {
    getSeasons()
      .then(s => {
        setSeasons(s)
        if (s.length) {
          const defaultSeason = s[s.length - 1]
          setSeason(defaultSeason)
          // Default to prior season stats for the active/current season (insufficient games),
          // current season stats for all historical seasons (full data available)
          setSosMode(defaultSeason === s[s.length - 1] ? 'prev' : 'curr')
        }
      })
      .catch(() => setError('Failed to load seasons'))
  }, [])

  useEffect(() => {
    if (season == null) return
    let current = true
    setLoading(true)
    setError(null)
    getStandings(season)
      .then(data => { if (current) { setStandings(data); setStandingsSeason(season); setLoading(false) } })
      .catch(() => { if (current) { setError('Failed to load standings'); setLoading(false) } })
    return () => { current = false }
  }, [season])

  const loadHistory = () => {
    historyRequested.current = true
    setHistoryError(false)
    getSeasonTrends().then(setHistory).catch(() => setHistoryError(true))
  }

  // Every season x every team: only fetch when someone opens the tab, and only once.
  useEffect(() => {
    if (tab === 'history' && !historyRequested.current) loadHistory()
  }, [tab])

  const handleSort = key => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  const isCurrentSeason = seasons.length > 0 && season === seasons[seasons.length - 1]

  const pfAvg = r => r.gamesPlayed > 0 ? r.pointsFor / r.gamesPlayed : 0
  const paAvg = r => r.gamesPlayed > 0 ? r.pointsAgainst / r.gamesPlayed : 0
  const sortGetters = { pointsFor: pfAvg, pointsAgainst: paAvg }

  const sorted = [...standings].sort((a, b) => {
    const getter = sortGetters[sortKey]
    const av = getter ? getter(a) : a[sortKey]
    const bv = getter ? getter(b) : b[sortKey]
    if (av == null) return 1
    if (bv == null) return -1
    return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  // Current-season opponent PyPAT is noise until opponents have games that were not
  // against you, so the toggle stays hidden and SoS reads off the prior season.
  const sosToggleReady = standings.some(r => r.gamesPlayed >= 3)
  const activeSosMode = sosToggleReady ? sosMode : 'prev'
  const sosPrefix = activeSosMode === 'curr' ? 'Curr' : 'Prev'
  const sosSource = activeSosMode === 'curr' ? 'current season' : 'previous season'
  const sosCols = isCurrentSeason
    ? [
        { key: `oppPyPat${sosPrefix}`, label: 'Played', exportLabel: 'SoS Played', title: `Played SoS: avg opponent-adjusted PyPAT, ${sosSource}. Lower = easier schedule.` },
        { key: `oppPyPatRemaining${sosPrefix}`, label: 'Left', exportLabel: 'SoS Left', title: `Remaining SoS: future opponents' opponent-adjusted PyPAT, ${sosSource}.` },
        { key: `oppPyPatTotal${sosPrefix}`, label: 'Total', exportLabel: 'SoS Total', title: `Full-season SoS: all scheduled opponents, ${sosSource}.` },
      ]
    : [
        { key: `oppPyPat${sosPrefix}`, label: 'SoS', title: `Strength of Schedule: avg opponent-adjusted PyPAT, ${sosSource}. Lower = easier schedule.` },
      ]

  const COLS = [
    { key: 'rank',           label: '#', desc: 'Row number in the current sort order. Not an official standing or playoff seed.', tx: (_, i) => i + 1, value: (_, i) => i + 1, z: '0', fmt: (_, i) => i + 1, stickyLeft: 'left-0', w: 'w-10' },
    { key: 'displayName',    label: 'Team', logo: r => r.abbrName, desc: 'City plus nickname.', tx: (_, i, row) => `${row.cityName} ${row.displayName}`, fmt: (v, _, row) => <TeamCell abbr={row.abbrName} name={`${row.cityName} ${row.displayName}`} />, stickyLeft: 'left-10' },
    { key: 'wins',           label: 'W', desc: 'Wins. A tie counts 0.5 toward expected wins.', value: r => r.wins, z: '0', group: 'Record', groupStart: true },
    { key: 'losses',         label: 'L', desc: 'Losses.', value: r => r.losses, z: '0', group: 'Record' },
    { key: 'ties',           label: 'T', desc: 'Ties. A tie counts 0.5 toward expected wins.', value: r => r.ties, z: '0', group: 'Record' },
    { key: 'winPct',         label: 'Win%', desc: 'Winning percentage, 3 decimals, ties as half a win.', value: r => r.winPct, z: '0.000', fmt: v => v.toFixed(3), heat: 'higher', group: 'Record' },
    { key: 'pointsFor',      label: 'Avg PF', desc: 'Points scored per game.', value: r => r.gamesPlayed > 0 ? pfAvg(r) : null, z: '0.0', heat: 'higher', getValue: pfAvg, group: 'Scoring', groupStart: true,
      fmt: (v, _, row) => row.gamesPlayed > 0 ? (v / row.gamesPlayed).toFixed(1) : '—' },
    { key: 'pointsAgainst',  label: 'Avg PA', desc: 'Points allowed per game.', value: r => r.gamesPlayed > 0 ? paAvg(r) : null, z: '0.0', heat: 'lower',  getValue: paAvg, group: 'Scoring',
      fmt: (v, _, row) => row.gamesPlayed > 0 ? (v / row.gamesPlayed).toFixed(1) : '—' },
    { key: 'pythagoreanPat', label: 'PyPAT', desc: `PythagoreanPAT win expectancy: the share of games a team should have won given points scored and allowed, using Chase Stuart's dynamic exponent. 50.0% is break-even.`, value: r => r.pythagoreanPat, z: '0.0%', fmt: pct, heat: 'higher', group: 'Advanced', groupStart: true,
      title: 'PythagoreanPAT win expectancy' },
    { key: 'winDiff',        label: 'Luck', desc: 'Wins above PyPAT expectation. Positive = won more than scoring margin justifies, a regression risk; negative = unlucky, a rebound candidate.', value: r => r.winDiff, z: '+0.0;-0.0;0.0', group: 'Advanced',
      fmt: v => v != null ? (v > 0 ? '+' : '') + v.toFixed(1) : '—',
      heat: 'diverge',
      title: 'Wins above PyPAT expectation. Positive = lucky (regression risk).' },
    ...sosCols.map((c, i) => ({ ...c, desc: `${c.label === 'Left' ? 'Remaining schedule: future opponents' : c.label === 'Total' ? 'Full-season schedule: all scheduled opponents' : 'Played schedule: opponents already played'}. Average opponent-adjusted PyPAT using ${sosSource} quality, recalculated with the subject team's games removed so head-to-head results cannot inflate it. Weighted per game, so a division rival played twice counts twice. Lower = easier schedule. Null = no data, not 0.`, value: r => r[c.key], z: '0.0%', fmt: pct, heat: 'lower', group: 'Strength of schedule', groupStart: i === 0 })),
  ]

  const groupSpans = []
  for (const col of COLS) {
    const g = col.group ?? ''
    const last = groupSpans[groupSpans.length - 1]
    if (last && last.group === g && !col.groupStart) last.span++
    else groupSpans.push({ group: g, span: 1, start: col.groupStart })
  }

  const colValues = {}
  for (const col of COLS) {
    if (col.heat) colValues[col.key] = sorted.map(r => col.getValue ? col.getValue(r) : r[col.key])
  }

  const cellColor = (col, heatVal) => {
    if (col.heat === 'diverge') return divergeColor(heatVal)
    if (col.heat) return goodBadColor(heatVal, colValues[col.key] ?? [], col.heat)
    return undefined
  }

  const groups = groupByConf
    ? [
        { label: 'AFC', rows: sorted.filter(r => r.conference === 'AFC') },
        { label: 'NFC', rows: sorted.filter(r => r.conference === 'NFC') },
      ]
    : [{ label: null, rows: sorted }]

  const gamesLabel = standings.length ? `${Math.max(...standings.map(r => r.gamesPlayed))} games played` : null

  const exportSpec = group => {
    const sortLabel = COLS.find(col => col.key === sortKey)?.label
    const direction = sortAsc ? 'ascending' : 'descending'
    return {
      name: group.label ? `Standings — ${group.label}` : 'Standings',
      qualifier: `${seasonLabel(standingsSeason)} · ${gamesLabel} · sorted by ${sortLabel} ${direction}`,
      description: "Season standings, one row per team. The site's premise is that one-score games are near-random, so scoring margin (PyPAT) describes a team better than its W-L record.",
      notes: ['Green = better, red = worse (lower is better for Avg PA and SoS). Luck: blue = won more than expected, orange = fewer.'],
      rows: group.rows,
      cols: specCols(COLS, (col, heatVal) => cellColor(col, heatVal)),
      api: {
        path: '/standings', params: { season: standingsSeason },
        note: `Returned unsorted; this table is sorted by ${sortKey} ${direction}. SoS uses ${sosSource} opponent quality.`,
        fields: {
          Team: 'cityName + " " + displayName',
          'Avg PF': 'pointsFor / gamesPlayed, 1 dp; empty when no games played',
          'Avg PA': 'pointsAgainst / gamesPlayed, 1 dp; empty when no games played',
          PyPAT: 'pythagoreanPat × 100, 1 dp', Luck: 'winDiff',
          ...Object.fromEntries(sosCols.map(col => [col.exportLabel ?? col.label, `${col.key} × 100, 1 dp; nullable`])),
        },
      },
    }
  }

  const qualifier = {
    standings: season != null ? `${seasonLabel(season)}${gamesLabel ? ` · ${gamesLabel}` : ''} · ranked by PyPAT` : null,
    history: 'W-L, PyPAT and Luck across every season',
    weekly: season != null ? `${seasonLabel(season)} · PyPAT week by week` : null,
  }[tab]

  return (
    <div>
      <PageHeader title="Standings" qualifier={qualifier}>
        {tab !== 'history' && (
          <select
            className="field"
            aria-label="Season"
            value={season ?? ''}
            onChange={e => {
              const newSeason = Number(e.target.value)
              setSeason(newSeason)
              setSosMode(newSeason === seasons[seasons.length - 1] ? 'prev' : 'curr')
            }}
          >
            {seasons.map(s => (
              <option key={s} value={s}>Season {seasonNumber(s)}</option>
            ))}
          </select>
        )}
      </PageHeader>

      <Tabs value={tab} onChange={setTab} tabs={TABS} />

      {tab === 'history' && (historyError
        ? (
          <div className="text-bad">
            Failed to load season history.{' '}
            <button onClick={loadHistory} className="text-ink font-medium hover:text-accent">Retry</button>
          </div>
        )
        : history === null
          ? <p className="text-muted">Loading...</p>
          : <SeasonHistoryTab data={history} />)}

      {tab === 'weekly' && (season == null && error
        ? <p className="text-bad">{error}</p>
        : <WeeklyTab season={season} />)}

      {tab === 'standings' && (
        <>
          <div className="flex items-center gap-4 flex-wrap mb-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={groupByConf}
                onChange={e => setGroupByConf(e.target.checked)}
                className="accent-accent"
              />
              Group by conference
            </label>

            {sosToggleReady && (
              <div className="flex items-center gap-2 text-sm">
                <InfoTip text="SoS is calculated using opponent-adjusted PyPAT — each opponent's quality is measured without their games against the team being evaluated, so H2H results don't inflate their rating. Previous season is more reliable early in the current season before enough games have been played to produce accurate team ratings.">
                  <span className="text-muted">SoS opponent PyPAT</span>
                </InfoTip>
                <div className="flex border border-line rounded overflow-hidden">
                  {[['curr', 'This season'], ['prev', 'Prior season']].map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => setSosMode(mode)}
                      className={`px-2 py-1 text-xs font-medium ${activeSosMode === mode ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && <div className="text-bad mb-4">{error}</div>}
          {loading && <div className="text-muted">Loading...</div>}

          {!loading && !error && groups.map(group => (
            <div key={group.label ?? 'all'} className="mb-8">
              <div className="flex items-center justify-between mb-1 min-h-[1.5rem]">
                {group.label
                  ? <h2 className="font-display font-bold uppercase text-xl">{group.label}</h2>
                  : <span />}
                {standings.length > 0 && (
                  <ExportMenu spec={exportSpec(group)} />
                )}
              </div>
              <div className="overflow-x-auto border-y border-rule">
                <table className="w-full text-sm num">
                  <thead className="bg-bg">
                    <tr className="border-b border-line">
                      {groupSpans.map((g, i) => (
                        <th
                          key={i}
                          colSpan={g.span}
                          className={`px-2 pt-2 text-left text-[11px] font-bold uppercase tracking-wider text-ink ${g.start ? 'border-l border-rule' : ''}`}
                        >
                          {g.group}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-rule">
                      {COLS.map(col => (
                        <th
                          key={col.key}
                          className={`th cursor-pointer hover:text-ink${
                            col.stickyLeft ? ` sticky ${col.stickyLeft} z-20 bg-bg ${col.w ?? ''}` : ''
                          }${col.groupStart ? ' border-l border-rule' : ''}`}
                          title={col.title}
                          onClick={() => handleSort(col.key)}
                        >
                          {col.label}
                          {sortKey === col.key && (sortAsc ? ' ▲' : ' ▼')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row, i) => (
                      <tr key={row.teamId} className={`border-t border-line group ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
                        {COLS.map(col => {
                          const val = row[col.key]
                          const heatVal = col.getValue ? col.getValue(row) : val
                          const bgColor = cellColor(col, heatVal)
                          return (
                            <td
                              key={col.key}
                              className={`px-2 py-1.5 whitespace-nowrap${
                                col.stickyLeft ? ` sticky ${col.stickyLeft} z-10 ${i % 2 ? 'bg-surface' : 'bg-bg'} ${col.w ?? ''}` : ''
                              }${col.groupStart ? ' border-l border-rule' : ''}${col.key === 'displayName' ? ' font-semibold' : ''}${col.stickyLeft && col.key !== 'rank' ? ' border-r border-line' : ''}`}
                              style={bgColor ? { backgroundColor: bgColor } : undefined}
                            >
                              {col.fmt ? col.fmt(val, i, row) : val ?? '—'}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted mt-2">
                Green = better, red = worse (lower is better for Avg PA and SoS). Luck: blue = won more than expected, orange = fewer.
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
