import PlayoffError from './PlayoffError'
import { withBusyRetry, isBusy, usePlayoffLoad } from '../../utils/usePlayoffLoad'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getPlayoffRemaining, simulatePlayoffs } from '../../api/client'
import { encodePicks, parsePicks } from '../../utils/playoffScenario'
import { GOALS, formatOdds, probShade, chanceShade } from '../../utils/playoffOdds'
import { weekName } from '../../utils/playoffRounds'
import { recordText } from '../../utils/teamProfile'
import { seasonLabel } from '../../utils/seasons'
import { SortTh, useSorter } from '../SortTh'
import { TeamLink } from './OddsTab'
import ExportMenu from '../ExportMenu'
import InfoTip from '../InfoTip'
import { TeamLogo } from '../TeamLogo'

const SCORE_TIP = 'Winners alone do not decide this spot; point differential or a coin toss does.'
const change = (r, goal) => r.baseline?.[goal] == null ? null : (r.odds[goal] - r.baseline[goal]) * 100
const delta = points => Number.isFinite(points) && Math.abs(points) >= 1 - 1e-9 ? `${points > 0 ? '↑' : '↓'} ${Math.round(Math.abs(points))} pp` : '—'

function FinalSeeds({ conference, data, api }) {
  const sorter = useSorter({ key: 'Seed', asc: true })
  const cols = [
    { label: 'Seed', desc: 'Final playoff seed.', text: r => String(r.seed), value: r => r.seed, z: '0' },
    { label: 'Team', desc: 'Team name.', text: r => r.team.displayName, logo: r => r.team.abbrName },
    { label: 'Record', desc: 'Final regular-season record.', text: recordText, value: r => r.wins + r.ties / 2 },
    { label: 'Details', desc: 'Tiebreak reasons and whether the seed depends on scores.', text: r => [...r.reasons, r.dependsOnScores ? SCORE_TIP : ''].filter(Boolean).join(' ') },
  ]
  const rows = sorter.apply(conference.seeds ?? [], Object.fromEntries(cols.map(c => [c.label, c.value ?? c.text])))
  const spec = { name: `${conference.name} final seeds`, qualifier: seasonLabel(data.season), rows, cols, api: { ...api, fields: { Seed: 'seeds[].seed', Team: 'seeds[].team.displayName', Record: 'seeds[].wins, losses, ties', Details: 'seeds[].reasons, dependsOnScores' }, note: `${api.note} ${conference.name}; ${sorter.sort.key} ${sorter.sort.asc ? 'ascending' : 'descending'}.` } }
  return <section aria-label={`${conference.name} final seeds`}><div className="flex items-center justify-between gap-2 mb-2"><h3 className="font-display font-bold uppercase text-xl leading-none">{conference.name}</h3><ExportMenu spec={spec} /></div>
    <div className="overflow-x-auto border-y border-rule whitespace-nowrap"><table className="w-full text-sm num" aria-label={`${conference.name} final seeds`}><thead><tr className="border-b border-rule">{cols.map(c => <SortTh key={c.label} sortKey={c.label} state={sorter.sort} onSort={sorter.click} tip={c.desc} className="text-left">{c.label}</SortTh>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={r.team.teamId} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
      <td className="px-2 py-1 num">{r.seed}</td><td className="px-2 py-1 [&_img]:!w-5 [&_img]:!h-5"><TeamLink team={r.team} season={data.season} rules={data.rules} /></td><td className="px-2 py-1 num">{recordText(r)}</td><td className="px-2 py-1"><div className="flex items-center gap-2">{r.reasons.length > 0 && <InfoTip text={r.reasons.join(' ')}><span tabIndex={0} aria-label="Tiebreak reasons" className="text-muted">ⓘ</span></InfoTip>}{r.dependsOnScores && <InfoTip text={SCORE_TIP}><span tabIndex={0} className="text-xs border border-line rounded px-1">Depends on scores</span></InfoTip>}</div></td>
    </tr>)}</tbody></table></div>
  </section>
}

