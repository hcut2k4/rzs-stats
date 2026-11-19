const ESPN_ABBR = { AZ: 'ari' }

export function teamLogoUrl(abbrName) {
  const abbr = ESPN_ABBR[abbrName] ?? abbrName?.toLowerCase()
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png`
}

const logos = new Map()

export function loadLogo(abbr) {
  if (!abbr) return Promise.resolve(null)
  if (logos.has(abbr)) return logos.get(abbr)
  const promise = new Promise(resolve => {
    const image = new Image()
    const finish = value => {
      clearTimeout(timer)
      image.onload = image.onerror = null
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), 3000)
    image.onload = () => finish(image)
    image.onerror = () => finish(null)
    image.crossOrigin = 'anonymous'
    image.src = teamLogoUrl(abbr)
  })
  logos.set(abbr, promise)
  return promise
}
