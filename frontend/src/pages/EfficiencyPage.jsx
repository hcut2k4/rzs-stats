import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine, ResponsiveContainer } from 'recharts'
import { getSeasons, getEfficiency } from '../api/client'
import PageHeader from '../components/PageHeader'
import Tabs from '../components/Tabs'
import ExportMenu from '../components/ExportMenu'
import { TeamCell } from '../components/TeamLogo'
import { SortTh, useSorter } from '../components/SortTh'
import { goodBadColor, divergeColor } from '../utils/heat'
import { copyChartImage } from '../utils/chartImage'
import { teamLogoUrl } from '../utils/teamLogo'
import { seasonLabel, seasonNumber } from '../utils/seasons'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'offense', label: 'Offense' },
  { value: 'defense', label: 'Defense' },
]
const TAB_VALUES = TABS.map(t => t.value)

const STAGES = [
  { value: 'regular', label: 'Regular' },
  { value: 'playoffs', label: 'Playoffs' },
  { value: 'both', label: 'Both' },
]

const DASH = '—'
const n2 = v => (v == null ? DASH : v.toFixed(2))
const pct = v => (v == null ? DASH : (v * 100).toFixed(1) + '%')
const signed = v => (v == null ? DASH : (v > 0 ? '+' : '') + v.toFixed(2))
const perGame = (v, g) => (g ? (v / g).toFixed(1) : DASH)

const METRICS = [
  {
    key: 'pointsPerDrive', label: 'Pts/Drive', fmt: n2, better: 'higher',
    off: 'Points the offense scored per drive. Only the offense\'s own points count: touchdowns, field goals and the extra points that followed its touchdowns. Higher is better. Drives are estimated, see About.',
    def: 'Points opposing offenses scored per drive against this defense. Defensive and return touchdowns are not charged to it. Lower is better.',
  },
  {
    key: 'pointsPerPlay', label: 'Pts/Play', fmt: n2, better: 'higher',
    off: 'Points the offense scored per play (pass attempts, rushes and sacks taken). The closest stand-in we have for EPA per play. Higher is better.',
    def: 'Points opposing offenses scored per play against this defense. Lower is better.',
  },
  {
    key: 'yardsPerPlay', label: 'Yds/Play', fmt: n2, better: 'higher',
    off: 'Net yards gained per play. Higher is better.',
    def: 'Net yards opposing offenses gained per play. Lower is better.',
  },
  {
    key: 'seriesRate', label: 'Series %', fmt: pct, better: 'higher',
    off: 'Share of series that kept the chains moving or scored. Every first down and every drive\'s final series counts as a series; first downs and touchdowns are the successes. Higher is better.',
    def: 'Share of opposing series that kept the chains moving or scored. Lower is better.',
  },
  {
    key: 'thirdDownRate', label: '3rd %', fmt: pct, better: 'higher',
    off: 'Third downs converted divided by third downs attempted. Higher is better.',
    def: 'Third downs opponents converted against this defense. Lower is better.',
  },
  {
    key: 'redZoneTdRate', label: 'RZ TD %', fmt: pct, better: 'higher',
    off: 'Red-zone trips that ended in a touchdown. Higher is better.',
    def: 'Opposing red-zone trips that ended in a touchdown. Lower is better.',
  },
  {
    key: 'giveawayRate', label: 'TO/Drive', fmt: n2, better: 'lower',
    off: 'Interceptions plus lost fumbles per drive. Lower is better.',
    def: 'Takeaways per opposing drive: interceptions plus fumbles recovered by this defense. Higher is better.',
  },
  {
    key: 'sackRate', label: 'Sack %', fmt: pct, better: 'lower',
    off: 'Share of dropbacks that ended in a sack taken. Lower is better.',
    def: 'Share of opposing dropbacks this defense sacked. Higher is better.',
  },
]

