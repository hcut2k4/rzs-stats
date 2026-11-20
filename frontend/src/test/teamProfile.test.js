import {
  eloExpectedWins, fingerprint, franchiseSeasons, headToHead, ordinal, percentileIn, projectedRecord, rankIn, seasonArc, sosLeftVariant, sosVariant, currentRegularWeek, teamColor, teamGames,
  teamUpcoming, visibleTeamColor, rankTone,
} from '../utils/teamProfile'

const team = (teamId, abbrName) => ({ teamId, abbrName, displayName: abbrName + 'x' })
const game = (season, week, home, away, homeScore, awayScore, homeWinProbability = 0.5) => ({
  gameId: season * 100 + week, season, week, homeTeam: home, awayTeam: away, homeScore, awayScore,
  homeWinProbability, awayWinProbability: 1 - homeWinProbability,
  homePregameElo: 1500, awayPregameElo: 1500, homePostgameElo: 1510, awayPostgameElo: 1490,
})
const A = team(1, 'AAA')
const B = team(2, 'BBB')
const C = team(3, 'CCC')

describe('percentileIn', () => {
  it('ranks against the other teams with ties counting half', () => {
    expect(percentileIn(4, [1, 2, 3, 4, 5])).toBe(75)
    expect(percentileIn(5, [1, 2, 3, 4, 5])).toBe(100)
    expect(percentileIn(1, [1, 2, 3, 4, 5])).toBe(0)
    expect(percentileIn(2, [1, 2, 2, 3])).toBe(50)
  })

  it('flips so lower is better when asked', () => {
    expect(percentileIn(1, [1, 2, 3, 4, 5], 'lower')).toBe(100)
  })

  it('leaves out missing values and returns null for a missing value', () => {
    expect(percentileIn(3, [null, 1, 3, NaN, 5])).toBe(50)
    expect(percentileIn(null, [1, 2, 3])).toBeNull()
    expect(percentileIn(3, [3])).toBeNull()
  })
})

describe('rankIn', () => {
  it('uses competition ranking and skips nulls', () => {
    expect(rankIn(3, [5, 3, 3, null, 1])).toEqual({ rank: 2, of: 4 })
    expect(rankIn(1, [5, 3, 1], 'lower')).toEqual({ rank: 1, of: 3 })
    expect(rankIn(undefined, [1, 2])).toBeNull()
  })
})

it('formats ordinals including the teens', () => {
  expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 32].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '32nd'])
})

it('decodes the NeonSportz decimal color and lifts only very dark colors', () => {
  expect(teamColor('16727040')).toBe('#ff3c00')
  expect(teamColor('0')).toBe('#000000')
  expect(teamColor(null)).toBeNull()
  expect(teamColor('red')).toBeNull()
  expect(visibleTeamColor('#ff3c00')).toBe('#ff3c00')
  expect(visibleTeamColor('#002244')).not.toBe('#002244')
})

