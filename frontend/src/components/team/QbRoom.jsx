import { Link } from 'react-router-dom'
import InfoTip from '../InfoTip'
import ExportMenu from '../ExportMenu'
import Section, { Empty } from './Section'
import { goodBadColor } from '../../utils/heat'
import { neonPlayerUrl, TANYA_TIP, RUSHPLUS_TIP } from '../../pages/QbPage'

const n1 = v => (v == null ? '—' : v.toFixed(1))
const n2 = v => (v == null ? '—' : v.toFixed(2))
const signed2 = v => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2))

export const QB_COLS = [
  { key: 'rank', label: 'Lg Rk', desc: 'League TANY/A rank among qualified quarterbacks. Empty when the quarterback has not thrown enough to qualify.', fmt: v => v ?? '—', z: '0' },
  { key: 'gamesPlayed', label: 'GP', desc: 'Games played.', fmt: v => v, z: '0' },
  { key: 'passAtt', label: 'Att', desc: 'Pass attempts.', fmt: v => v, z: '0' },
  { key: 'tanya', label: 'TANY/A', desc: TANYA_TIP, fmt: n2, z: '0.00', heat: 'higher' },
  { key: 'anya', label: 'ANY/A', desc: 'Adjusted Net Yards per Attempt: passing only, no fumble term.', fmt: n2, z: '0.00', heat: 'higher' },
  { key: 'rushValue', label: 'RUSH+', desc: RUSHPLUS_TIP, fmt: signed2, z: '+0.00;-0.00;0.00', heat: 'higher' },
  { key: 'passerRating', label: 'Rating', desc: 'Passer rating from completion rate, yards per attempt, touchdown rate and interception rate.', fmt: n1, z: '0.0', heat: 'higher' },
  { key: 'passYds', label: 'Yds', desc: 'Passing yards.', fmt: v => v, z: '0' },
  { key: 'passTd', label: 'TD', desc: 'Passing touchdowns.', fmt: v => v, z: '0' },
  { key: 'passInt', label: 'INT', desc: 'Interceptions thrown.', fmt: v => v, z: '0' },
  { key: 'rushYds', label: 'Rush Yds', desc: 'Rushing yards by the quarterback.', fmt: v => v, z: '0' },
]

export default function QbRoom({ rows, league, spec, seasonText }) {
  const all = Object.fromEntries(QB_COLS.filter(c => c.heat).map(c => [c.key, league.filter(r => r.qualified).map(r => r[c.key])]))
  const color = (c, r) => (c.heat && r.qualified ? goodBadColor(r[c.key], all[c.key], c.heat) : undefined)
  return (
    <Section
      id="qbs"
      kicker={seasonText}
      title="QB Room"
      summary={rows.length ? 'Every quarterback who threw a pass for this team, colored against the qualified QBs across the league.' : null}
      actions={rows.length > 0 && <div className="flex items-center gap-3"><Link to="/qb" className="text-xs text-muted hover:text-ink">QB page →</Link><ExportMenu spec={spec} /></div>}
    >
      {!rows.length ? <Empty>No quarterback stats for this season. QB stats fill in after the QB sync runs.</Empty> : (
        <div className="overflow-x-auto border-y border-rule">
          <table className="w-full text-sm num">
            <thead>
              <tr className="border-b border-rule">
                <th className="th sticky left-0 bg-bg z-10">QB</th>
                {QB_COLS.map(c => <th key={c.key} className="th text-right"><InfoTip text={c.desc}>{c.label}</InfoTip></th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.rosterId} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'} ${r.qualified ? '' : 'text-muted'}`}>
                  <td className="px-2 py-1.5 whitespace-nowrap sticky left-0 bg-inherit">
                    <a href={neonPlayerUrl(r.rosterId)} target="_blank" rel="noreferrer" className="font-semibold hover:text-accent" title={`${r.playerName} on NeonSportz`}>{r.playerName}</a>
                    {!r.qualified && <span className="ml-1.5 text-[10px] uppercase tracking-wide">unqualified</span>}
                  </td>
                  {QB_COLS.map(c => (
                    <td key={c.key} className="px-2 py-1.5 text-right" style={{ backgroundColor: color(c, r) }}>{c.fmt(r[c.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
