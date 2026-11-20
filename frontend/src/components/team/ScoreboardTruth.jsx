import InfoTip from '../InfoTip'
import ExportMenu from '../ExportMenu'
import Section, { Empty } from './Section'

const fmt = v => (Number.isInteger(v) ? String(v) : v.toFixed(1))

function verdict(actual, pypat) {
  const gap = actual - pypat
  if (Math.abs(gap) < 0.5) return 'The record is honest: wins line up with scoring margin.'
  return gap > 0
    ? `Won ${gap.toFixed(1)} more games than their scoring margin justifies. Expect some regression.`
    : `Won ${(-gap).toFixed(1)} fewer games than their scoring margin justifies. A rebound candidate.`
}

export default function ScoreboardTruth({ lanes, games, spec }) {
  if (!games) {
    return (
      <Section id="truth" kicker="Wins vs expectation" title="Truth Behind the Scoreboard">
        <Empty>No regular-season games played yet.</Empty>
      </Section>
    )
  }
  const actual = lanes[0].value
  const pos = v => `${Math.min(Math.max(v / games, 0), 1) * 100}%`
  return (
    <Section
      id="truth"
      kicker="Wins vs expectation"
      title="Truth Behind the Scoreboard"
      summary={verdict(actual, lanes[1].value)}
      actions={<ExportMenu spec={spec} />}
    >
      <div className="relative pt-1">
        <div className="absolute top-0 bottom-6 border-l-2 border-dashed border-rule/60 pointer-events-none"
          style={{ left: `calc(7rem + (100% - 7rem - 3rem) * ${Math.min(actual / games, 1)})` }} aria-hidden="true" />
        <ul className="space-y-3">
          {lanes.map(l => (
            <li key={l.key} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-0">
              <span className="text-sm pr-2"><InfoTip text={l.tip}>{l.label}</InfoTip></span>
              <div className="relative h-6" aria-hidden="true">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-line" />
                <div className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full" style={{ left: 0, width: pos(l.value), background: l.color, opacity: 0.35 }} />
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-bg" style={{ left: pos(l.value), background: l.color }} />
              </div>
              <span className="text-right font-display font-extrabold text-2xl leading-none num">{fmt(l.value)}</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-[7rem_1fr_3rem] mt-1 text-[11px] text-muted num" aria-hidden="true">
          <span />
          <div className="flex justify-between"><span>0</span><span>{games} games</span></div>
        </div>
      </div>
      <p className="text-xs text-muted mt-3">
        Regular season only. PyPAT expects wins from points scored and allowed. Elo expects them from the pregame win chance in every game, so it credits a hard schedule. The dashed line marks actual wins.
      </p>
    </Section>
  )
}