describe('teamGames', () => {
  const games = [
    game(1, 0, A, B, 21, 14, 0.3),
    game(1, 1, C, A, 24, 10, 0.7),
    game(0, 5, B, A, 17, 17, 0.5),
    game(1, 18, A, C, 30, 3, 0.85),
    game(1, 2, B, C, 7, 3),
  ]

  it('reads every game from the team side, in season and week order, ignoring other teams', () => {
    const rows = teamGames(games, A.teamId)
    expect(rows.map(g => [g.season, g.week, g.result, g.teamScore, g.oppScore, g.home, g.opp.abbrName])).toEqual([
      [0, 5, 'T', 17, 17, false, 'BBB'],
      [1, 0, 'W', 21, 14, true, 'BBB'],
      [1, 1, 'L', 10, 24, false, 'CCC'],
      [1, 18, 'W', 30, 3, true, 'CCC'],
    ])
    expect(rows[2].winProb).toBeCloseTo(0.3)
    expect(rows[2].eloChange).toBe(-10)
    expect(rows[3].playoff).toBe(true)
  })

  it('flags an upset win as the underdog and an upset loss as the favorite', () => {
    const rows = teamGames(games, A.teamId)
    expect(rows[1].upset).toMatchObject({ won: true, label: 'Big upset' })
    expect(rows[2].upset).toBeNull()
    expect(teamGames(games, B.teamId).find(g => g.week === 0).upset).toMatchObject({ won: false })
  })

  it('sums pregame win chance as Elo expected wins and tracks the running totals', () => {
    const rows = teamGames(games, A.teamId).filter(g => g.season === 1 && !g.playoff)
    expect(eloExpectedWins(rows)).toBeCloseTo(0.6)
    const arc = seasonArc(rows)
    expect(arc.map(g => g.cumWins)).toEqual([1, 1])
    expect(arc[1].cumExpected).toBeCloseTo(0.6)
  })

  it('aggregates head to head by opponent', () => {
    const rows = headToHead(teamGames(games, A.teamId))
    const vsB = rows.find(r => r.opp.teamId === B.teamId)
    expect(vsB).toMatchObject({ games: 2, w: 1, l: 0, t: 1, pf: 38, pa: 31, diff: 7, winPct: 0.75, playoffGames: 0 })
    expect(vsB.last.week).toBe(0)
    expect(rows.find(r => r.opp.teamId === C.teamId)).toMatchObject({ games: 2, w: 1, l: 1, playoffGames: 1 })
  })
})

it('reads remaining games from the team side', () => {
  const up = [
    { gameId: 1, season: 1, week: 9, homeTeam: B, awayTeam: A, homeElo: 1550, awayElo: 1450, homeWinProbability: 0.7, awayWinProbability: 0.3 },
    { gameId: 2, season: 1, week: 8, homeTeam: A, awayTeam: C, homeElo: 1450, awayElo: 1400, homeWinProbability: 0.6, awayWinProbability: 0.4 },
    { gameId: 3, season: 1, week: 8, homeTeam: B, awayTeam: C, homeElo: 1550, awayElo: 1400, homeWinProbability: 0.8, awayWinProbability: 0.2 },
  ]
  expect(teamUpcoming(up, A.teamId).map(r => [r.week, r.home, r.opp.abbrName, r.winProb, r.oppElo])).toEqual([
    [8, true, 'CCC', 0.6, 1400],
    [9, false, 'BBB', 0.3, 1550],
  ])
})

it('builds one franchise row per season, newest first, with final Elo and playoff record', () => {
  const row = (teamId, wins) => ({ teamId, wins, losses: 17 - wins, ties: 0, gamesPlayed: 17, pythagoreanPat: 0.5, winDiff: 0 })
  const trends = [
    { seasonIndex: 1, weekIndex: null, standings: [row(1, 12), row(2, 5)] },
    { seasonIndex: 0, weekIndex: null, standings: [row(1, 8)] },
  ]
  const history = [
    { teamId: 1, season: 0, week: 17, endElo: 1520, rank: 9 },
    { teamId: 1, season: 1, week: 3, endElo: 1600, rank: 2 },
    { teamId: 1, season: 1, week: 19, endElo: 1580, rank: 3 },
    { teamId: 2, season: 1, week: 19, endElo: 1400, rank: 30 },
  ]
  const games = teamGames([game(1, 18, A, B, 20, 10), game(1, 19, C, A, 31, 3)], A.teamId)
  const rows = franchiseSeasons(trends, history, games, A.teamId)
  expect(rows.map(r => [r.season, r.wins, r.finalElo, r.finalRank, r.peakElo])).toEqual([
    [1, 12, 1580, 3, 1600],
    [0, 8, 1520, 9, 1520],
  ])
  expect(rows[1].playoffs).toBeNull()
  expect(rows[0].playoffs).toMatchObject({ w: 1, l: 1 })
})