const TIPS = {
  rank: 'Position when all teams are ranked by net points per drive, highest first.',
  team: 'Team name. Sorts alphabetically.',
  games: 'Games counted. A game counts only when both teams have stats.',
  net: 'Offense points per drive minus defense points per drive. Positive means the team outscores its opponents on a per-possession basis, which is the best single read on how well it plays.',
  offPpd: 'Points the offense scored per drive. Higher is better.',
  defPpd: 'Points opponents scored per drive against the defense. Lower is better.',
  offPpp: 'Points the offense scored per play. Higher is better.',
  defPpp: 'Points opponents scored per play against the defense. Lower is better.',
  drivesPg: 'Estimated offensive drives per game. Context, not good or bad.',
  playsPg: 'Offensive plays per game. Context, not good or bad.',
}

const flip = better => (better === 'higher' ? 'lower' : 'higher')

const EFFICIENCY_NOTES = [
  'Season figures sum components across games then divide once, so they are never averages of per-game rates. Do not average the column.',
  'A rate with a zero denominator is null/empty, not 0.',
  'Drives are estimated from how drives ended and exclude end-of-half kneel-downs and clock-outs.',
  "Only the offense's own points count, so return and defensive touchdowns are charged to neither side.",
  "Defense is the same formulas applied to the opponent's row in the same game, and a game counts only when both teams have a row.",
  'No opponent adjustment yet (raw).',
]

function efficiencySpec(rows, cols, request, tab, sortLabel, sort) {
  return {
    name: `Efficiency ${tab}`,
    qualifier: `${seasonLabel(request.season)} · ${STAGES.find(s => s.value === request.stage).label} · ${Math.max(...rows.map(r => r.games))} games played · ${tab} · sorted by ${sortLabel} ${sort.asc ? 'ascending' : 'descending'}`,
    description: 'One row per team with season efficiency rebuilt from game box-score totals.',
    notes: EFFICIENCY_NOTES,
    rows, cols,
    api: { path: '/efficiency', params: request, fields: Object.fromEntries(cols.map(c => [c.label, c.field])) },
  }
}

function sideSpec(side, rows, columns, all, getters, request, sort) {
  const cols = [
    { label: 'Team', desc: TIPS.team, text: r => r.displayName, field: 'displayName', align: 'left' },
    { label: 'G', desc: TIPS.games, text: r => String(r.games), value: r => r.games, z: '0', field: 'games' },
    { label: 'Drives/G', desc: TIPS.drivesPg, text: r => perGame(r[side].drives, r.games), value: getters.drivesPg, z: '0.0', field: `${side}.drives / games` },
    { label: 'Plays/G', desc: TIPS.playsPg, text: r => perGame(r[side].plays, r.games), value: getters.playsPg, z: '0.0', field: `${side}.plays / games` },
    ...columns.map(c => ({
      label: c.label, desc: c.tip, text: r => c.fmt(r[side][c.key]), value: r => r[side][c.key],
      z: c.fmt === pct ? '0.0%' : '0.00',
      color: r => goodBadColor(r[side][c.key], all[c.key], c.better), field: `${side}.${c.key}`,
    })),
  ]
  const sortLabel = { team: 'Team', games: 'G', drivesPg: 'Drives/G', playsPg: 'Plays/G' }[sort.key] ?? columns.find(c => c.key === sort.key).label
  return efficiencySpec(rows, cols, request, side === 'defense' ? 'Defense' : 'Offense', sortLabel, sort)
}

function ChartTip({ active, payload }) {
  if (!active || !payload?.length) return null
  const t = payload[0].payload
  return (
    <div className="bg-bg border border-rule rounded-sm px-3 py-2 text-sm num">
      <p className="font-semibold">{t.name}</p>
      <p>Offense <span className="font-semibold">{n2(t.x)}</span> pts/drive</p>
      <p>Defense <span className="font-semibold">{n2(t.y)}</span> pts/drive allowed</p>
      <p className="text-muted">Net {signed(t.x - t.y)}</p>
    </div>
  )
}

// Not named `size`: Recharts passes its own symbol `size` to custom scatter shapes and would override it.
const LogoDot = ({ cx, cy, payload, logoSize }) => (
  cx == null ? null : <image href={teamLogoUrl(payload.abbr)} x={cx - logoSize / 2} y={cy - logoSize / 2} width={logoSize} height={logoSize} />
)

