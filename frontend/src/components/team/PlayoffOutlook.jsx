import { playoffOutlookImage } from './images'
import { Link } from 'react-router-dom'
import PlayoffError from '../playoffs/PlayoffError'
import ClinchBadge, { teamMarker, markerOdds, markerValue, clinchTexts } from '../playoffs/ClinchBadge'
import { getPlayoffOdds, getPlayoffPicture, getPlayoffLeverage, getPlayoffChampionship, getPlayoffOddsHistory, getPlayoffClinch } from '../../api/client'
import { usePlayoffLoad } from '../../utils/usePlayoffLoad'
import { GOALS, formatOdds, probShade, chanceShade, swingShade, swingPoints } from '../../utils/playoffOdds'
import { seasonLabel } from '../../utils/seasons'
import { ordinal, recordText } from '../../utils/teamProfile'
import { weekName } from '../../utils/playoffRounds'
import { SeedBar } from '../playoffs/SeedBar'
import SeedLegend from '../playoffs/SeedLegend'
import { TeamLogo } from '../TeamLogo'
import PlayoffDataTable from './PlayoffDataTable'
import PlayoffMomentum, { snapshotLabel } from './PlayoffMomentum'
import Section from './Section'

const STAGES = [['playoffs', 'Make playoffs'], ['round2', 'Reach round 2'], ['conferenceFinal', 'Conference final'], ['final', 'Super Bowl'], ['champion', 'Champion']]

