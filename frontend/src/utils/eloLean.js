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
