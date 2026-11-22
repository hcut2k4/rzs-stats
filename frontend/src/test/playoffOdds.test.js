import { describe, expect, it } from 'vitest'
import { formatOdds, probShade, chanceShade, swingShade, SEED_COLORS } from '../utils/playoffOdds'

describe('formatOdds', () => {
  it.each([[0, '<1%'], [0.00499, '<1%'], [0.005, '1%'], [0.644, '64%'], [0.645, '65%'], [0.99499, '99%'], [0.995, '>99%'], [1, '>99%'], [null, '—'], [undefined, '—'], [NaN, '—']])('formats %s as %s', (p, text) => expect(formatOdds(p)).toBe(text))
  it('allows proven certainty to round to zero or one hundred', () => {
    expect(formatOdds(0, true)).toBe('0%')
    expect(formatOdds(1, true)).toBe('100%')
  })
})

const luminance = hex => {
  const rgb = hex.match(/[0-9a-f]{2}/gi).map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
}
const contrast = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05)

it('shades playoff probability on a fixed red to green scale', () => {
  expect(probShade(.01)).toBe('rgb(220 38 38 / 0.413)')
  expect(probShade(.99)).toBe('rgb(22 163 74 / 0.413)')
  expect(probShade(.5)).toBeUndefined()
  expect(probShade(0)).toBe('rgb(220 38 38 / 0.420)')
  expect(probShade(1)).toBe('rgb(22 163 74 / 0.420)')
})
it('uses green intensity for chances and capped blue intensity for either swing direction', () => {
  expect(chanceShade(0)).toBeUndefined()
  expect(chanceShade(.5)).toBe('rgb(22 163 74 / 0.240)')
  expect(chanceShade(1)).toBe('rgb(22 163 74 / 0.420)')
  expect(swingShade(0)).toBeUndefined()
  expect(swingShade(30)).toBe('rgb(37 99 235 / 0.240)')
  expect(swingShade(-30)).toBe(swingShade(30))
  expect(swingShade(90)).toBe('rgb(37 99 235 / 0.420)')
})
it.each([null, undefined, NaN])('leaves missing shading blank: %s', value => {
  expect(probShade(value)).toBeUndefined()
  expect(chanceShade(value)).toBeUndefined()
  expect(swingShade(value)).toBeUndefined()
})
it('distinguishes neighbouring seeds and both light and dark surfaces by luminance', () => {
  expect(new Set(SEED_COLORS).size).toBe(7)
  const values = SEED_COLORS.map(luminance)
  for (const value of values) {
    for (const surface of ['#ffffff', '#f5f7fa', '#0b0e13', '#141921']) expect(contrast(value, luminance(surface))).toBeGreaterThan(2)
  }
  for (let i = 1; i < values.length; i++) expect(contrast(values[i], values[i - 1])).toBeGreaterThan(1.25)
})