export default function PlayoffOutlook({ teamId, team, season, nextWeek }) {
  const odds = usePlayoffLoad(`playoffs-odds-${season}-madden`, () => getPlayoffOdds(season, 'madden'))
  const row = odds.data?.conferences?.flatMap(c => c.teams).find(r => r.team.teamId === teamId)
  const picture = usePlayoffLoad(row ? `playoffs-picture-${season}-madden` : null, () => getPlayoffPicture(season, 'madden'))
  const week = odds.data ? odds.data.nextWeek : nextWeek
  const leverage = usePlayoffLoad(row && week != null ? `playoffs-leverage-${season}-madden-${week}` : null, () => getPlayoffLeverage(season, week, 'madden'))
  const championship = usePlayoffLoad(row ? `playoffs-championship-${season}-madden` : null, () => getPlayoffChampionship(season, 'madden'))
  const history = usePlayoffLoad(row ? `playoffs-history-${season}` : null, () => getPlayoffOddsHistory(season))
  const clinch = usePlayoffLoad(row ? `playoffs-clinch-${season}-madden` : null, () => getPlayoffClinch(season, 'madden'))
  if (odds.error?.response?.status === 404 || odds.error?.status === 404) return null
  if (odds.error) return <Section id="playoff-outlook" title="Playoff outlook"><PlayoffError error={odds.error} retry={odds.retry}>Playoff probability unavailable.</PlayoffError></Section>
  if (!row) return null
  const markers = teamMarker(clinch.data, teamId)
  const probability = markerValue(row.odds.playoffs, markers?.playoffs)
  const title = championship.data?.teams?.find(r => r.team.teamId === teamId)
  const standing = picture.data?.conferences?.flatMap(c => [...c.seeds, ...c.hunt]).find(r => r.team.teamId === teamId)
  const finished = odds.data.nextWeek === null
  const status = standing ? standing.seed ? `${ordinal(standing.seed)} seed (${standing.divisionWinner ? 'division winner' : 'wild card'})` : `Outside the field (rank ${standing.rank})` : null
  const game = leverage.data?.games?.find(g => g.teams.some(t => t.team.teamId === teamId))
  const next = game?.teams.find(t => t.team.teamId === teamId)
  const opp = next && (next.side === 'home' ? game.away : game.home)
  const rank = game ? [...leverage.data.games].sort((a, b) => b.importance.playoffs - a.importance.playoffs).findIndex(g => g.gameId === game.gameId) + 1 : null
  const story = `${recordText(row)}${standing ? standing.seed ? ` and currently a ${standing.divisionWinner ? 'division winner' : 'wild card'}` : ` and outside the playoff field` : ''}${next ? `; a win over ${opp.displayName} in ${weekName(week)} gives them a ${formatOdds(next.ifWin.playoffs)} playoff probability, while a loss leaves ${formatOdds(next.ifLoss.playoffs)}` : finished ? ' at the end of the regular season' : ` with a ${markerOdds(row.odds.playoffs, markers?.playoffs)} playoff probability`}.`
  const points = (history.data?.snapshots ?? []).slice().sort((a, b) => (a.week ?? Infinity) - (b.week ?? Infinity)).map(s => ({ week: s.week, p: s.teams.find(r => r.team.teamId === teamId)?.playoffs })).filter(s => s.p != null)
  const rows = GOALS.map(g => ({ ...g, current: markerValue(row.odds[g.value], markers?.[g.value]), marker: markers?.[g.value], ...(next ? { loss: next.ifLoss[g.value], win: next.ifWin[g.value], swing: swingPoints(next, g.value) } : {}) }))
  if (title) rows.push(...STAGES.slice(1).map(([value, label]) => ({ value, label, current: title[value] })))
  const cols = [
    { label: 'Goal', desc: 'Postseason outcome.', text: r => r.label },
    ...[['current', 'Current'], ...(next ? [['loss', 'If lose'], ['win', 'If win']] : [])].map(([key, label]) => ({ label, desc: `${label} probability.`, text: r => formatOdds(r[key], key === 'current' && !!r.marker), value: r => r[key], z: '0%', color: r => (r.value === 'playoffs' ? probShade : chanceShade)(r[key]) })),
    ...(next ? [{ label: 'Swing', desc: 'Win minus loss probability, in percentage points.', text: r => r.swing == null ? '—' : `${Math.round(r.swing)} pp`, value: r => r.swing, z: '0" pp"', color: r => swingShade(r.swing) }] : []),
  ]
  const spec = { name: `${row.team.displayName} playoff outlook`, qualifier: seasonLabel(odds.data.season), description: 'Current postseason probabilities and next-game scenarios when available. Title chances are a pre-playoff projection after the regular season ends.', rows, cols,
    image: playoffOutlookImage({ team: team ?? row.team, probability, probabilityText: markerOdds(row.odds.playoffs, markers?.playoffs), badges: clinchTexts(markers), status, finished, story, stages: STAGES.map(([key, label]) => { const p = key === 'playoffs' ? markerValue(title?.playoffs ?? row.odds.playoffs, markers?.playoffs) : title?.[key]; return { label, p, text: formatOdds(p, key === 'playoffs' && !!markers?.playoffs) } }), preplayoff: finished || championship.data?.preplayoff, seedOdds: row.seedOdds, points, next, opp, week, rank }),
    api: { path: '/playoffs/odds', params: { season: odds.data.season, rules: odds.data.rules }, fields: { Current: 'odds.playoffs, odds.division, odds.oneSeed; championship teams[].round2, conferenceFinal, final, champion' }, note: `This team only. Title stages: GET /api/playoffs/championship?season=${odds.data.season}&rules=madden. ${next ? `Scenarios: GET /api/playoffs/leverage?season=${leverage.data.season}&week=${leverage.data.week}&rules=madden; ifWin, ifLoss; swing=(ifWin-ifLoss)×100.` : 'No next-game scenarios available.'}` } }
  return <Section id="playoff-outlook" title="Playoff outlook" kicker="Postseason chances" className="rounded-lg border border-line p-4 sm:p-5 bg-surface" >
    <div className="h-1 rounded-full mb-5" style={{ background: 'var(--team-c)' }} />
    {[picture, leverage, championship, history, clinch].filter(load => load.error).map((load, i) => <PlayoffError key={i} error={load.error} retry={load.retry}>Playoff data unavailable.</PlayoffError>)}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="min-w-0">
        <div className="relative w-40 h-40 mx-auto mb-3">
          <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90" role="img" aria-label={`Playoff probability ${markerOdds(row.odds.playoffs, markers?.playoffs)}`}>
            <circle cx="80" cy="80" r="68" fill="none" className="stroke-line" strokeWidth="12" />
            <circle data-testid="playoff-gauge" cx="80" cy="80" r="68" fill="none" stroke={probShade(probability) ?? 'rgb(var(--muted))'} strokeWidth="12" strokeLinecap="round" pathLength="100" strokeDasharray={`${probability * 100} 100`} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><strong className="font-display text-4xl num">{markerOdds(row.odds.playoffs, markers?.playoffs)}</strong><span className="text-xs text-muted">Playoff probability</span></div>
        </div>
        <ClinchBadge markers={markers} />
        {status && <p className="text-sm mt-2">{finished ? 'Final seed: ' : 'If the season ended today: '}<strong>{status}</strong></p>}
        <p className="text-sm text-muted mt-3 leading-relaxed">{story}</p>
      </div>
      <div className="min-w-0 lg:border-x border-line lg:px-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">Road to the title</h3>
        {(finished || championship.data?.preplayoff) && <p className="text-xs text-muted mb-2">Pre-playoff projection (end of regular season)</p>}
        <div className="space-y-2" aria-label="Title probability funnel">{STAGES.map(([key, label]) => {
          const p = key === 'playoffs' ? markerValue(title?.playoffs ?? row.odds.playoffs, markers?.playoffs) : title?.[key]
          return <div key={key}><div className="flex justify-between gap-2 text-xs mb-1"><span>{label}</span><strong className="num">{formatOdds(p, key === 'playoffs' && !!markers?.playoffs)}</strong></div><div className="h-4 rounded bg-bg border border-line overflow-hidden"><div className="h-full rounded-r" style={{ width: `${(p ?? 0) * 100}%`, background: (key === 'playoffs' ? probShade : chanceShade)(p) }} /></div></div>
        })}</div>
        <SeedLegend />
        <div className="relative"><SeedBar seedOdds={row.seedOdds} size="100%" /><span role="img" aria-label={`Out: ${formatOdds(1 - probability, finished)}`} title={`Out: ${formatOdds(1 - probability, finished)}`} className="absolute right-0 top-0 h-3 rounded-r bg-muted/30" style={{ width: `${(1 - probability) * 100}%` }} /></div>
        <p className="text-xs text-muted mt-1">Out: {formatOdds(1 - probability, finished)}</p>
      </div>
      <div className="min-w-0 space-y-4">
        <PlayoffMomentum points={points} />
        {next && <div className="border border-line rounded p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Next game · {weekName(week)}</h3>
          <p className="flex items-center gap-2 text-sm font-semibold mt-2"><TeamLogo abbr={opp.abbrName} size={20} />{next.side === 'home' ? 'vs' : '@'} {opp.displayName}</p>
          <div className="grid grid-cols-2 gap-2 mt-2 text-sm num">
            <span className="rounded px-2 py-1" style={{ background: probShade(next.ifWin.playoffs) }}>Win → {formatOdds(next.ifWin.playoffs)} ▲</span>
            <span className="rounded px-2 py-1" style={{ background: probShade(next.ifLoss.playoffs) }}>Lose → {formatOdds(next.ifLoss.playoffs)} ▼</span>
          </div><p className="text-xs text-muted mt-2">{ordinal(rank)} biggest game this week</p>
        </div>}
        <div className="text-sm space-y-2"><Link className="block text-accent hover:underline" to={`/playoffs/${row.team.abbrName}?season=${season}`}>Path to the playoffs →</Link><Link className="block text-accent hover:underline" to={`/playoffs?tab=probability&season=${season}`}>All playoff probabilities →</Link></div>
      </div>
    </div>
    <details className="mt-5 border-t border-line pt-3"><summary className="cursor-pointer text-sm font-semibold">Show data</summary>
      <div className="mt-3 space-y-4"><PlayoffDataTable title="Playoff outlook" spec={spec} />
        <PlayoffDataTable title="Seed distribution data" spec={{ name: `${row.team.displayName} seed distribution`, qualifier: seasonLabel(odds.data.season), rows: [...row.seedOdds.map((p, i) => ({ label: `Seed ${i + 1}`, p })), { label: 'Out', p: 1 - probability }], cols: [{ label: 'Seed', desc: 'Final playoff seed, or outside the field.', text: r => r.label }, { label: 'Chance', desc: 'Probability of finishing in this position.', text: r => formatOdds(r.p, finished), value: r => r.p, z: '0%', color: r => chanceShade(r.p) }], api: { path: '/playoffs/odds', params: { season: odds.data.season, rules: odds.data.rules }, fields: { Chance: 'seedOdds; Out = 1 - odds.playoffs' } } }} />
        {points.length > 0 && <PlayoffDataTable title="Playoff outlook history data" spec={{ name: `${row.team.displayName} playoff probability history`, qualifier: seasonLabel(odds.data.season), rows: points, cols: [{ label: 'Week', desc: 'Saved snapshot week.', text: r => snapshotLabel(r.week), sort: r => r.week ?? Infinity }, { label: row.team.abbrName, desc: 'Playoff probability.', text: r => formatOdds(r.p), value: r => r.p, z: '0%', color: r => probShade(r.p) }], api: { path: '/playoffs/odds/history', params: { season: history.data.season }, fields: { Week: 'snapshots[].week', Probability: 'snapshots[].teams[].playoffs' } } }} />}
      </div>
    </details>
  </Section>
}
