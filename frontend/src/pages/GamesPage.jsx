import { useState, useEffect } from 'react'
import { getSeasons, getAvailableWeeks, getGames } from '../api/client'
import { TeamLogo } from '../components/TeamLogo'
import PageHeader from '../components/PageHeader'

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
  const [games, setGames] = useState([])
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
    getAvailableWeeks(season, stage)
      .then(w => {
        setWeeks(w)
        setWeekIndex(w.length ? w[w.length - 1] : null)
      })
      .catch(() => setWeeks([]))
  }, [season, stage])

  useEffect(() => {
    if (season == null || weekIndex == null) return
    setLoading(true)
    setError(null)
    getGames(season, stage, weekIndex)
      .then(data => { setGames(data); setLoading(false) })
      .catch(() => { setError('Failed to load games'); setLoading(false) })
  }, [season, stage, weekIndex])

  const weekIdx = weeks.indexOf(weekIndex)

  return (
    <div>
      <PageHeader
        title="Games"
        qualifier={season != null && weekIndex != null
          ? `Season ${season + 2026} · ${stage === 1 ? 'Regular season' : 'Playoffs'} · Week ${weekIndex + 1}`
          : null}
      >
        <select className="field" value={season ?? ''} onChange={e => setSeason(Number(e.target.value))}>
          {seasons.map(s => <option key={s} value={s}>Season {s + 2026}</option>)}
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
              {weeks.map(w => <option key={w} value={w}>Week {w + 1}</option>)}
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
