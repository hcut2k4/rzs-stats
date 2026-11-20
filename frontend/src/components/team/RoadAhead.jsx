import { outlookTip } from '../../utils/teamProfileCopy'
import { Link } from 'react-router-dom'
import { TeamLogo } from '../TeamLogo'
import InfoTip from '../InfoTip'
import ExportMenu from '../ExportMenu'
import Section, { Loading } from './Section'
import { lean, pct0 } from '../../utils/eloLean'
import { weekName } from '../../utils/playoffRounds'

const ROW = 'grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(60px,1fr)_2.75rem] sm:grid-cols-[5.5rem_minmax(0,1fr)_3rem_minmax(80px,1.2fr)_2.75rem_6.5rem] items-center gap-2'

function ChanceBar({ p }) {
  return (
    <div className="relative h-2.5 w-full bg-line rounded-full" aria-hidden="true">
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${p * 100}%`, background: p >= 0.5 ? 'rgb(var(--good) / 0.7)' : 'rgb(var(--bad) / 0.6)' }} />
      <div className="absolute -inset-y-0.5 left-1/2 w-px bg-rule" />
    </div>
  )
}

export default function RoadAhead({ rows, projection, sosLeft, spec, teamHref, loading }) {
  if (loading) return <Section id="road" kicker="Remaining schedule" title="Road Ahead"><Loading /></Section>
  return (
    <Section
      id="road"
      kicker="Remaining schedule"
      title="Road Ahead"
      summary={spec.description}
      actions={<ExportMenu spec={spec} />}
    >
      <div className="grid grid-cols-3 gap-px bg-line border-y border-line mb-3">
        {[
          ['Projected record', projection.record, 'Current record plus the Elo win probability of every remaining game, rounded to whole games. Ties so far are kept.', null],
          ['Favored in', `${rows.filter(r => r.winProb >= 0.5).length} of ${rows.length}`, 'Remaining games where Elo gives this team at least a 50% win probability.', null],
          ['Remaining SoS', sosLeft.text, sosLeft.tip, sosLeft.rank],
        ].map(([label, value, tip, sub]) => (
          <div key={label} className="bg-bg px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted font-semibold"><InfoTip text={tip}>{label}</InfoTip></p>
            <p className="font-display font-extrabold text-2xl leading-none mt-1 num">{value}</p>
            {sub && <p className="text-[11px] text-muted mt-1">{sub}</p>}
          </div>
        ))}
      </div>
      <div className={`${ROW} border-b border-rule pb-1`}>
        <span className="th px-0">Week</span>
        <span className="th px-0">Opponent</span>
        <span className="th px-0 hidden sm:block text-right">Elo</span>
        <span className="th px-0">Win probability</span>
        <span />
        <span className="th px-0 hidden sm:block text-center"><InfoTip text={outlookTip()}>Outlook</InfoTip></span>
      </div>
      <ul className="text-sm num">
        {rows.map(r => {
          const l = lean(r.game)
          return (
            <li key={r.gameId ?? r.week} className={`${ROW} py-1.5 border-b border-line`}>
              <span className="text-xs text-muted whitespace-nowrap">{weekName(r.week)}</span>
              <span className="flex items-center gap-2 min-w-0">
                <TeamLogo abbr={r.opp.abbrName} size={20} />
                <Link to={teamHref(r.opp.abbrName)} className="font-semibold hover:text-accent truncate">{r.home ? 'vs' : '@'} {r.opp.abbrName}</Link>
              </span>
              <span className="text-xs text-muted text-right hidden sm:block">{r.oppElo.toFixed(0)}</span>
              <ChanceBar p={r.winProb} />
              <span className="text-right font-semibold">{pct0(r.winProb)}</span>
              <span className="hidden sm:block text-[11px] uppercase tracking-wide font-semibold text-center text-muted rounded border border-line bg-surface px-1 py-0.5 whitespace-nowrap"
                title={outlookTip()}>
                {l.tossUp ? l.tier.label : `${l.tier.label} ${r.winProb >= 0.5 ? 'win' : 'loss'}`}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted mt-2">{spec.notes[0]}</p>
    </Section>
  )
}
