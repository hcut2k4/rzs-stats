import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getSeasons, getStandings, getSeasonTrends, getAvailableWeeks } from '../api/client'
import ClinchBadge, { useClinch, teamMarker, clinchIcons, ClinchKey } from '../components/playoffs/ClinchBadge'
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
import { latestWeek, sosVariantForWeek } from '../utils/teamProfile'
import { PYPAT_TIP, LUCK_TIP, COLOR_LEGEND } from '../utils/siteCopy'
import { useLoad } from '../utils/useLoad'

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
  const [sosMode, setSosMode] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState(null)
  const [historyError, setHistoryError] = useState(false)
  const historyRequested = useRef(false)
  const latest = seasons.length ? seasons[seasons.length - 1] : null
  const clinch = useClinch(season != null && season === latest ? season : null, 'madden')
  const weeks = useLoad(season != null && season === latest ? `weeks-${season}` : null, () => getAvailableWeeks(season, 1))

  useEffect(() => {
    getSeasons()
      .then(s => {
        setSeasons(s)
        if (s.length) {
          const defaultSeason = s[s.length - 1]
          setSeason(defaultSeason)
          setSosMode(null)
        }
      })
      .catch(() => setError("Couldn't load seasons. Try again in a moment."))
  }, [])

  useEffect(() => {
    if (season == null) return
    let current = true
    setLoading(true)
    setError(null)
    getStandings(season)
      .then(data => { if (current) { setStandings(data); setStandingsSeason(season); setLoading(false) } })
      .catch(() => { if (current) { setError("Couldn't load standings. Try again in a moment."); setLoading(false) } })
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

  const sosToggleReady = standings.some(r => r.gamesPlayed >= 3)
  const activeSosMode = sosMode ?? sosVariantForWeek(season, latest, latestWeek(weeks.data)).toLowerCase()
  const sosPrefix = activeSosMode === 'curr' ? 'Curr' : 'Prev'
  const sosSource = activeSosMode === 'curr' ? "this season's results" : "last season's results"
  const sosCols = isCurrentSeason
    ? [
        { sortKey: 'sosPlayed', key: `oppPyPat${sosPrefix}`, label: 'Played', exportLabel: `SoS Played (${sosSource})`, title: `Strength of opponents already played: their average PyPAT, leaving out their games against this team. Higher means a harder schedule. Uses ${sosSource}.` },
        { sortKey: 'sosLeft', key: `oppPyPatRemaining${sosPrefix}`, label: 'Left', exportLabel: `SoS Left (${sosSource})`, title: `Strength of remaining opponents: their average PyPAT, leaving out their games against this team. Higher means a harder schedule. Uses ${sosSource}.` },
        { sortKey: 'sosTotal', key: `oppPyPatTotal${sosPrefix}`, label: 'Total', exportLabel: `SoS Total (${sosSource})`, title: `Strength of all scheduled opponents: their average PyPAT, leaving out their games against this team. Weighted per game. Higher means a harder schedule. Uses ${sosSource}.` },
      ]
    : [
        { sortKey: 'sosPlayed', key: `oppPyPat${sosPrefix}`, label: 'SoS', exportLabel: `SoS (${sosSource})`, title: `Strength of opponents already played: their average PyPAT, leaving out their games against this team. Higher means a harder schedule. Uses ${sosSource}.` },
      ]

  const sortField = sosCols.find(col => col.sortKey === sortKey)?.key ?? sortKey
  const sorted = [...standings].sort((a, b) => {
    const getter = sortGetters[sortField]
    const av = getter ? getter(a) : a[sortField]
    const bv = getter ? getter(b) : b[sortField]
    if (av == null) return 1
    if (bv == null) return -1
    return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  const COLS = [
    { key: 'rank',           label: '#', desc: 'Row number in the current sort order. Not an official standing or playoff seed.', tx: (_, i) => i + 1, value: (_, i) => i + 1, z: '0', fmt: (_, i) => i + 1, stickyLeft: 'left-0', w: 'w-7 min-w-7 max-w-7 sm:w-10 sm:min-w-10 sm:max-w-10 overflow-hidden' },
    { key: 'displayName',    label: 'Team', logo: r => r.abbrName, desc: 'City plus nickname.', tx: (_, i, row) => `${row.cityName} ${row.displayName}`, fmt: (v, _, row) => <span className="inline-flex items-center gap-1"><TeamCell abbr={row.abbrName} name={`${row.cityName} ${row.displayName}`} short size={20} /><ClinchBadge markers={teamMarker(clinch, row.teamId)} compact /></span>, stickyLeft: 'left-7 sm:left-10' },
    { key: 'wins',           label: 'W', desc: 'Wins. A tie counts 0.5 toward expected wins.', value: r => r.wins, z: '0', group: 'Record', groupStart: true },
    { key: 'losses',         label: 'L', desc: 'Losses.', value: r => r.losses, z: '0', group: 'Record' },
    { key: 'ties',           label: 'T', desc: 'Ties. A tie counts 0.5 toward expected wins.', value: r => r.ties, z: '0', group: 'Record' },
    { key: 'winPct',         label: 'Win%', desc: 'Record win percentage. A tie counts as half a win.', value: r => r.winPct, z: '0.000', fmt: v => v.toFixed(3), heat: 'higher', group: 'Record' },
    { key: 'pointsFor',      label: 'Pts/G', desc: 'Points scored per game.', value: r => r.gamesPlayed > 0 ? pfAvg(r) : null, z: '0.0', heat: 'higher', getValue: pfAvg, group: 'Scoring', groupStart: true,
      fmt: (v, _, row) => row.gamesPlayed > 0 ? (v / row.gamesPlayed).toFixed(1) : '—' },
    { key: 'pointsAgainst',  label: 'Opp Pts/G', desc: 'Points allowed per game.', value: r => r.gamesPlayed > 0 ? paAvg(r) : null, z: '0.0', heat: 'lower',  getValue: paAvg, group: 'Scoring',
      fmt: (v, _, row) => row.gamesPlayed > 0 ? (v / row.gamesPlayed).toFixed(1) : '—' },
    { key: 'pythagoreanPat', label: 'PyPAT', desc: PYPAT_TIP, value: r => r.pythagoreanPat, z: '0.0%', fmt: pct, heat: 'higher', group: 'Advanced', groupStart: true,
      title: PYPAT_TIP },
    { key: 'winDiff',        label: 'Luck', desc: LUCK_TIP, value: r => r.winDiff, z: '+0.0;-0.0;0.0', group: 'Advanced',
      fmt: v => v != null ? (v > 0 ? '+' : '') + v.toFixed(1) : '—',
      heat: 'diverge',
      title: LUCK_TIP },
    ...sosCols.map((c, i) => ({ ...c, desc: c.title, value: r => r[c.key], z: '0.0%', fmt: pct, heat: 'lower', group: 'Strength of schedule', groupStart: i === 0 })),
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
    const sortLabel = COLS.find(col => (col.sortKey ?? col.key) === sortKey)?.label
    const direction = sortAsc ? 'ascending' : 'descending'
    return {
      name: group.label ? `Standings — ${group.label}` : 'Standings',
      qualifier: `${seasonLabel(standingsSeason)} · ${gamesLabel} · sorted by ${sortLabel} ${direction}`,
      description: "Season standings, one row per team. The site's premise is that one-score games are near-random, so points scored and allowed (PyPAT) describe a team better than its W-L record.",
      notes: [COLOR_LEGEND],
      rows: group.rows,
      cols: specCols(COLS, (col, heatVal) => cellColor(col, heatVal)),
      api: {
        path: '/standings', params: { season: standingsSeason },
        note: `Returned unsorted; this table is sorted by ${sortField} ${direction}. SoS uses ${sosSource} opponent quality.`,
        fields: {
          Team: 'cityName + " " + displayName',
          'Pts/G': 'pointsFor / gamesPlayed, 1 dp; empty when no games played',
          'Opp Pts/G': 'pointsAgainst / gamesPlayed, 1 dp; empty when no games played',
          PyPAT: 'pythagoreanPat × 100, 1 dp', Luck: 'winDiff',
          ...Object.fromEntries(sosCols.map(col => [col.exportLabel ?? col.label, `${col.key} × 100, 1 dp; nullable`])),
        },
      },
    }
  }

  const qualifier = {
    standings: season != null ? `${seasonLabel(season)}${gamesLabel ? ` · ${gamesLabel}` : ''} · ranked by PyPAT` : null,
    history: 'W-L, PyPAT and Luck across every season',
    weekly: season != null ? `${seasonLabel(season)} · Each team's PyPAT so far, after every week` : null,
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
              setSosMode(null)
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
            Couldn&apos;t load season history. Try again in a moment.{' '}
            <button onClick={loadHistory} className="text-ink font-medium hover:text-accent">Retry</button>
          </div>
        )
        : history === null
          ? <p className="text-muted">Loading…</p>
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

            {!loading && !error && standings.some(r => clinchIcons(teamMarker(clinch, r.teamId)).length) && <ClinchKey />}

            {sosToggleReady && (
              <div className="flex items-center gap-2 text-sm">
                <InfoTip text="Last season's results are more reliable early on. From Week 10 through the playoffs, this season's results are the default.">
                  <span className="text-muted">Opponent strength from</span>
                </InfoTip>
                <div className="flex border border-line rounded overflow-hidden">
                  {[['curr', 'This season'], ['prev', 'Last season']].map(([mode, label]) => (
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
          {loading && <div className="text-muted">Loading…</div>}

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
                          className={`th ${col.stickyLeft ? 'px-1 sm:px-2' : ''}${col.key !== 'rank' ? ' cursor-pointer hover:text-ink' : ''}${
                            col.stickyLeft ? ` sticky ${col.stickyLeft} z-20 bg-bg ${col.w ?? ''}` : ''
                          }${col.groupStart ? ' border-l border-rule' : ''}`}
                          title={col.title ?? col.desc}
                          onClick={col.key === 'rank' ? undefined : () => handleSort(col.sortKey ?? col.key)}
                        >
                          {col.label}
                          {col.key !== 'rank' && sortKey === (col.sortKey ?? col.key) && (sortAsc ? ' ▲' : ' ▼')}
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
                              className={`${col.stickyLeft ? 'px-1 sm:px-2' : 'px-2'} py-1.5 whitespace-nowrap${
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
                {COLOR_LEGEND}
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
