import { upsetInfo } from './eloLean'

export const REGULAR_WEEKS = 18

export function teamColor(primaryColor) {
  const n = Number(primaryColor)
  if (primaryColor == null || primaryColor === '' || !Number.isInteger(n) || n < 0 || n > 0xffffff) return null
  return `#${n.toString(16).padStart(6, '0')}`
}

// Navy and black primaries vanish on the dark theme, so very dark colors are lifted toward white.
export function visibleTeamColor(hex) {
  if (!hex) return null
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  if (lum >= 0.18) return hex
  const lift = c => Math.round(c + (255 - c) * 0.4).toString(16).padStart(2, '0')
  return `#${lift(r)}${lift(g)}${lift(b)}`
}

// Sets --team-c (via .team-scope in index.css) to the raw color on light and the lifted one on dark.
export function teamColorVars(primaryColor) {
  const hex = teamColor(primaryColor)
  return hex ? { '--team': hex, '--team-dark': visibleTeamColor(hex) } : {}
}

export function ordinal(n) {
  const mod100 = n % 100
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'
  return `${n}${suffix}`
}

const present = v => v != null && !Number.isNaN(v)

// Competition ranking (1, 2, 2, 4): tied teams share the better rank.
export function rankIn(value, values, better = 'higher') {
  if (!present(value)) return null
  const vals = values.filter(present)
  const ahead = vals.filter(v => (better === 'higher' ? v > value : v < value)).length
  return { rank: ahead + 1, of: vals.length }
}

// Share of the other teams this one is better than, ties counting half.
export function percentileIn(value, values, better = 'higher') {
  if (!present(value)) return null
  const vals = values.filter(present)
  if (vals.length < 2) return null
  let beaten = 0
  let tied = -1
  for (const v of vals) {
    if (v === value) tied++
    else if (better === 'higher' ? v < value : v > value) beaten++
  }
  return Math.round(((beaten + Math.max(tied, 0) / 2) / (vals.length - 1)) * 100)
}

export const actualWins = s => s.wins + s.ties / 2

export const pypatWins = s => s.pythagoreanPat * s.gamesPlayed

export function recordText({ wins, losses, ties }) {
  return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`
}

export function teamGames(eloGames, teamId) {
  return eloGames
    .filter(g => g.homeTeam.teamId === teamId || g.awayTeam.teamId === teamId)
    .map(g => {
      const home = g.homeTeam.teamId === teamId
      const teamScore = home ? g.homeScore : g.awayScore
      const oppScore = home ? g.awayScore : g.homeScore
      const preElo = home ? g.homePregameElo : g.awayPregameElo
      const postElo = home ? g.homePostgameElo : g.awayPostgameElo
      const upset = upsetInfo(g)
      return {
        gameId: g.gameId,
        season: g.season,
        week: g.week,
        playoff: g.week >= REGULAR_WEEKS,
        home,
        opp: home ? g.awayTeam : g.homeTeam,
        oppPreElo: home ? g.awayPregameElo : g.homePregameElo,
        teamScore,
        oppScore,
        result: teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'T',
        winProb: home ? g.homeWinProbability : g.awayWinProbability,
        preElo,
        postElo,
        eloChange: postElo - preElo,
        upset: upset && { ...upset, won: upset.winner.teamId === teamId },
      }
    })
    .sort((a, b) => a.season - b.season || a.week - b.week)
}

export function tally(games) {
  const t = { w: 0, l: 0, t: 0, pf: 0, pa: 0 }
  for (const g of games) {
    if (g.result === 'W') t.w++
    else if (g.result === 'L') t.l++
    else t.t++
    t.pf += g.teamScore
    t.pa += g.oppScore
  }
  return t
}

export const tallyText = t => (t.t ? `${t.w}-${t.l}-${t.t}` : `${t.w}-${t.l}`)

export const eloExpectedWins = games => games.reduce((sum, g) => sum + g.winProb, 0)

export function seasonArc(games) {
  let wins = 0
  let expected = 0
  return games.map(g => {
    wins += g.result === 'W' ? 1 : g.result === 'T' ? 0.5 : 0
    expected += g.winProb
    return { ...g, cumWins: wins, cumExpected: expected }
  })
}

export function teamUpcoming(upcoming, teamId) {
  return upcoming
    .filter(u => u.homeTeam.teamId === teamId || u.awayTeam.teamId === teamId)
    .map(u => {
      const home = u.homeTeam.teamId === teamId
      return {
        game: u,
        gameId: u.gameId,
        week: u.week,
        home,
        opp: home ? u.awayTeam : u.homeTeam,
        elo: home ? u.homeElo : u.awayElo,
        oppElo: home ? u.awayElo : u.homeElo,
        winProb: home ? u.homeWinProbability : u.awayWinProbability,
      }
    })
    .sort((a, b) => a.week - b.week)
}

export function headToHead(games) {
  const byOpp = new Map()
  for (const g of games) {
    if (!byOpp.has(g.opp.teamId)) byOpp.set(g.opp.teamId, { opp: g.opp, games: [] })
    byOpp.get(g.opp.teamId).games.push(g)
  }
  return [...byOpp.values()].map(({ opp, games: list }) => {
    const t = tally(list)
    return {
      opp,
      games: list.length,
      ...t,
      winPct: (t.w + t.t / 2) / list.length,
      diff: t.pf - t.pa,
      playoffGames: list.filter(g => g.playoff).length,
      last: list[list.length - 1],
    }
  })
}

export function franchiseSeasons(trends, eloHistory, games, teamId) {
  return trends
    .map(t => {
      const row = t.standings.find(s => s.teamId === teamId)
      if (!row) return null
      const weeks = eloHistory.filter(h => h.teamId === teamId && h.season === t.seasonIndex)
      const final = weeks.reduce((m, h) => (m == null || h.week > m.week ? h : m), null)
      const playoffs = games.filter(g => g.season === t.seasonIndex && g.playoff)
      return {
        season: t.seasonIndex,
        ...row,
        finalElo: final?.endElo ?? null,
        finalRank: final?.rank ?? null,
        peakElo: weeks.length ? Math.max(...weeks.map(h => h.endElo)) : null,
        playoffs: playoffs.length ? tally(playoffs) : null,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.season - b.season)
}

export function eloPeaks(points) {
  if (!points.length) return null
  return points.reduce((m, p) => ({
    peak: p.endElo > m.peak.endElo ? p : m.peak,
    trough: p.endElo < m.trough.endElo ? p : m.trough,
  }), { peak: points[0], trough: points[0] })
}
