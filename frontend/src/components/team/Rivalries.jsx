import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TeamLogo } from '../TeamLogo'
import ExportMenu from '../ExportMenu'
import { SortTh } from '../SortTh'
import Section, { Empty, Loading } from './Section'
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

const PREVIEW = 10

export default function Rivalries({ rows, sorter, specFor, loading }) {
  const [all, setAll] = useState(false)
  if (loading || !rows.length) {
    return <Section id="rivalries" kicker="All-time head to head" title="Rivalries">{loading ? <Loading /> : <Empty>No games played yet.</Empty>}</Section>
  }
  const { sort, click } = sorter
  const shown = all ? rows : rows.slice(0, PREVIEW)
  const wide = 'hidden sm:table-cell'
  const th = (key, label, className = 'text-right') => <SortTh tip={RIVALRY_TIPS[key]} sortKey={key} state={sort} onSort={click} className={className}>{label}</SortTh>
  return (
    <Section
      id="rivalries"
      kicker="All-time head to head"
      title="Rivalries"
      summary={specFor(shown).description}
      actions={<ExportMenu spec={specFor(shown)} />}
    >
      <div className="overflow-x-auto border-y border-rule">
        <table className="w-full text-sm num">
          <thead>
            <tr className="border-b border-rule">
              {th('opp', 'Opponent', 'text-left')}
              {th('games', 'GP')}
              {th('record', 'Record')}
              <th className={`th ${wide}`} aria-hidden="true" />
              {th('diff', 'Point Diff')}
              {th('ppg', 'Pts/G For–Against', `text-right ${wide}`)}
              {th('last', 'Last meeting', `text-left ${wide}`)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.opp.teamId} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <Link to={`/teams/${r.opp.abbrName}`} className="flex items-center gap-2 font-semibold hover:text-accent">
                    <TeamLogo abbr={r.opp.abbrName} size={20} />{r.opp.displayName}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-right text-muted">{r.games}</td>
                <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{tallyText(r)}</td>
                <td className={`px-2 py-1.5 ${wide}`}><WinShare r={r} /></td>
                <td className={`px-2 py-1.5 text-right ${r.diff > 0 ? 'text-good' : r.diff < 0 ? 'text-bad' : ''}`}>{r.diff > 0 ? '+' : ''}{r.diff}</td>
                <td className={`px-2 py-1.5 text-right text-muted ${wide}`}>{(r.pf / r.games).toFixed(1)}–{(r.pa / r.games).toFixed(1)}</td>
                <td className={`px-2 py-1.5 whitespace-nowrap text-muted ${wide}`}>{lastMeeting(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PREVIEW && (
        <button type="button" onClick={() => setAll(a => !a)} aria-expanded={all}
          className="mt-2 text-xs uppercase tracking-wide font-semibold text-muted hover:text-ink">
          {all ? `Show top ${PREVIEW}` : `Show all ${rows.length} opponents`}
        </button>
      )}
    </Section>
  )
}