// Two short lines per corner, so the labels of neighboring quadrants cannot collide on a narrow screen.
function QuadrantLabel({ viewBox, lines, right, bottom }) {
  if (!viewBox) return null
  const x = right ? viewBox.x + viewBox.width - 8 : viewBox.x + 8
  const first = bottom ? viewBox.y + viewBox.height - 8 - (lines.length - 1) * 15 : viewBox.y + 18
  return (
    <text textAnchor={right ? 'end' : 'start'} fill="rgb(var(--muted))" fontSize={12} fontWeight={600}>
      {lines.map((line, i) => <tspan key={line} x={x} y={first + i * 15}>{line}</tspan>)}
    </text>
  )
}

function TiersChart({ rows, name, qualifier }) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const timer = useRef()
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; clearTimeout(timer.current) }
  }, [])
  const [logoSize, setLogoSize] = useState(44)
  const points = rows
    .filter(r => r.offense.pointsPerDrive != null && r.defense.pointsPerDrive != null)
    .map(r => ({ x: r.offense.pointsPerDrive, y: r.defense.pointsPerDrive, abbr: r.abbrName, name: r.displayName }))
  if (!points.length) return null
  // Every point scored is a point allowed, so one league figure (total points over total drives) is both the offense and the defense average.
  const totals = rows.reduce((t, r) => (r.offense.pointsPerDrive == null ? t : { points: t.points + r.offense.pointsPerDrive * r.offense.drives, drives: t.drives + r.offense.drives }), { points: 0, drives: 0 })
  const league = totals.points / totals.drives
  const scale = key => {
    const vals = points.map(p => p[key])
    const lo = Math.floor((Math.min(...vals) - 0.1) * 2) / 2
    const hi = Math.ceil((Math.max(...vals) + 0.1) * 2) / 2
    const ticks = []
    for (let t = lo; t <= hi + 1e-9; t += 0.5) ticks.push(t)
    return { domain: [lo, hi], ticks }
  }
  const xScale = scale('x')
  const yScale = scale('y')
  const exportChart = async () => {
    clearTimeout(timer.current)
    setBusy(true)
    let message
    try {
      const result = await copyChartImage({ name: `${name} chart`, qualifier, points, league, xScale, yScale })
      message = result === 'toobig' ? 'Too big' : result === 'copied' ? 'Copied' : 'Saved'
    } catch {
      message = 'Failed'
    }
    if (!mounted.current) return
    setBusy(false)
    setStatus(message)
    timer.current = setTimeout(() => setStatus(null), 1600)
  }
  const axis = { type: 'number', tick: { fill: 'rgb(var(--muted))', fontSize: 12 }, stroke: 'rgb(var(--line))', tickFormatter: v => v.toFixed(1) }
  return (
    <>
      <div className="flex justify-end mb-2">
        <button type="button" disabled={busy} onClick={exportChart}
          className="px-2 py-1 text-xs text-muted hover:text-ink" title="Copy an image of this chart">
          {status ?? 'PNG'}
        </button>
        <span className="sr-only" aria-live="polite">{status}</span>
      </div>
      <figure className="mb-6">
        <div className="h-[480px] sm:h-[600px]" role="img" aria-label="Scatter of offense points per drive against defense points per drive allowed, one team logo per point, split into four quadrants at the league average. Teams in the upper right, with good offense and good defense, are best.">
          <ResponsiveContainer width="100%" height="100%" onResize={width => setLogoSize(width < 520 ? 28 : 44)}>
            <ScatterChart margin={{ top: 12, right: 24, bottom: 28, left: 8 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--line))" />
              <XAxis {...axis} dataKey="x" domain={xScale.domain} ticks={xScale.ticks} label={{ value: 'Offense points per drive → better', position: 'insideBottom', offset: -16, fill: 'rgb(var(--muted))', fontSize: 12 }} />
              <YAxis {...axis} dataKey="y" domain={yScale.domain} ticks={yScale.ticks} reversed label={{ value: 'Defense points allowed per drive → better', angle: -90, position: 'insideLeft', offset: 12, fill: 'rgb(var(--muted))', fontSize: 12, style: { textAnchor: 'middle' } }} />
              <ReferenceArea x1={xScale.domain[0]} x2={league} y1={yScale.domain[0]} y2={league} fill="none" stroke="none" label={<QuadrantLabel lines={['Bad offense', 'Good defense']} />} />
              <ReferenceArea x1={league} x2={xScale.domain[1]} y1={yScale.domain[0]} y2={league} fill="none" stroke="none" label={<QuadrantLabel lines={['Good offense', 'Good defense']} right />} />
              <ReferenceArea x1={xScale.domain[0]} x2={league} y1={league} y2={yScale.domain[1]} fill="none" stroke="none" label={<QuadrantLabel lines={['Bad offense', 'Bad defense']} bottom />} />
              <ReferenceArea x1={league} x2={xScale.domain[1]} y1={league} y2={yScale.domain[1]} fill="none" stroke="none" label={<QuadrantLabel lines={['Good offense', 'Bad defense']} right bottom />} />
              <ReferenceLine x={league} stroke="rgb(var(--muted))" strokeDasharray="4 4" />
              <ReferenceLine y={league} stroke="rgb(var(--muted))" strokeDasharray="4 4" />
              <Tooltip content={<ChartTip />} cursor={false} />
              <Scatter data={points} shape={<LogoDot logoSize={logoSize} />} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <figcaption className="text-xs text-muted mt-1">Dashed lines mark the league average points per drive, which is the same for offense and defense. Good offense is to the right and good defense is up, so the best teams sit in the upper right.</figcaption>
      </figure>
    </>
  )
}

