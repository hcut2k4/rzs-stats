import { describe, expect, it } from 'vitest'
import { formatOdds } from '../utils/playoffOdds'

describe('formatOdds', () => {
  it.each([[0, '<1%'], [0.00499, '<1%'], [0.005, '1%'], [0.644, '64%'], [0.645, '65%'], [0.99499, '99%'], [0.995, '>99%'], [1, '>99%'], [null, '—'], [undefined, '—'], [NaN, '—']])('formats %s as %s', (p, text) => expect(formatOdds(p)).toBe(text))
  it('allows proven certainty to round to zero or one hundred', () => {
    expect(formatOdds(0, true)).toBe('0%')
    expect(formatOdds(1, true)).toBe('100%')
  })
})
