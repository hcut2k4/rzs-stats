const BLUE = '37 99 235'
const GREEN = '22 163 74'
const RED = '220 38 38'
const ORANGE = '234 88 12'

const MAX_ALPHA = 0.42

const tint = (rgb, strength) => `rgb(${rgb} / ${(0.06 + strength * (MAX_ALPHA - 0.06)).toFixed(3)})`

export function normalize(value, allValues, direction = 'higher') {
  if (value == null || Number.isNaN(value)) return null
  const vals = allValues.filter(v => v != null && !Number.isNaN(v))
  if (vals.length < 2) return null
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (max === min) return null
  const t = (value - min) / (max - min)
  return direction === 'lower' ? 1 - t : t
}

export function magnitudeColor(value, allValues) {
  const t = normalize(value, allValues, 'higher')
  return t == null ? undefined : tint(BLUE, t)
}

export function goodBadColor(value, allValues, direction = 'higher') {
  const t = normalize(value, allValues, direction)
  if (t == null) return undefined
  if (t === 0.5) return undefined
  return t > 0.5 ? tint(GREEN, (t - 0.5) * 2) : tint(RED, (0.5 - t) * 2)
}

export function divergeColor(value, limit = 3) {
  if (value == null || Number.isNaN(value)) return undefined
  const strength = Math.min(Math.abs(value) / limit, 1)
  if (strength === 0) return undefined
  return tint(value > 0 ? BLUE : ORANGE, strength)
}
