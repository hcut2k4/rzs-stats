import { describe, expect, it } from 'vitest'
import { TIERS, pct0 } from '../utils/eloLean'
import {
  possessive, landscapeSummary, truthSummary, roadSummary, roadFooter, outlookTip,
  arcSummary, trajectoryCopy, franchiseSummary, rivalrySummary,
} from '../utils/teamProfileCopy'
import { arcSpec, roadSpec, truthSpec, rivalrySpec } from '../components/team/specs'

const team = { displayName: 'Bears', wins: 5, losses: 2, ties: 0 }
const lanes = (actual, pypat, elo) => [
  { key: 'actual', value: actual }, { key: 'pypat', value: pypat },
  ...(elo == null ? [] : [{ key: 'elo', value: elo }]),
]

describe('team profile copy', () => {
  it.each([['Bears', "Bears'"], ['Cowboys', "Cowboys'"], ['Cardinals', "Cardinals'"], ['Phoenix', "Phoenix's"]])('uses the possessive of %s', (name, expected) => {
    expect(possessive(name)).toBe(expected)
  })

  it.each([
    [2.63, 2.03, 'Good offense, good defense.', 'both better'],
    [2.63, 2.53, 'Good offense, bad defense.', 'Offense is better and defense is worse'],
    [2.03, 2.03, 'Bad offense, good defense.', 'Offense is worse and defense is better'],
    [2.03, 2.53, 'Bad offense, bad defense.', 'both worse'],
  ])('explains offense %s and defense %s against the league average', (off, def, verdict, comparison) => {
    const copy = landscapeSummary('Bears', off, def, 2.29)
    expect(copy).toContain(verdict)
    expect(copy.toLowerCase()).toContain(comparison.toLowerCase())
    expect(copy).toContain(`The Bears score ${off.toFixed(2)} points per drive and allow ${def.toFixed(2)}`)
    expect(copy).toContain('league average of 2.29')
  })

  it('does not call a value at the league average better than average', () => {
    expect(landscapeSummary('Bears', 2.29, 2.29, 2.29)).toContain('Offense is at the league average; defense is at it.')
  })

  it.each([
    [7, 'The record flatters them.', 'more than'],
    [5, 'The record checks out.', 'close to'],
    [3, 'Better than the record suggests.', 'fewer than'],
  ])('explains the luck lean for %s actual wins with and without Elo', (actual, verdict, comparison) => {
    for (const elo of [4.6, undefined]) {
      const copy = truthSummary('Bears', lanes(actual, 4.7, elo))
      expect(copy).toContain(verdict)
      expect(copy).toContain(`The Bears' ${actual} wins are ${comparison} what scoring margin (4.7)`)
      expect(copy.includes('Elo (4.6)')).toBe(elo != null)
      expect(copy).not.toMatch(/undefined|NaN/)
    }
  })

  it('reports conflicting Elo evidence without claiming both models agree', () => {
    expect(truthSummary('Bears', lanes(5, 4.7, 2))).toBe("The record checks out. The Bears' 5 wins are close to what scoring margin (4.7) predicts. Elo predicts 2.0 expected wins.")
  })

  it('uses singular wins and keeps half wins from ties', () => {
    expect(truthSummary('Bears', lanes(1, 1.2))).toContain("Bears' 1 win is close to")
    expect(truthSummary('Bears', lanes(1.5, 1.2))).toContain("Bears' 1.5 wins are close to")
  })

  it('uses the rounded projected record and preserves ties', () => {
    const road = Array.from({ length: 10 }, () => ({ winProb: 0.71 }))
    expect(roadSummary(team, road)).toBe('Elo projects 7.1 wins over the final 10 games, putting the Bears on pace for a 12–5 finish.')
    expect(roadSummary({ ...team, ties: 1 }, [{ winProb: 1 }])).toContain('1.0 win over the final 1 game')
    expect(roadSummary({ ...team, ties: 1 }, [{ winProb: 1 }])).toContain('6–2–1 finish')
    expect(roadFooter('Bears')).toContain("Bears' perspective")
    expect(roadSpec(team, 1, [{ winProb: 1 }]).qualifier).toContain('1 game left.')
  })

  it('generates every Outlook range from the tier definitions, including the final endpoint', () => {
    const tip = outlookTip()
    TIERS.forEach((tier, i) => {
      expect(tip).toContain(`${tier.label}: ${pct0(tier.lo)}–${i === TIERS.length - 1 ? '' : 'under '}${pct0(tier.hi)}`)
    })
    TIERS.push({ label: 'Test tier', lo: 1, hi: 1.1 })
    try { expect(outlookTip()).toContain('Test tier: 100%–110%') } finally { TIERS.pop() }
  })

  it('uses singular and plural upset counts and only says So far during an unfinished season', () => {
    const games = [{ upset: { won: true } }, { upset: { won: false } }]
    expect(arcSummary('Bears', games, true)).toBe("How each game changed the Bears' Elo rating, based on the result and their pregame win probability. So far: 1 upset win and 1 upset loss.")
    expect(arcSummary('Bears', [...games, ...games], false)).toContain('2 upset wins and 2 upset losses.')
    expect(arcSummary('Bears', games, false)).not.toContain('So far')
    expect(arcSummary('Bears', [{}], true)).toContain('No upsets either way.')
  })

  it.each([[15.7, 'risen 15.7 points'], [-15.7, 'fallen 15.7 points'], [0.01, 'changed little'], [-0.01, 'changed little'], [1, 'risen 1.0 point']])('describes an Elo change of %s', (change, phrase) => {
    expect(trajectoryCopy(change)).toContain(`Elo has ${phrase} since the season opener, including playoffs.`)
    expect(trajectoryCopy(change)).toContain('The horizontal line marks the league-average rating of 1500.')
  })

  it('does not turn missing Elo movement into a numerical claim', () => {
    for (const value of [null, undefined, NaN]) expect(trajectoryCopy(value)).toContain('Elo movement since the season opener is unavailable.')
  })

  it('describes franchise records, season counts and absent playoff games', () => {
    const regular = { w: 27, l: 14, t: 0 }
    expect(franchiseSummary('Bears', regular, { w: 2, l: 2, t: 0 }, 3)).toBe('The Bears are 27–14 in the regular season and 2–2 in the playoffs across 3 seasons.')
    expect(franchiseSummary('Bears', regular, { w: 0, l: 0, t: 0 }, 1)).toBe('The Bears are 27–14 in the regular season with no playoff games across 1 season.')
    expect(rivalrySummary('Bears', 1)).toBe('Head-to-head records against all 1 opponent the Bears have faced, including playoff games.')
  })

  it('shares generated summaries and labels with export specifications', () => {
    const truth = truthSpec(team, 1, lanes(5, 4.7, 4.6))
    expect(truth.qualifier).toContain(truth.description)
    const arc = arcSpec(team, 1, [{ upset: { won: true } }], true)
    expect(arc.qualifier).toContain(arc.description)
    const road = roadSpec(team, 1, [{ winProb: 0.7 }])
    expect(road.qualifier).toContain(road.description)
    expect(road.cols.find(c => c.label === 'Outlook').desc).toBe(outlookTip())
    expect(road.tiles.map(t => t.label)).toEqual(['Projected record', 'Favored in', 'Remaining SoS'])
    const rivalry = rivalrySpec(team, [], { key: 'ppg', asc: false }, 25)
    expect(rivalry.qualifier).toContain('Pts/G For–Against')
    expect(rivalry.cols.map(c => c.label)).toEqual(['Opponent', 'GP', 'W', 'L', 'T', 'Point Diff', 'Pts/G For–Against', 'Last meeting'])
  })
})
