const GREEN = '22 163 74'
const BLUE = '37 99 235'
const PURPLE = '147 51 234'
const ORANGE = '234 88 12'
const YELLOW = '234 179 8'

export const LEAN_AWAY = BLUE
export const LEAN_HOME = ORANGE

const SHADE_DEEP = 0.42
const SHADE_LIGHT = 0.05

export const pct0 = v => Math.round(v * 100) + '%'

export const TIERS = [
  { label: 'Toss-up', lo: 0.50, hi: 0.55, rgb: GREEN },
  { label: 'Tilt', lo: 0.55, hi: 0.60, rgb: BLUE },
  { label: 'Lean', lo: 0.60, hi: 0.70, rgb: PURPLE },
  { label: 'Likely', lo: 0.70, hi: 0.80, rgb: ORANGE },
  { label: 'Solid', lo: 0.80, hi: 1, rgb: YELLOW },
]

export const UPSET_LEVELS = [
  { hi: 0.60, label: 'Slight upset', alpha: 0.12 },
  { hi: 0.70, label: 'Upset', alpha: 0.22 },
  { hi: 0.80, label: 'Big upset', alpha: 0.32 },
  { hi: Infinity, label: 'Stunner', alpha: 0.42 },
]

export const tierText = () => TIERS.map((t, i) => `${t.label} ${Math.round(t.lo * 100)}${i === TIERS.length - 1 ? '%+' : `–${Math.round(t.hi * 100) - 1}%`}`).join(', ')
export const outlookText = () => `How close the game should be, from the favorite's win probability: ${tierText()}.`
export const upsetText = () => `Upsets are sized by how big a favorite lost: ${UPSET_LEVELS.map(t => t.label).join(', ')}. Toss-ups are left blank. The percent is the winner's pregame win probability.`

const RED = '220 38 38'

export function upsetInfo(g) {
  if (g.homeScore === g.awayScore) return null
  const homeWon = g.homeScore > g.awayScore
  const chance = homeWon ? g.homeWinProbability : g.awayWinProbability
  const favChance = homeWon ? g.awayWinProbability : g.homeWinProbability
  if (favChance < TIERS[0].hi) return null
  const level = UPSET_LEVELS.find(l => favChance < l.hi)
  return {
    chance,
    favChance,
    winner: homeWon ? g.homeTeam : g.awayTeam,
    label: level.label,
    alpha: level.alpha,
    shade: `rgb(${RED} / ${level.alpha.toFixed(2)})`,
  }
}

export function tierShade(prob, tier) {
  const t = Math.min(Math.max((prob - tier.lo) / (tier.hi - tier.lo), 0), 1)
  return `rgb(${tier.rgb} / ${(SHADE_DEEP + (SHADE_LIGHT - SHADE_DEEP) * t).toFixed(3)})`
}

export function lean(g) {
  const homeFav = g.homeWinProbability >= g.awayWinProbability
  const prob = homeFav ? g.homeWinProbability : g.awayWinProbability
  const tier = TIERS.find(t => prob < t.hi) ?? TIERS[TIERS.length - 1]
  return {
    homeFav,
    prob,
    edge: Math.min((prob - 0.5) * 2, 1),
    tier,
    shade: tierShade(prob, tier),
    tossUp: tier.label === 'Toss-up',
    leansTo: homeFav ? g.homeTeam : g.awayTeam,
  }
}
