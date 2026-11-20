import { Link } from 'react-router-dom'
import { TeamLogo } from '../TeamLogo'
import InfoTip from '../InfoTip'
import ExportMenu from '../ExportMenu'
import Section from './Section'
import { lean, pct0 } from '../../utils/eloLean'
import { weekName } from '../../utils/playoffRounds'

function ChanceBar({ p }) {
  return (
    <div className="relative h-2.5 w-full min-w-[80px] bg-line rounded-full" aria-hidden="true">
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${p * 100}%`, background: p >= 0.5 ? 'rgb(var(--good) / 0.7)' : 'rgb(var(--bad) / 0.6)' }} />
      <div className="absolute -inset-y-0.5 left-1/2 w-px bg-rule" />
    </div>
  )
}

export default function RoadAhead({ rows, projection, sosLeft, spec, teamHref }) {
  if (!rows.length) return null
  return (
    <Section
      id="road"
      kicker="Remaining schedule"
      title="Road Ahead"
      summary={`Elo projects ${projection.wins.toFixed(1)} wins by season's end, ${projection.remaining.toFixed(1)} of them from the ${rows.length} games left.`}
      actions={<ExportMenu spec={spec} />}
    >
      <div className="grid grid-cols-3 gap-px bg-line border-y border-line mb-3">
        {[
          ['Projected', projection.record, 'Current record plus the summed Elo win chance of every remaining game, rounded.'],
          ['Favored in', `${rows.filter(r => r.winProb >= 0.5).length} of ${rows.length}`, 'Remaining games where Elo gives this team at least a 50% chance.'],
          ['SoS Left', sosLeft.text, sosLeft.tip],
        ].map(([label, value, tip]) => (
          <div key={label} className="bg-bg px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted font-semibold"><InfoTip text={tip}>{label}</InfoTip></p>
            <p className="font-display font-extrabold text-2xl leading-none mt-1 num">{value}</p>
            {label === 'SoS Left' && sosLeft.rank && <p className="text-[11px] text-muted mt-1">{sosLeft.rank}</p>}
          </div>
        ))}
      </div>
      <ul className="text-sm num">
        {rows.map(r => {
          const l = lean(r.game)
          return (
            <li key={r.gameId ?? r.week} className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(60px,1fr)_3rem] sm:grid-cols-[5.5rem_minmax(0,1fr)_minmax(80px,1.2fr)_3rem_4.5rem] items-center gap-2 py-1.5 border-b border-line">
              <span className="text-xs text-muted whitespace-nowrap">{weekName(r.week)}</span>
              <span className="flex items-center gap-2 min-w-0">
                <TeamLogo abbr={r.opp.abbrName} size={20} />
                <Link to={teamHref(r.opp.abbrName)} className="font-semibold hover:text-accent truncate">{r.home ? 'vs' : '@'} {r.opp.abbrName}</Link>
                <span className="text-xs text-muted hidden min-[400px]:inline">{r.oppElo.toFixed(0)}</span>
              </span>
              <ChanceBar p={r.winProb} />
              <span className="text-right font-semibold">{pct0(r.winProb)}</span>
              <span className="hidden sm:block text-[11px] uppercase tracking-wide font-semibold text-center rounded px-1 py-0.5" style={{ backgroundColor: l.shade }}>{l.tier.label}</span>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted mt-2">Win chances use each team's current Elo, so later games are less certain. Outlook uses the same tiers as the Elo page.</p>
    </Section>
  )
}