describe('fingerprint', () => {
  const side = (pointsPerDrive, sackRate) => ({ drives: 10, plays: 60, pointsPerDrive, pointsPerPlay: null, yardsPerPlay: 5, seriesRate: 0.7, thirdDownRate: 0.4, redZoneTdRate: 0.5, giveawayRate: 0.1, sackRate })
  const standing = (teamId, pointsFor, pointsAgainst) => ({ teamId, gamesPlayed: 2, pointsFor, pointsAgainst })
  const standings = [standing(1, 60, 20), standing(2, 40, 40), standing(3, 20, 60)]
  const efficiency = [
    { teamId: 1, offense: side(3, 0.02), defense: side(1, 0.10) },
    { teamId: 2, offense: side(2, 0.05), defense: side(2, 0.05) },
    { teamId: 3, offense: side(1, 0.08), defense: side(3, 0.02) },
  ]
  const groups = fingerprint(standings[0], standings, efficiency)
  const row = (group, key) => groups.find(g => g.title === group).rows.find(r => r.key === key)

  it('puts the best team at 100 whichever direction is better', () => {
    expect(row('Offense', 'offense.pointsPerGame').percentile).toBe(100)
    expect(row('Offense', 'offense.pointsPerDrive').percentile).toBe(100)
    expect(row('Offense', 'offense.sackRate').percentile).toBe(100)
    expect(row('Defense', 'defense.pointsPerGame').percentile).toBe(100)
    expect(row('Defense', 'defense.pointsPerDrive').percentile).toBe(100)
    expect(row('Defense', 'defense.sackRate')).toMatchObject({ percentile: 100, better: 'higher', label: 'Sack %' })
    expect(row('Defense', 'defense.giveawayRate').label).toBe('Takeaways/Drive')
  })

  it('leaves a missing metric without a percentile', () => {
    expect(row('Offense', 'offense.pointsPerPlay')).toMatchObject({ value: null, percentile: null, rank: null, text: '—' })
  })
})

it('reads prior-season schedule strength only for the active season', () => {
  expect(sosVariant(2, 2)).toBe('Prev')
  expect(sosVariant(1, 2)).toBe('Curr')
  expect(sosVariant(0, 0)).toBe('Curr')
})

it('projects whole remaining games and keeps existing ties', () => {
  const road = [{ winProb: 0.6 }, { winProb: 0.7 }, { winProb: 0.3 }]
  expect(projectedRecord({ wins: 5, losses: 3, ties: 1 }, road)).toEqual({ wins: 7, losses: 4, ties: 1 })
})

describe('remaining schedule strength', () => {
  it.each([[8, 'Prev'], [9, 'Curr'], [10, 'Curr']])('uses %s as the current week and selects %s quality', (week, variant) => {
    expect(sosLeftVariant(2, 2, week)).toBe(variant)
  })

  it('uses current-season quality for finished seasons and season zero', () => {
    for (const week of [null, 8, 9, 10]) {
      expect(sosLeftVariant(1, 2, week)).toBe('Curr')
      expect(sosLeftVariant(0, 0, week)).toBe('Curr')
    }
  })

  it('keeps previous-season quality when the current week is unknown', () => {
    expect(sosLeftVariant(2, 2, null)).toBe('Prev')
    expect(sosLeftVariant(2, 2, undefined)).toBe('Prev')
  })

  it('finds the earliest upcoming regular-season week and ignores playoffs and missing weeks', () => {
    expect(currentRegularWeek([{ week: 10 }, { week: 18 }, { week: 8 }, { week: null }])).toBe(8)
    expect(currentRegularWeek([{ week: 0 }, { week: 9 }])).toBe(0)
    expect(currentRegularWeek([{ week: 18 }])).toBeNull()
    expect(currentRegularWeek([])).toBeNull()
  })
})


it('classifies rank quartiles consistently including incomplete leagues', () => {
  expect([1, 8, 9, 24, 25, 32].map(rank => rankTone(rank, 32))).toEqual(['good', 'good', 'muted', 'muted', 'bad', 'bad'])
  expect([1, 2, 3, 4, 5].map(rank => rankTone(rank, 5))).toEqual(['good', 'good', 'muted', 'bad', 'bad'])
  expect(rankTone(null, 32)).toBe('muted')
})