function OverviewTab({ rows, request }) {
  const { sort, click, apply } = useSorter({ key: 'net', asc: false })
  const rankOf = useMemo(() => new Map(rows.map((r, i) => [r.teamId, i + 1])), [rows])
  const maxNet = Math.max(1, ...rows.map(r => Math.abs(r.netPointsPerDrive ?? 0)))
  const sorted = apply(rows, {
    rank: r => rankOf.get(r.teamId),
    team: r => r.displayName,
    games: r => r.games,
    net: r => r.netPointsPerDrive,
    offPpd: r => r.offense.pointsPerDrive,
    defPpd: r => r.defense.pointsPerDrive,
    offPpp: r => r.offense.pointsPerPlay,
    defPpp: r => r.defense.pointsPerPlay,
  })
  const cols = [
    { label: '#', key: 'rank', field: 'Position in the response ranked by netPointsPerDrive descending', text: r => String(rankOf.get(r.teamId)), value: r => rankOf.get(r.teamId), z: '0' },
    { label: 'Team', key: 'team', field: 'displayName', text: r => r.displayName, align: 'left' },
    { label: 'G', key: 'games', field: 'games', text: r => String(r.games), value: r => r.games, z: '0' },
    { label: 'Net Pts/Drive', key: 'net', field: 'netPointsPerDrive', text: r => signed(r.netPointsPerDrive), value: r => r.netPointsPerDrive, z: '+0.00;-0.00;0.00', color: r => divergeColor(r.netPointsPerDrive, maxNet) },
    ...[
      ['Off Pts/Drive', 'offPpd', 'offense', 'pointsPerDrive'],
      ['Def Pts/Drive', 'defPpd', 'defense', 'pointsPerDrive'],
      ['Off Pts/Play', 'offPpp', 'offense', 'pointsPerPlay'],
      ['Def Pts/Play', 'defPpp', 'defense', 'pointsPerPlay'],
    ].map(([label, key, side, field]) => ({ label, key, field: `${side}.${field}`, text: r => n2(r[side][field]), value: r => r[side][field], z: '0.00' })),
  ].map(c => ({ ...c, desc: TIPS[c.key] }))
  const spec = efficiencySpec(sorted, cols, request, 'Overview', cols.find(c => c.key === sort.key).label, sort)
  const th = (key, label, className = 'text-right') => (
    <SortTh tip={TIPS[key]} sortKey={key} state={sort} onSort={click} className={className}>{label}</SortTh>
  )
  return (
    <div>
      <TiersChart rows={rows} name={spec.name} qualifier={spec.qualifier} />
      <div className="flex justify-end mb-2"><ExportMenu spec={spec} /></div>
      <div className="overflow-x-auto border-y border-rule">
        <table className="w-full text-sm num">
          <thead>
            <tr className="border-b border-rule">
              {th('rank', '#', 'w-10 text-left')}
              {th('team', 'Team', 'text-left')}
              {th('games', 'G')}
              {th('net', 'Net Pts/Drive')}
              {th('offPpd', 'Off Pts/Drive')}
              {th('defPpd', 'Def Pts/Drive')}
              {th('offPpp', 'Off Pts/Play')}
              {th('defPpp', 'Def Pts/Play')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.teamId} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
                <td className="px-2 py-1.5">{rankOf.get(r.teamId)}</td>
                <td className="px-2 py-1.5 font-semibold whitespace-nowrap"><TeamCell abbr={r.abbrName} name={r.displayName} /></td>
                <td className="px-2 py-1.5 text-right text-muted">{r.games}</td>
                <td className="px-2 py-1.5 text-right font-semibold" style={{ backgroundColor: divergeColor(r.netPointsPerDrive, maxNet) }}>{signed(r.netPointsPerDrive)}</td>
                <td className="px-2 py-1.5 text-right">{n2(r.offense.pointsPerDrive)}</td>
                <td className="px-2 py-1.5 text-right">{n2(r.defense.pointsPerDrive)}</td>
                <td className="px-2 py-1.5 text-right">{n2(r.offense.pointsPerPlay)}</td>
                <td className="px-2 py-1.5 text-right">{n2(r.defense.pointsPerPlay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted mt-2">
        Net points per drive is offense minus defense, counting only points each unit produced or allowed itself. Drives and plays are estimated from box-score totals; the About page has the formulas.
      </p>
    </div>
  )
}

function SideTab({ rows, side, request }) {
  const isDefense = side === 'defense'
  const { sort, click, apply } = useSorter({ key: 'pointsPerDrive', asc: isDefense })
  const columns = METRICS.map(m => ({ ...m, better: isDefense ? flip(m.better) : m.better, tip: isDefense ? m.def : m.off }))
  const getters = {
    team: r => r.displayName,
    games: r => r.games,
    drivesPg: r => (r.games ? r[side].drives / r.games : null),
    playsPg: r => (r.games ? r[side].plays / r.games : null),
    ...Object.fromEntries(columns.map(c => [c.key, r => r[side][c.key]])),
  }
  const sorted = apply(rows, getters)
  const all = Object.fromEntries(columns.map(c => [c.key, rows.map(r => r[side][c.key])]))
  const spec = sideSpec(side, sorted, columns, all, getters, request, sort)
  return (
    <div>
      <div className="flex justify-end mb-2"><ExportMenu spec={spec} /></div>
      <div className="overflow-x-auto border-y border-rule">
        <table className="w-full text-sm num">
          <thead>
            <tr className="border-b border-rule">
              <SortTh tip={TIPS.team} sortKey="team" state={sort} onSort={click} className="sticky left-0 z-10 bg-bg">Team</SortTh>
              <SortTh tip={TIPS.games} sortKey="games" state={sort} onSort={click} className="text-right">G</SortTh>
              <SortTh tip={TIPS.drivesPg} sortKey="drivesPg" state={sort} onSort={click} className="text-right">Drives/G</SortTh>
              <SortTh tip={TIPS.playsPg} sortKey="playsPg" state={sort} onSort={click} className="text-right">Plays/G</SortTh>
              {columns.map(c => (
                <SortTh key={c.key} tip={c.tip} sortKey={c.key} state={sort} onSort={click} className="text-right">{c.label}</SortTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.teamId} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
                <td className="px-2 py-1.5 font-semibold whitespace-nowrap sticky left-0 bg-inherit"><TeamCell abbr={r.abbrName} name={r.displayName} /></td>
                <td className="px-2 py-1.5 text-right text-muted">{r.games}</td>
                <td className="px-2 py-1.5 text-right text-muted">{perGame(r[side].drives, r.games)}</td>
                <td className="px-2 py-1.5 text-right text-muted">{perGame(r[side].plays, r.games)}</td>
                {columns.map(c => (
                  <td key={c.key} className="px-2 py-1.5 text-right" style={{ backgroundColor: goodBadColor(r[side][c.key], all[c.key], c.better) }}>
                    {c.fmt(r[side][c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted mt-2">
        {isDefense
          ? 'Every figure is what opposing offenses did against this team, so low is good except takeaways and sacks. Green is better and red is worse within the column.'
          : 'Green is better and red is worse within each column. Turnovers and sacks taken are better when low.'}
      </p>
    </div>
  )
}

export default function EfficiencyPage() {
  const [params, setParams] = useSearchParams()
  const tab = TAB_VALUES.includes(params.get('tab')) ? params.get('tab') : 'overview'
  const setTab = next => setParams(prev => {
    const p = new URLSearchParams(prev)
    next === 'overview' ? p.delete('tab') : p.set('tab', next)
    return p
  }, { replace: true })

  const [seasons, setSeasons] = useState([])
  const [season, setSeason] = useState(null)
  const [stage, setStage] = useState('regular')
  const [{ rows, request }, setData] = useState({ rows: [], request: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    getSeasons()
      .then(s => {
        if (!live) return
        setSeasons(s)
        if (s.length) setSeason(s[s.length - 1])
        else setLoading(false)
      })
      .catch(() => { if (live) { setError('Could not load seasons.'); setLoading(false) } })
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (season == null) return
    let live = true
    setLoading(true)
    setError(null)
    getEfficiency(season, stage)
      .then(d => { if (live) setData({ rows: d, request: { season, stage } }) })
      .catch(() => { if (live) { setData({ rows: [], request: null }); setError('Could not load efficiency stats.') } })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [season, stage])

  const qualifier = season == null ? null : [
    seasonLabel(season),
    stage === 'regular' ? null : STAGES.find(s => s.value === stage).label,
    rows.length ? `${Math.max(...rows.map(r => r.games))} games played` : null,
    { overview: 'ranked by net points per drive', offense: 'what each offense did with the ball', defense: 'what opposing offenses did against each defense' }[tab],
  ].filter(Boolean).join(' · ')

  return (
    <div>
      <PageHeader
        title="Efficiency"
        qualifier={qualifier}
        takeaway="Points per drive judges each offense and defense only on what it did with the ball, not on the final score or the luck of a pick-six."
      >
        <select className="field" aria-label="Season" value={season ?? ''} onChange={e => setSeason(Number(e.target.value))}>
          {seasons.map(s => <option key={s} value={s}>Season {seasonNumber(s)}</option>)}
        </select>
        <div className="flex border border-line rounded overflow-hidden">
          {STAGES.map(s => (
            <button
              key={s.value}
              onClick={() => setStage(s.value)}
              aria-pressed={stage === s.value}
              className={`px-2 py-1 text-xs font-medium ${stage === s.value ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </PageHeader>

      <Tabs value={tab} onChange={setTab} tabs={TABS} />

      {error && <p className="text-bad">{error}</p>}
      {loading && !error && <p className="text-muted">Loading...</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="text-muted">No team stats yet {DASH} run the stat sync from Admin.</p>
      )}
      {!loading && !error && rows.length > 0 && (
        <>
          {tab === 'overview' && <OverviewTab rows={rows} request={request} />}
          {tab === 'offense' && <SideTab rows={rows} request={request} side="offense" />}
          {tab === 'defense' && <SideTab rows={rows} request={request} side="defense" />}
        </>
      )}
    </div>
  )
}
