import InfoTip from '../InfoTip'
import ExportMenu from '../ExportMenu'
import Section, { Empty, Loading } from './Section'
import { goodBadColor } from '../../utils/heat'
import { ordinal } from '../../utils/teamProfile'

const SCALE = [0, 100]

function Slider({ row }) {
  const p = row.percentile
  const fill = goodBadColor(p, SCALE) ?? 'rgb(var(--muted) / 0.25)'
  return (
    <li className="grid grid-cols-[minmax(0,7rem)_1fr_3.75rem] sm:grid-cols-[8.5rem_1fr_4rem] items-center gap-3 py-1.5 border-b border-line last:border-b-0">
      <span className="text-sm truncate"><InfoTip text={row.tip}>{row.label}</InfoTip></span>
      {p == null ? <span className="text-xs text-muted">No data</span> : (
        <div className="relative h-7" role="meter" aria-label={`${row.label} percentile`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}
          title={`${ordinal(p)} percentile · ${ordinal(row.rank.rank)} of ${row.rank.of}`}>
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-line" />
          {[25, 50, 75].map(t => <div key={t} className="absolute top-1/2 -translate-y-1/2 h-3 w-px bg-rule/30" style={{ left: `${t}%` }} />)}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full" style={{ width: `${p}%`, background: fill }} />
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full border-2 border-bg flex items-center justify-center text-[11px] font-bold num shadow-sm"
            style={{ left: `${p}%`, background: `linear-gradient(${fill}, ${fill}), rgb(var(--bg))` }}>
            {p}
          </div>
        </div>
      )}
      <span className="text-sm text-right num font-semibold">{row.text}</span>
    </li>
  )
}

export default function Fingerprint({ groups, spec, loading }) {
  const hasData = groups.some(g => g.rows.some(r => r.percentile != null))
  return (
    <Section
      id="fingerprint"
      kicker="Percentile vs the league"
      title="Team Fingerprint"
      summary="Where each number ranks against the rest of the league. Further right is always better, defense included, so a long bar is a strength and a short one a weakness."
      actions={hasData && <ExportMenu spec={spec} />}
    >
      {loading ? <Loading /> : !hasData ? <Empty>No team stats yet. Run the stat sync from Admin to fill the fingerprint.</Empty> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          {groups.map(g => (
            <div key={g.title}>
              <div className="flex items-baseline justify-between border-b border-rule pb-1 mb-1">
                <h3 className="font-display font-bold uppercase text-lg leading-none">{g.title}</h3>
                <span className="text-[11px] uppercase tracking-wide text-muted">Pctl · Value</span>
              </div>
              <ul>{g.rows.map(r => <Slider key={r.key} row={r} />)}</ul>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-3 text-xs text-muted">
        <span>Poor</span>
        <span className="h-1.5 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${goodBadColor(0, SCALE)}, rgb(var(--line)), ${goodBadColor(100, SCALE)})` }} aria-hidden="true" />
        <span>Great</span>
        <span className="sm:ml-2">Bubble is the percentile; 50 is the league median. Regular season.</span>
      </div>
    </Section>
  )
}
