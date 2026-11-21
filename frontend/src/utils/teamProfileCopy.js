import { tierText } from './eloLean'
import { luckLean, quadrant, projectedRecord } from './teamProfile'

export const possessive = name => /s$/i.test(name) ? `${name}'` : `${name}'s`
export const count = (n, singular, plural = `${singular}s`) => `${n} ${n === 1 ? singular : plural}`

export const FINGERPRINT_SUMMARY = 'Each stat shows how the team ranks across the league. Higher percentiles are always better, including on defense. Farther right means better.'
export const FINGERPRINT_FOOTER = 'Numbers inside the circles are percentile ranks. 50 is the league median. Regular season only.'
export const LANDSCAPE_FOOTER = 'Teams farther up and right are stronger. Dashed lines show league averages. Regular season only.'
export const TRUTH_EXPLANATION = "PyPAT estimates how many games a team should have won based on points scored and allowed. Elo estimates expected wins using each game's pregame win probability, accounting for opponent strength. The dashed line marks actual wins. Regular season only."
export const FRANCHISE_NOTE = 'Elo rating after each week. Dotted lines mark season boundaries, when ratings are pulled toward the league average of 1500.'
export const UNQUALIFIED_TIP = 'Fewer than 10 pass attempts per team game, the minimum for league rankings.'
export { PYPAT_TIP, LUCK_TIP } from './siteCopy'

export function landscapeSummary(name, offense, defense, league) {
  const { goodOffense, goodDefense } = quadrant(offense, defense, league)
  const where = `${goodOffense ? 'Good' : 'Bad'} offense, ${goodDefense ? 'good' : 'bad'} defense.`
  const comparison = offense === league || defense === league
    ? `Offense is ${offense === league ? 'at' : goodOffense ? 'better than' : 'worse than'} the league average; defense is ${defense === league ? 'at' : goodDefense ? 'better than' : 'worse than'} it.`
    : goodOffense === goodDefense
      ? `Both ${goodOffense ? 'better' : 'worse'} than the league average of ${league.toFixed(2)}.`
      : `Offense is ${goodOffense ? 'better' : 'worse'} and defense is ${goodDefense ? 'better' : 'worse'} than the league average of ${league.toFixed(2)}.`
  const values = `The ${name} score ${offense.toFixed(2)} points per drive and allow ${defense.toFixed(2)}`
  if (offense === league || defense === league) return `${where} ${values}, against a league average of ${league.toFixed(2)}. ${comparison}`
  return goodOffense === goodDefense
    ? `${where} ${values}, ${comparison[0].toLowerCase()}${comparison.slice(1)}`
    : `${where} ${values}. ${comparison}`
}

export function truthSummary(name, lanes) {
  const actual = lanes[0].value
  const expected = lanes[1].value
  const elo = lanes.find(l => l.key === 'elo')?.value
  const lean = luckLean(actual - expected)
  const verdict = lean > 0 ? 'The record flatters them.' : lean < 0 ? 'Better than the record suggests.' : 'The record checks out.'
  const comparison = lean > 0 ? 'more than' : lean < 0 ? 'fewer than' : 'close to'
  if (elo != null && luckLean(actual - elo) !== lean) {
    return `${verdict} The ${possessive(name)} ${count(actual, 'win')} ${actual === 1 ? 'is' : 'are'} ${comparison} what scoring margin (${expected.toFixed(1)}) predicts. Elo predicts ${elo.toFixed(1)} expected wins.`
  }
  return `${verdict} The ${possessive(name)} ${count(actual, 'win')} ${actual === 1 ? 'is' : 'are'} ${comparison} what scoring margin (${expected.toFixed(1)})${elo == null ? '' : ` and Elo (${elo.toFixed(1)})`} predict${elo == null ? 's' : ''}.`
}

export function roadSummary(team, road) {
  const remaining = road.reduce((sum, r) => sum + r.winProb, 0)
  const record = projectedRecord(team, road)
  const finish = [record.wins, record.losses, ...(record.ties ? [record.ties] : [])].join('–')
  return `Elo projects ${remaining.toFixed(1)} ${remaining.toFixed(1) === '1.0' ? 'win' : 'wins'} over the final ${count(road.length, 'game')}, putting the ${team.displayName} on pace for a ${finish} finish.`
}

export const roadFooter = name => `Win probabilities are based on current Elo ratings and don't account for how ratings may change before each game. Outlook labels reflect the ${possessive(name)} perspective.`

export function outlookTip() {
  return `Based on the favorite's win probability: ${tierText()}. Win or loss labels reflect this team's perspective.`
}

export function arcSummary(name, games, inProgress) {
  const wins = games.filter(g => g.upset?.won).length
  const losses = games.filter(g => g.upset && !g.upset.won).length
  const parts = [wins ? count(wins, 'upset win') : null, losses ? count(losses, 'upset loss', 'upset losses') : null].filter(Boolean)
  return `How each game changed the ${possessive(name)} Elo rating, based on the result and their pregame win probability. ${parts.length ? `${inProgress ? 'So far: ' : ''}${parts.join(' and ')}.` : 'No upsets either way.'}`
}

export function trajectoryCopy(moved) {
  if (moved == null || !Number.isFinite(moved)) return 'Elo movement since the season opener is unavailable. The horizontal line marks the league-average rating of 1500.'
  const change = Math.abs(moved) < 0.05 ? 'changed little' : `${moved > 0 ? 'risen' : 'fallen'} ${Math.abs(moved).toFixed(1)} ${Math.abs(moved).toFixed(1) === '1.0' ? 'point' : 'points'}`
  return `Elo has ${change} since the season opener, including playoffs. The horizontal line marks the league-average rating of 1500.`
}

export const qbSummary = name => `Every quarterback who attempted a pass for the ${name}. Cell colors show how each stat compares with qualified quarterbacks across the league.`

export function franchiseSummary(name, regular, playoffs, seasons) {
  const record = t => [t.w, t.l, ...(t.t ? [t.t] : [])].join('–')
  return `The ${name} are ${record(regular)} in the regular season${playoffs.w + playoffs.l + playoffs.t ? ` and ${record(playoffs)} in the playoffs` : ' with no playoff games'} across ${count(seasons, 'season')}.`
}

export const rivalrySummary = (name, total) => `Head-to-head records against all ${count(total, 'opponent')} the ${name} have faced, including playoff games.`
