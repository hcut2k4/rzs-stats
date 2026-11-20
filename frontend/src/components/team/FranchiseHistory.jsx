import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, ResponsiveContainer } from 'recharts'
import InfoTip from '../InfoTip'
import ExportMenu from '../ExportMenu'
import Section, { Empty } from './Section'
import { eloPeaks, recordText, tallyText } from '../../utils/teamProfile'
import { divergeColor, goodBadColor } from '../../utils/heat'
import { weekName } from '../../utils/playoffRounds'
import { seasonLabel, seasonNumber } from '../../utils/seasons'

const BASE = 1500
const pct = v => (v == null ? '—' : (v * 100).toFixed(1) + '%')
const signed = v => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1))

export const HISTORY_TIPS = {
  season: 'League season number.',
  record: 'Regular-season wins, losses and ties.',
  pypat: 'PythagoreanPAT win expectancy for the regular season: the share of games the team should have won from points scored and allowed.',
  luck: 'Wins above PyPAT expectation. Positive means more wins than scoring margin justified.',
  finalElo: 'Elo after the team\'s last game of that season, playoffs included.',
  finalRank: 'Elo rank among all teams after the last week of that season.',
  peakElo: 'Highest Elo the team reached at any point that season.',
  playoffs: 'Playoff record that season. Empty when the team missed the playoffs.',
}

function PointTip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="bg-bg border border-rule rounded-sm px-3 py-2 text-sm num">
      <p className="font-semibold">{seasonLabel(p.season)} · {weekName(p.week)}</p>
      <p>Elo <span className="font-semibold">{p.endElo.toFixed(0)}</span> <span className="text-muted">({p.change >= 0 ? '+' : ''}{p.change.toFixed(1)})</span></p>
      <p className="text-muted">Rank {p.rank}</p>
    </div>
  )
}

export default function FranchiseHistory({ points, seasons, allTime, spec }) {
  if (!points.length && !seasons.length) {
    return (
      <Section id="franchise" kicker="Every season" title="Franchise History"><Empty>No history yet.</Empty></Section>
    )
  }
  const data = points.map(p => ({ ...p, key: `${p.season}-${p.week}` }))
  const starts = data.filter((p, i) => i === 0 || p.season !== data[i - 1].season)
  const peaks = eloPeaks(data)
  const elos = data.map(p => p.endElo)
  const lo = Math.floor((Math.min(BASE, ...elos) - 20) / 50) * 50
  const hi = Math.ceil((Math.max(BASE, ...elos) + 20) / 50) * 50
  const step = hi - lo > 400 ? 100 : 50
  const yTicks = []
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) yTicks.push(t)
  const lucks = seasons.map(s => s.winDiff)
  const pypats = seasons.map(s => s.pythagoreanPat)
  return (
    <Section
      id="franchise"
      kicker="Every season"
      title="Franchise History"
      summary={allTime}
      actions={seasons.length > 0 && <ExportMenu spec={spec} />}
    >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <figure className="lg:col-span-3 min-w-0">
          <div className="h-64 sm:h-72" role="img" aria-label={peaks ? `Elo after every week across every season. Peak ${peaks.peak.endElo.toFixed(0)} in ${seasonLabel(peaks.peak.season)}, low ${peaks.trough.endElo.toFixed(0)} in ${seasonLabel(peaks.trough.season)}.` : 'Elo history'}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 22, right: 48, bottom: 4, left: -8 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgb(var(--line))" />
                <XAxis dataKey="key" ticks={starts.map(s => s.key)} tickFormatter={k => `S${seasonNumber(Number(k.split('-')[0]))}`} tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} stroke="rgb(var(--line))" />
                <YAxis domain={[lo, hi]} ticks={yTicks} allowDecimals={false} tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} stroke="rgb(var(--line))" />
                <ReferenceLine y={BASE} stroke="rgb(var(--rule))" strokeOpacity={0.6} label={{ value: '1500 avg', position: 'right', fill: 'rgb(var(--muted))', fontSize: 10 }} />
                {starts.slice(1).map(s => <ReferenceLine key={s.key} x={s.key} stroke="rgb(var(--muted))" strokeDasharray="3 3" />)}
                <Tooltip content={<PointTip />} />
                <Line type="monotone" dataKey="endElo" stroke="var(--team-c)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                {peaks && <ReferenceDot x={peaks.peak.key} y={peaks.peak.endElo} r={4} fill="rgb(var(--good))" stroke="rgb(var(--bg))" label={{ value: `Peak ${peaks.peak.endElo.toFixed(0)}`, position: 'top', fill: 'rgb(var(--ink))', fontSize: 11, fontWeight: 600 }} />}
                {peaks && peaks.trough.key !== peaks.peak.key && <ReferenceDot x={peaks.trough.key} y={peaks.trough.endElo} r={4} fill="rgb(var(--bad))" stroke="rgb(var(--bg))" label={{ value: `Low ${peaks.trough.endElo.toFixed(0)}`, position: 'bottom', fill: 'rgb(var(--ink))', fontSize: 11, fontWeight: 600 }} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <figcaption className="text-xs text-muted mt-1">Elo after every week. Dotted lines mark season starts, where ratings regress toward 1500.</figcaption>
        </figure>
        <div className="lg:col-span-2 overflow-x-auto border-y border-rule self-start">
          <table className="w-full text-sm num">
            <thead>
              <tr className="border-b border-rule">
                <th className="th"><InfoTip text={HISTORY_TIPS.season}>Season</InfoTip></th>
                <th className="th text-right"><InfoTip text={HISTORY_TIPS.record}>W-L</InfoTip></th>
                <th className="th text-right"><InfoTip text={HISTORY_TIPS.pypat}>PyPAT</InfoTip></th>
                <th className="th text-right"><InfoTip text={HISTORY_TIPS.luck}>Luck</InfoTip></th>
                <th className="th text-right"><InfoTip text={HISTORY_TIPS.finalElo}>Elo</InfoTip></th>
                <th className="th text-right"><InfoTip text={HISTORY_TIPS.playoffs}>Playoffs</InfoTip></th>
              </tr>
            </thead>
            <tbody>
              {[...seasons].reverse().map((s, i) => (
                <tr key={s.season} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
                  <td className="px-2 py-1.5 font-semibold">S{seasonNumber(s.season)}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">{recordText(s)}</td>
                  <td className="px-2 py-1.5 text-right" style={{ backgroundColor: goodBadColor(s.pythagoreanPat, [0.2, 0.8, ...pypats]) }}>{pct(s.pythagoreanPat)}</td>
                  <td className="px-2 py-1.5 text-right" style={{ backgroundColor: divergeColor(s.winDiff, Math.max(2, ...lucks.map(Math.abs))) }}>{signed(s.winDiff)}</td>
                  <td className="px-2 py-1.5 text-right">{s.finalElo?.toFixed(0) ?? '—'}{s.finalRank && <span className="text-muted text-xs"> #{s.finalRank}</span>}</td>
                  <td className="px-2 py-1.5 text-right">{s.playoffs ? tallyText(s.playoffs) : <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  )
}
