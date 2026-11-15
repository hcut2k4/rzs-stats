import { normalize, goodBadColor, divergeColor, magnitudeColor } from '../utils/heat'

describe('normalize', () => {
  it('scales min to 0 and max to 1', () => {
    expect(normalize(1, [1, 2, 3])).toBe(0)
    expect(normalize(3, [1, 2, 3])).toBe(1)
  })

  it('inverts when lower is better', () => {
    expect(normalize(1, [1, 2, 3], 'lower')).toBe(1)
  })

  it('returns null for missing values and degenerate ranges', () => {
    expect(normalize(null, [1, 2])).toBeNull()
    expect(normalize(1, [1])).toBeNull()
    expect(normalize(2, [2, 2, 2])).toBeNull()
  })
})

describe('goodBadColor', () => {
  it('uses green for the best value and red for the worst', () => {
    expect(goodBadColor(3, [1, 2, 3])).toContain('22 163 74')
    expect(goodBadColor(1, [1, 2, 3])).toContain('220 38 38')
  })

  it('leaves the midpoint uncoloured', () => {
    expect(goodBadColor(2, [1, 2, 3])).toBeUndefined()
  })

  it('treats lower values as better when direction is lower', () => {
    expect(goodBadColor(1, [1, 2, 3], 'lower')).toContain('22 163 74')
  })

  it('leaves null values uncoloured', () => {
    expect(goodBadColor(null, [1, 2, 3])).toBeUndefined()
  })
})

describe('divergeColor', () => {
  it('has no colour at zero', () => {
    expect(divergeColor(0)).toBeUndefined()
  })

  it('uses different hues for positive and negative values', () => {
    expect(divergeColor(1)).toContain('37 99 235')
    expect(divergeColor(-1)).toContain('234 88 12')
  })

  it('caps intensity at the limit', () => {
    expect(divergeColor(10)).toBe(divergeColor(3))
  })
})

describe('magnitudeColor', () => {
  it('is stronger for larger values', () => {
    const alpha = c => Number(c.match(/\/ ([\d.]+)\)/)[1])
    expect(alpha(magnitudeColor(3, [1, 2, 3]))).toBeGreaterThan(alpha(magnitudeColor(1, [1, 2, 3])))
  })
})
