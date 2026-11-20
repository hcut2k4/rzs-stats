import { Link } from 'react-router-dom'
import { TeamLogo } from '../TeamLogo'
import ExportMenu from '../ExportMenu'
import { SortTh } from '../SortTh'
import Section, { Empty } from './Section'
import { tallyText } from '../../utils/teamProfile'
import { weekName } from '../../utils/playoffRounds'
import { seasonNumber } from '../../utils/seasons'

export const RIVALRY_TIPS = {
  opp: 'Opponent. Sorts alphabetically.',
  games: 'Games played against this opponent across every season, playoffs included.',
  record: 'Wins, losses and ties against this opponent. Sorts by win percentage.',
  diff: 'Total points scored minus points allowed against this opponent.',
  ppg: 'Average points scored and allowed per game against this opponent.',
  last: 'The most recent meeting: season, week and final score, this team first.',
}

export const lastMeeting = r => `S${seasonNumber(r.last.season)} ${weekName(r.last.week)} · ${r.last.result} ${r.last.teamScore}–${r.last.oppScore}`

function WinShare({ r }) {
  const w = (r.w / r.games) * 100
  const t = (r.t / r.games) * 100
  return (
    <div className="flex h-2 w-20 rounded-full overflow-hidden bg-bad/50" aria-hidden="true">
      <div className="bg-good/80" style={{ width: `${w}%` }} />
      <div className="bg-muted/60" style={{ width: `${t}%` }} />
    </div>
  )
}

export default function Rivalries({ rows, sorter, spec }) {
  if (!rows.length) {
    return <Section id="rivalries" kicker="All-time head to head" title="Rivalries"><Empty>No games played yet.</Empty></Section>
  }
  const { sort, click } = sorter
  const th = (key, label, className = 'text-right') => <SortTh tip={RIVALRY_TIPS[key]} sortKey={key} state={sort} onSort={click} className={className}>{label}</SortTh>
  return (
    <Section
      id="rivalries"
      kicker="All-time head to head"
      title="Rivalries"
      summary={`Record against all ${rows.length} opponents faced, regular season and playoffs.`}
      actions={<ExportMenu spec={spec} />}
    >
      <div className="overflow-x-auto border-y border-rule max-h-[34rem] overflow-y-auto">
        <table className="w-full text-sm num">
          <thead className="sticky top-0 bg-bg z-10">
            <tr className="border-b border-rule">
              {th('opp', 'Opponent', 'text-left')}
              {th('games', 'G')}
              {th('record', 'Record')}
              <th className="th" aria-hidden="true" />
              {th('diff', 'Pt Diff')}
              {th('ppg', 'PF–PA / G')}
              {th('last', 'Last meeting', 'text-left')}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.opp.teamId} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <Link to={`/teams/${r.opp.abbrName}`} className="flex items-center gap-2 font-semibold hover:text-accent">
                    <TeamLogo abbr={r.opp.abbrName} size={20} />{r.opp.displayName}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-right text-muted">{r.games}</td>
                <td className="px-2 py-1.5 text-right font-semibold">{tallyText(r)}</td>
                <td className="px-2 py-1.5"><WinShare r={r} /></td>
                <td className={`px-2 py-1.5 text-right ${r.diff > 0 ? 'text-good' : r.diff < 0 ? 'text-bad' : ''}`}>{r.diff > 0 ? '+' : ''}{r.diff}</td>
                <td className="px-2 py-1.5 text-right text-muted">{(r.pf / r.games).toFixed(1)}–{(r.pa / r.games).toFixed(1)}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-muted">{lastMeeting(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}
