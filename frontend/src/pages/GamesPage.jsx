import { useState, useEffect } from 'react'
import { getSeasons, getAvailableWeeks, getGames } from '../api/client'

function GameCard({ game }) {
  const homeLogo = `https://a.espncdn.com/i/teamlogos/nfl/500/${game.homeTeam?.abbrName?.toLowerCase()}.png`
  const awayLogo = `https://a.espncdn.com/i/teamlogos/nfl/500/${game.awayTeam?.abbrName?.toLowerCase()}.png`
  const homeWon = game.homeScore > game.awayScore
  const awayWon = game.awayScore > game.homeScore

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between gap-4">
      {/* Away team */}
      <div className={`flex flex-col items-center gap-1 w-28 text-center ${awayWon ? 'opacity-100' : 'opacity-60'}`}>
        <img src={awayLogo} alt="" className="w-10 h-10 object-contain" onError={e => { e.target.style.display = 'none' }} />
        <span className="text-xs font-medium">{game.awayTeam?.abbrName}</span>
      </div>

      {/* Scores */}
      <div className="flex items-center gap-4 text-2xl font-bold tabular-nums">
        <span className={awayWon ? 'text-white' : 'text-gray-500'}>{game.awayScore ?? '–'}</span>
        <span className="text-gray-600 text-base">vs</span>
        <span className={homeWon ? 'text-white' : 'text-gray-500'}>{game.homeScore ?? '–'}</span>
      </div>

      {/* Home team */}
      <div className={`flex flex-col items-center gap-1 w-28 text-center ${homeWon ? 'opacity-100' : 'opacity-60'}`}>
        <img src={homeLogo} alt="" className="w-10 h-10 object-contain" onError={e => { e.target.style.display = 'none' }} />
        <span className="text-xs font-medium">{game.homeTeam?.abbrName}</span>
      </div>

      {game.simmed && <span className="absolute top-2 right-2 text-xs text-gray-500">SIM</span>}
    </div>
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
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h1 className="text-xl font-bold">Games</h1>

        <select
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm"
          value={season ?? ''}
          onChange={e => setSeason(Number(e.target.value))}
        >
          {seasons.map(s => <option key={s} value={s}>Season {s + 1}</option>)}
        </select>

        <select
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm"
          value={stage}
          onChange={e => setStage(Number(e.target.value))}
        >
          <option value={1}>Regular Season</option>
          <option value={2}>Playoffs</option>
        </select>

        {weeks.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => weekIdx > 0 && setWeekIndex(weeks[weekIdx - 1])}
              disabled={weekIdx <= 0}
              className="px-2 py-1 bg-gray-800 rounded disabled:opacity-30"
            >
              ‹
            </button>
            <span className="text-sm font-medium px-2">Week {weekIndex + 1}</span>
            <button
              onClick={() => weekIdx < weeks.length - 1 && setWeekIndex(weeks[weekIdx + 1])}
              disabled={weekIdx >= weeks.length - 1}
              className="px-2 py-1 bg-gray-800 rounded disabled:opacity-30"
            >
              ›
            </button>
          </div>
        )}
      </div>

      {error && <div className="text-red-400 mb-4">{error}</div>}
      {loading && <div className="text-gray-400">Loading...</div>}

      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 relative">
          {games.length === 0
            ? <p className="text-gray-400 col-span-full">No games found for this week.</p>
            : games.map(g => <GameCard key={g.gameId} game={g} />)
          }
        </div>
      )}
    </div>
  )
}