function Results({ data, picks }) {
  const [view, setView] = useState('teams')
  const sorter = useSorter({ key: 'change', asc: false })
  const teams = data.conferences.flatMap(c => c.teams.map(r => ({ ...r, conference: c.name, dependsOnScores: r.dependsOnScores ?? c.seeds?.some(s => s.team.teamId === r.team.teamId && s.dependsOnScores) ?? false })))
  const cols = [
    { label: 'Team', desc: 'Team name.', text: r => r.team.displayName, logo: r => r.team.abbrName },
    { label: 'Conf', desc: 'Conference.', text: r => r.conference },
    ...GOALS.map(g => ({ label: g.label, desc: `${g.label} probability; change versus baseline in percentage points. Changes under one point appear as a dash.`, text: r => formatOdds(r.odds[g.value], data.exact && !r.dependsOnScores && (r.odds[g.value] === 0 || r.odds[g.value] === 1)), value: r => r.odds[g.value], z: '0%', goal: g.value, color: r => (g.value === 'playoffs' ? probShade : chanceShade)(r.odds[g.value]) })),
  ]
  const rows = sorter.apply(teams, { ...Object.fromEntries(cols.map(c => [c.label, c.value ?? c.text])), change: r => Math.abs(change(r, 'playoffs') ?? 0) })
  const api = { path: '/playoffs/simulate', params: { season: data.season, rules: data.rules }, note: `POST with picks=${encodePicks(picks)}; simulations=${data.simulations}; ${sorter.sort.key} ${sorter.sort.asc ? 'ascending' : 'descending'}.`, fields: { Team: 'team.displayName', Conf: 'conferences[].name', Probability: 'odds; changes=(odds-baseline)×100' } }
  const spec = { name: 'What-If probabilities', qualifier: seasonLabel(data.season), description: 'Picked outcomes are forced; all other games simulated.', rows, cols: cols.flatMap(c => c.goal ? [c, { label: `${c.label} change`, desc: 'Change versus baseline in percentage points; changes under one point hidden.', text: r => delta(change(r, c.goal)), value: r => change(r, c.goal), z: '+0.0" pp";-0.0" pp";0" pp"' }] : [c]), api }
  return <div className="space-y-3"><p className="text-sm text-muted">{data.picked} of {data.remaining} games picked, the rest simulated ({data.simulations.toLocaleString()} seasons)</p>
    {data.exact && <div className="inline-flex border border-line rounded overflow-hidden" role="group" aria-label="Results view">{[['teams', 'Teams'], ['seeds', 'Final seeds']].map(([key, label]) => <button key={key} aria-pressed={view === key} className={`px-3 py-1 text-sm ${view === key ? 'bg-ink text-bg' : ''}`} onClick={() => setView(key)}>{label}</button>)}</div>}
    {data.exact && view === 'seeds' ? data.conferences.map(c => <FinalSeeds key={c.name} conference={c} data={data} api={api} />) : <section aria-label="What-If teams"><div className="flex flex-wrap items-center justify-between gap-2 mb-2"><h2 className="font-display font-bold uppercase text-xl leading-none">Team probabilities</h2><ExportMenu spec={spec} /></div>
      <div className="overflow-x-auto border-y border-rule whitespace-nowrap"><table className="w-full text-sm num" aria-label="Scenario probabilities"><thead><tr className="border-b border-rule">{cols.map(c => <SortTh key={c.label} sortKey={c.label} state={sorter.sort} onSort={sorter.click} tip={c.desc} className={c.goal ? 'text-right' : 'text-left'}>{c.label}</SortTh>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={r.team.teamId} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
        <td className="px-2 py-1 [&_img]:!w-5 [&_img]:!h-5"><TeamLink team={r.team} season={data.season} rules={data.rules} />{r.dependsOnScores && <InfoTip text={SCORE_TIP}><span tabIndex={0} aria-label="Depends on scores" className="ml-1 text-muted">ⓘ</span></InfoTip>}</td><td className="px-2 py-1">{r.conference}</td>
        {cols.filter(c => c.goal).map(c => <td key={c.label} className="px-2 py-1 num text-right" style={{ background: c.color(r) }}>{c.text(r)} <span className="text-xs inline-block min-w-14" title="Change versus baseline">{delta(change(r, c.goal))}</span></td>)}
      </tr>)}</tbody></table></div>
    </section>}
  </div>
}
export default function WhatIfTab({ season, rules }) {
  const remaining = usePlayoffLoad(`playoffs-remaining-${season}`, () => getPlayoffRemaining(season))
  const [params, setParams] = useSearchParams()
  const games = remaining.data?.games ?? []
  const rawPicks = params.get('v') == null || params.get('v') === '1' ? params.get('picks') : ''
  const picks = parsePicks(rawPicks, games)
  const [removed, setRemoved] = useState(0)
  const encoded = encodePicks(picks)
  const [team, setTeam] = useState('')
  const [copy, setCopy] = useState('')
  const [state, setState] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const resultsRef = useRef(null)
  useEffect(() => {
    if (!remaining.data) return
    const count = parsePicks(rawPicks).length - picks.length
    if (!count) return
    setRemoved(count)
    setParams(prev => {
      const next = new URLSearchParams(prev)
      if (encoded) next.set('picks', encoded)
      else next.delete('picks')
      next.set('v', '1')
      return next
    }, { replace: true })
  }, [remaining.data, rawPicks, encoded, setParams])
  const key = `${season}-${rules}-${encoded}-${attempt}`
  useEffect(() => {
    if (!remaining.data) return
    const controller = new AbortController()
    let live = true
    const timer = setTimeout(() => {
      withBusyRetry(() => simulatePlayoffs({ season: remaining.data.season, rules: 'madden', picks: parsePicks(encoded, remaining.data.games) }, controller.signal), controller.signal)
        .then(data => { if (live) setState({ key, data }) })
        .catch(error => { if (live && !controller.signal.aborted) setState({ key, error }) })
    }, 400)
    return () => { live = false; clearTimeout(timer); controller.abort() }
  }, [key, remaining.data])
  const save = nextPicks => setParams(prev => {
    const next = new URLSearchParams(prev)
    next.set('v', '1')
    next.set('season', String(remaining.data.season))
    const value = encodePicks(nextPicks)
    if (value) next.set('picks', value)
    else next.delete('picks')
    return next
  }, { replace: true })
  const pickGames = (selected, choose) => {
    const next = new Map(picks.map(p => [p.gameId, p.result]))
    for (const g of selected) next.set(g.gameId, choose(g))
    save([...next].map(([gameId, result]) => ({ gameId, result })))
  }
  const favorite = g => g.homeWinProb >= 0.5 ? 'home' : 'away'
  const teams = [...new Map(games.flatMap(g => [g.home, g.away]).map(t => [t.teamId, t])).values()].sort((a, b) => a.abbrName.localeCompare(b.abbrName))
  const copyLink = async () => {
    try {
      const url = new URL(window.location.href)
      url.search = params.toString()
      url.searchParams.set('v', '1')
      url.searchParams.set('season', String(remaining.data.season))
      url.searchParams.delete('rules')
      url.searchParams.set('tab', 'whatif')
      if (encoded) url.searchParams.set('picks', encoded)
      else url.searchParams.delete('picks')
      await navigator.clipboard.writeText(url.toString())
      setCopy('Link copied')
    } catch { setCopy('Could not copy link') }
  }
  if (remaining.loading) return <p className="text-muted">Loading remaining games…</p>
  if (remaining.error) return <PlayoffError error={remaining.error} retry={remaining.retry}>Could not load remaining games.</PlayoffError>
  const ready = state?.key === key
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start pb-16 lg:pb-0" aria-label="What-If workspace">
    <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center gap-2 text-sm"><button className="field" onClick={() => pickGames(games, favorite)}>Pick favorites</button><label>Team <select aria-label="Wins out team" className="field" value={team} onChange={e => setTeam(e.target.value)}><option value="">Choose team</option>{teams.map(t => <option key={t.teamId} value={t.teamId}>{t.abbrName}</option>)}</select></label><button className="field" disabled={!team} onClick={() => pickGames(games.filter(g => [g.home.teamId, g.away.teamId].includes(Number(team))), g => g.home.teamId === Number(team) ? 'home' : 'away')}>{teams.find(t => t.teamId === Number(team))?.abbrName ?? 'Team'} wins out</button><button className="field" onClick={() => save([])}>Clear all</button><button className="field" onClick={copyLink}>Copy link</button><span role="status" className="text-sm">{copy}</span></div>
    {removed > 0 && <p className="text-sm text-muted">{removed} picks were removed because those games are already played</p>}
    {!games.length && <p>No remaining regular-season games.</p>}
    {[...new Set(games.map(g => g.week))].map(week => <details key={`${season}-${week}`} open={week === remaining.data.nextWeek} className="border border-line rounded p-2"><summary className="cursor-pointer font-semibold">{weekName(week)}</summary><div className="my-2"><ExportMenu spec={{ name: `What-If picks — ${weekName(week)}`, qualifier: seasonLabel(remaining.data.season), description: 'Remaining games and selected forced results; unpicked games are simulated.', rows: games.filter(g => g.week === week), cols: [
      { label: 'Home', desc: 'Home team.', text: g => g.home.abbrName, logo: g => g.home.abbrName },
      { label: 'Away', desc: 'Away team.', text: g => g.away.abbrName, logo: g => g.away.abbrName },
      { label: 'Home win probability', desc: 'Elo home win probability.', text: g => formatOdds(g.homeWinProb), value: g => g.homeWinProb, z: '0%' },
      { label: 'Pick', desc: 'Forced result; blank means simulated.', text: g => picks.find(p => p.gameId === g.gameId)?.result ?? '' },
    ], api: { path: '/playoffs/remaining', params: { season: remaining.data.season }, fields: { Home: 'home.abbrName', Away: 'away.abbrName', 'Home win probability': 'homeWinProb', Pick: 'URL picks, filtered to known gameIds' }, note: `${weekName(week)} only; picks=${encoded}.` } }} /></div><button className="field mb-2 text-xs" onClick={() => pickGames(games.filter(g => g.week === week), favorite)}>Pick favorites this week</button>{games.filter(g => g.week === week).map(g => <div key={g.gameId} className="flex justify-between gap-2 items-center border-t border-line py-1 odd:bg-surface even:bg-bg"><InfoTip text={`Home win probability ${formatOdds(g.homeWinProb)}`}><span tabIndex={0} className="text-sm whitespace-nowrap">{g.away.abbrName} @ {g.home.abbrName}</span></InfoTip><div role="group" aria-label={`${g.away.abbrName} at ${g.home.abbrName}`} className="flex border border-line rounded overflow-hidden">{['home', 'tie', 'away'].map(result => {
      const t = g[result]
      const selected = picks.some(p => p.gameId === g.gameId && p.result === result)
      return <button key={result} aria-label={t ? `${result === 'home' ? 'Home' : 'Away'} ${t.abbrName}` : 'Tie'} aria-pressed={selected} className={`flex gap-1 items-center px-2 py-1 text-xs ${selected ? 'bg-ink text-bg' : ''}`} onClick={() => selected ? save(picks.filter(p => p.gameId !== g.gameId)) : pickGames([g], () => result)}>{t && <TeamLogo abbr={t.abbrName} size={20} />}{t ? t.abbrName : 'Tie'}</button>
    })}</div></div>)}</details>)}
    </div>
    <div ref={resultsRef} tabIndex={-1} aria-label="Scenario results" className="min-w-0 scroll-mt-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
    {!ready && <p className="text-muted">Simulating scenario…</p>}{ready && state.error && <div><p className="text-bad">{isBusy(state.error) ? 'The server is busy. Try again' : 'Could not simulate this scenario.'}</p><button className="field mt-2" onClick={() => setAttempt(a => a + 1)}>{isBusy(state.error) ? 'Retry' : 'Retry simulation'}</button></div>}{ready && state.data && <Results data={state.data} picks={picks} />}
    </div>
    <div className="fixed inset-x-0 bottom-0 z-10 bg-surface border-t border-line p-2 lg:hidden"><button className="field w-full" onClick={() => { resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); resultsRef.current?.focus({ preventScroll: true }) }}>Results ↓{ready && state.data ? ` · ${state.data.conferences.flatMap(c => c.teams).filter(r => Math.abs(change(r, 'playoffs') ?? 0) >= 1 - 1e-9).length} teams changed` : ''}</button></div>
  </div>
}
