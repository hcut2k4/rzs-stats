import { useState, useEffect } from 'react'
import { getSeasons, getAvailableWeeks, getGames } from '../api/client'
import { TeamLogo } from '../components/TeamLogo'
import PageHeader from '../components/PageHeader'
import ExportMenu from '../components/ExportMenu'
import { weekLabel } from '../utils/playoffRounds'
import { seasonLabel, seasonNumber } from '../utils/seasons'

function TeamSide({ team, won, align }) {
  return (
    <div className={`flex items-center gap-2 ${align === 'right' ? 'justify-end' : ''} ${won ? 'font-bold' : 'text-muted'}`}>
      {align === 'right' && <span>{team?.abbrName}</span>}
      <TeamLogo abbr={team?.abbrName} size={28} />
      {align !== 'right' && <span>{team?.abbrName}</span>}
    </div>
  )
}

function GameRow({ game, i }) {
  const homeWon = game.homeScore > game.awayScore
  const awayWon = game.awayScore > game.homeScore
  const url = `https://neonsportz.com/leagues/RZS/games/${game.nsPk ?? game.gameId}`

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-3 py-2 border-t border-line hover:bg-surface ${i % 2 ? 'bg-surface/60' : ''}`}
    >
      <TeamSide team={game.awayTeam} won={awayWon} />
      <div className="flex items-center gap-3 text-xl font-bold num">
        <span className={`w-8 text-right ${awayWon ? '' : 'text-muted'}`}>{game.awayScore ?? '–'}</span>
        <span className="text-muted text-xs font-normal">@</span>
        <span className={`w-8 ${homeWon ? '' : 'text-muted'}`}>{game.homeScore ?? '–'}</span>
      </div>
      <div className="flex items-center justify-end gap-3">
        {game.simmed && <span className="text-[10px] font-semibold tracking-wide border border-line rounded px-1 text-muted">SIM</span>}
        <TeamSide team={game.homeTeam} won={homeWon} align="right" />
      </div>
    </a>
  )
}

export default function GamesPage() {
  const [seasons, setSeasons] = useState([])
  const [season, setSeason] = useState(null)
  const [stage, setStage] = useState(1)
  const [weeks, setWeeks] = useState([])
  const [weekIndex, setWeekIndex] = useState(null)
  const [{ games, params }, setData] = useState({ games: [], params: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getSeasons()
      .then(s => {
        setSeasons(s)
        if (s.length) setSeason(s[s.length - 1])
      })
      .catch(() => setError('Failed to load seasons'))
  }, [])

  useEffect(() => {
    if (season == null) return
    let current = true
    getAvailableWeeks(season, stage)
      .then(w => {
        if (!current) return
        setWeeks(w)
        setWeekIndex(w.length ? w[w.length - 1] : null)
      })
      .catch(() => { if (current) setWeeks([]) })
    return () => { current = false }
  }, [season, stage])

  useEffect(() => {
    if (season == null || weekIndex == null) {
      setLoading(false)
      setData(d => (d.params ? { games: [], params: null } : d))
      return
    }
    let current = true
    setLoading(true)
    setError(null)
    getGames(season, stage, weekIndex)
      .then(games => { if (current) { setData({ games, params: { season, stage, week: weekIndex } }); setLoading(false) } })
      .catch(() => { if (current) { setError('Failed to load games'); setLoading(false) } })
    return () => { current = false }
  }, [season, stage, weekIndex])

  const weekIdx = weeks.indexOf(weekIndex)
  const exportSpec = params && {
    name: 'Games',
    qualifier: `${seasonLabel(params.season)} · ${params.stage === 1 ? 'Regular season' : 'Playoffs'} · ${weekLabel(params.stage, params.week)} · ${games.length} games`,
    description: 'One row per game in the selected season, stage and week, in displayed order.',
    rows: games,
    cols: [
      { label: 'Away', desc: 'The visiting team name.', logo: g => g.awayTeam?.abbrName, text: g => g.awayTeam?.displayName ?? '' },
      { label: 'Away Score', desc: 'Points scored by the visiting team; empty when unplayed.', text: g => String(g.awayScore ?? ''), value: g => g.awayScore, z: '0' },
      { label: 'Home Score', desc: 'Points scored by the home team; empty when unplayed.', text: g => String(g.homeScore ?? ''), value: g => g.homeScore, z: '0' },
      { label: 'Home', desc: 'The home team name.', logo: g => g.homeTeam?.abbrName, text: g => g.homeTeam?.displayName ?? '' },
      { label: 'Winner', desc: 'The winning team name, Tie for a completed tie, or empty when unplayed.', text: g => g.status < 2 ? '' : g.awayScore === g.homeScore ? 'Tie' : (g.awayScore > g.homeScore ? g.awayTeam : g.homeTeam)?.displayName ?? '' },
      { label: 'Status', desc: 'Final means the game is completed; otherwise it is Unplayed.', text: g => g.status >= 2 ? 'Final' : 'Unplayed' },
      { label: 'Simmed', desc: 'Yes means the game was simulated.', text: g => g.simmed ? 'Yes' : 'No' },
      { label: 'NeonSportz URL', imageHidden: true, desc: 'The link to the game on NeonSportz.', text: g => `https://neonsportz.com/leagues/RZS/games/${g.nsPk ?? g.gameId}` },
    ],
    api: {
      path: '/games', params,
      fields: {
        Away: 'awayTeam.displayName', Home: 'homeTeam.displayName',
        'Away Score': 'awayScore; null means unplayed.', 'Home Score': 'homeScore; null means unplayed.',
        Winner: 'For status >= 2, compare awayScore and homeScore; equal scores mean Tie. Otherwise empty.',
        Status: 'status >= 2 means completed (Final); otherwise Unplayed.',
        Simmed: 'simmed is mapped to Yes or No.',
        'NeonSportz URL': 'https://neonsportz.com/leagues/RZS/games/ followed by nsPk, falling back to gameId only when nsPk is null. gameId is the deduplication identity.',
      },
    },
  }

  return (
    <div>
      <PageHeader
        title="Games"
        qualifier={season != null && weekIndex != null
          ? `${seasonLabel(season)} · ${stage === 1 ? 'Regular season' : 'Playoffs'} · ${weekLabel(stage, weekIndex)}`
          : null}
      >
        <select className="field" value={season ?? ''} onChange={e => setSeason(Number(e.target.value))}>
          {seasons.map(s => <option key={s} value={s}>Season {seasonNumber(s)}</option>)}
        </select>

        <select className="field" value={stage} onChange={e => setStage(Number(e.target.value))}>
          <option value={1}>Regular Season</option>
          <option value={2}>Playoffs</option>
        </select>

        {weeks.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => weekIdx > 0 && setWeekIndex(weeks[weekIdx - 1])}
              disabled={weekIdx <= 0}
              aria-label="Previous week"
              className="btn"
            >
              ‹
            </button>
            <select className="field" value={weekIndex ?? ''} onChange={e => setWeekIndex(Number(e.target.value))}>
              {weeks.map(w => <option key={w} value={w}>{weekLabel(stage, w)}</option>)}
            </select>
            <button
              onClick={() => weekIdx < weeks.length - 1 && setWeekIndex(weeks[weekIdx + 1])}
              disabled={weekIdx >= weeks.length - 1}
              aria-label="Next week"
              className="btn"
            >
              ›
            </button>
          </div>
        )}
      </PageHeader>

      {error && <div className="text-bad mb-4">{error}</div>}
      {loading && <div className="text-muted">Loading...</div>}

      {!loading && !error && (
        games.length === 0
          ? <p className="text-muted">No games found for this week.</p>
          : (
            <div className="border-b border-rule max-w-3xl">
              <div className="flex justify-end"><ExportMenu spec={exportSpec} /></div>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-4 px-3 py-1.5 th">
                <span>Away</span>
                <span>Score</span>
                <span className="text-right">Home</span>
              </div>
              {games.map((g, i) => <GameRow key={g.gameId} game={g} i={i} />)}
            </div>
          )
      )}
    </div>
  )
}
