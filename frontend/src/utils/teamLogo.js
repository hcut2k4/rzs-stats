const ESPN_ABBR = { AZ: 'ari' }

export function teamLogoUrl(abbrName) {
  const abbr = ESPN_ABBR[abbrName] ?? abbrName?.toLowerCase()
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png`
}
