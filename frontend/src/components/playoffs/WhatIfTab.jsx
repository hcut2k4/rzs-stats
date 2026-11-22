import PlayoffError from './PlayoffError'
import { withBusyRetry, isBusy, usePlayoffLoad } from '../../utils/usePlayoffLoad'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getPlayoffRemaining, simulatePlayoffs } from '../../api/client'
import { encodePicks, parsePicks } from '../../utils/playoffScenario'
import { GOALS, formatOdds } from '../../utils/playoffOdds'
import { weekName } from '../../utils/playoffRounds'
import { recordText } from '../../utils/teamProfile'
import { seasonLabel } from '../../utils/seasons'
import ExportMenu from '../ExportMenu'
import InfoTip from '../InfoTip'
import { TeamLogo } from '../TeamLogo'

const SCORE_TIP = 'Winners alone do not decide this spot; point differential or a coin toss does.'
const delta = (p, baseline) => {
  const points = (p - baseline) * 100
  return Number.isFinite(points) && Math.abs(points) >= 1 - 1e-9 ? `${points > 0 ? '↑' : '↓'} ${Math.round(Math.abs(points))} pp` : ''
}
function Results({ data, picks }) {
  return <div className="space-y-6"><p className="text-sm text-muted">{data.picked} of {data.remaining} games picked, the rest simulated ({data.simulations.toLocaleString()} seasons)</p>{data.conferences.map(c => {
    const dependsOnScores = r => r.dependsOnScores ?? c.seeds?.some(s => s.team.teamId === r.team.teamId && s.dependsOnScores) ?? false
    const cols = [{ label: 'Team', desc: 'Team name.', text: r => r.team.displayName, logo: r => r.team.abbrName }, ...GOALS.flatMap(g => [
      { label: g.label, desc: `Chance of ${g.label}.`, text: r => formatOdds(r.odds[g.value], data.exact && (r.odds[g.value] === 0 || r.odds[g.value] === 1) && !dependsOnScores(r)), value: r => r.odds[g.value], z: '0%' },
      { label: `${g.label} change`, desc: 'Change versus baseline, in percentage points; changes under one point hidden.', text: r => delta(r.odds[g.value], r.baseline?.[g.value]) },
    ])]
    const api = { path: '/playoffs/simulate', params: { season: data.season, rules: data.rules }, note: `POST with picks=${encodePicks(picks)}; simulations=${data.simulations}. ${c.name}.`, fields: { Team: 'team.displayName', Odds: 'odds; changes=(odds-baseline)×100' } }
    const spec = { name: `${c.name} What-If odds`, qualifier: `${seasonLabel(data.season)} · ${data.rules} rules`, description: 'Picked outcomes are forced; all other games simulated.', rows: c.teams, cols, api }
    const seedsSpec = { ...spec, name: `${c.name} final seeds`, rows: c.seeds ?? [], cols: [
      { label: 'Seed', desc: 'Final playoff seed.', text: r => String(r.seed), value: r => r.seed, z: '0' }, cols[0],
      { label: 'Record', desc: 'Final regular-season record.', text: recordText },
      { label: 'Tiebreakers', desc: 'Reasons deciding this seed.', text: r => r.reasons.join(' ') },
      { label: 'Depends on scores', desc: SCORE_TIP, text: r => r.dependsOnScores ? 'Yes' : '' },
    ] }
    return <section key={c.name} aria-label={`${c.name} What-If`} className="space-y-3"><div className="flex justify-between flex-wrap gap-2"><h2 className="font-display text-2xl font-bold">{c.name}</h2><ExportMenu spec={spec} /></div><div className="overflow-x-auto"><table className="w-full text-sm" aria-label={`${c.name} scenario odds`}><thead><tr>{cols.map(col => <th key={col.label} className="th text-left whitespace-nowrap">{col.label}</th>)}</tr></thead><tbody>{c.teams.map(r => <tr key={r.team.teamId} className="border-t border-line">{cols.map(col => <td className="p-2 num" key={col.label}>{col.text(r)}{col.label === 'Team' && dependsOnScores(r) && <small className="block text-muted">depends on scores</small>}</td>)}</tr>)}</tbody></table></div>
      {data.exact && c.seeds && <><div className="flex justify-between flex-wrap gap-2"><h3 className="font-semibold">Final seeds</h3><ExportMenu spec={seedsSpec} /></div><table className="w-full text-sm" aria-label={`${c.name} final seeds`}><thead><tr>{['Seed', 'Team', 'Record', 'Details'].map(t => <th className="th text-left" key={t}>{t}</th>)}</tr></thead><tbody>{c.seeds.map(r => <tr key={r.team.teamId} className="border-t border-line"><td className="p-2">{r.seed}</td><td className="p-2">{r.team.displayName}</td><td className="p-2 num">{recordText(r)}</td><td className="p-2">{r.dependsOnScores && <InfoTip text={SCORE_TIP}><span tabIndex={0} className="text-xs border border-line rounded px-1">Depends on scores</span></InfoTip>}{r.reasons.length > 0 && <details><summary className="cursor-pointer text-muted">Tiebreak details</summary>{r.reasons.map(reason => <p key={reason}>{reason}</p>)}</details>}</td></tr>)}</tbody></table></>}
    </section>
  })}</div>
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
      withBusyRetry(() => simulatePlayoffs({ season: remaining.data.season, rules, picks: parsePicks(encoded, remaining.data.games) }, controller.signal), controller.signal)
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
      url.searchParams.set('rules', rules)
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
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3"><button className="field" onClick={() => pickGames(games, favorite)}>Pick favorites</button><label>Team <select aria-label="Wins out team" className="field" value={team} onChange={e => setTeam(e.target.value)}><option value="">Choose team</option>{teams.map(t => <option key={t.teamId} value={t.teamId}>{t.abbrName}</option>)}</select></label><button className="field" disabled={!team} onClick={() => pickGames(games.filter(g => [g.home.teamId, g.away.teamId].includes(Number(team))), g => g.home.teamId === Number(team) ? 'home' : 'away')}>{teams.find(t => t.teamId === Number(team))?.abbrName ?? 'Team'} wins out</button><button className="field" onClick={() => save([])}>Clear all</button><button className="field" onClick={copyLink}>Copy link</button><span role="status" className="text-sm">{copy}</span></div>
    {removed > 0 && <p className="text-sm text-muted">{removed} picks were removed because those games are already played</p>}
    {!games.length && <p>No remaining regular-season games.</p>}
    {[...new Set(games.map(g => g.week))].map(week => <details key={`${season}-${week}`} open={week === remaining.data.nextWeek} className="border border-line rounded p-3"><summary className="cursor-pointer font-semibold">{weekName(week)}</summary><div className="my-2"><ExportMenu spec={{ name: `What-If picks — ${weekName(week)}`, qualifier: seasonLabel(remaining.data.season), description: 'Remaining games and selected forced results; unpicked games are simulated.', rows: games.filter(g => g.week === week), cols: [
      { label: 'Home', desc: 'Home team.', text: g => g.home.abbrName, logo: g => g.home.abbrName },
      { label: 'Away', desc: 'Away team.', text: g => g.away.abbrName, logo: g => g.away.abbrName },
      { label: 'Home win probability', desc: 'Elo home win probability.', text: g => formatOdds(g.homeWinProb), value: g => g.homeWinProb, z: '0%' },
      { label: 'Pick', desc: 'Forced result; blank means simulated.', text: g => picks.find(p => p.gameId === g.gameId)?.result ?? '' },
    ], api: { path: '/playoffs/remaining', params: { season: remaining.data.season }, fields: { Home: 'home.abbrName', Away: 'away.abbrName', 'Home win probability': 'homeWinProb', Pick: 'URL picks, filtered to known gameIds' }, note: `${weekName(week)} only; picks=${encoded}.` } }} /></div><button className="field my-3" onClick={() => pickGames(games.filter(g => g.week === week), favorite)}>Pick favorites this week</button>{games.filter(g => g.week === week).map(g => <div key={g.gameId} className="flex flex-wrap justify-between gap-3 items-center border-t border-line py-3"><span className="text-sm">{g.away.abbrName} @ {g.home.abbrName} · Home win probability {formatOdds(g.homeWinProb)}</span><div role="group" aria-label={`${g.away.abbrName} at ${g.home.abbrName}`} className="flex border border-line rounded overflow-hidden">{['home', 'tie', 'away'].map(result => {
      const t = g[result]
      const selected = picks.some(p => p.gameId === g.gameId && p.result === result)
      return <button key={result} aria-label={t ? `${result === 'home' ? 'Home' : 'Away'} ${t.abbrName}` : 'Tie'} aria-pressed={selected} className={`flex gap-1 items-center px-3 py-2 text-sm ${selected ? 'bg-ink text-bg' : ''}`} onClick={() => selected ? save(picks.filter(p => p.gameId !== g.gameId)) : pickGames([g], () => result)}>{t && <TeamLogo abbr={t.abbrName} size={24} />}{t ? `${result === 'home' ? 'Home' : 'Away'} ${t.abbrName}` : 'Tie'}</button>
    })}</div></div>)}</details>)}
    {!ready && <p className="text-muted">Simulating scenario…</p>}{ready && state.error && <div><p className="text-bad">{isBusy(state.error) ? 'The server is busy. Try again' : 'Could not simulate this scenario.'}</p><button className="field mt-2" onClick={() => setAttempt(a => a + 1)}>{isBusy(state.error) ? 'Retry' : 'Retry simulation'}</button></div>}{ready && state.data && <Results data={state.data} picks={picks} />}
  </div>
}
