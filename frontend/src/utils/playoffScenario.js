const codes = { h: 'home', a: 'away', t: 'tie' }
export function parsePicks(text, games) {
  const known = new Set(games.map(g => g.gameId))
  const picks = new Map()
  for (const part of (text ?? '').split(',')) {
    const match = /^(\d+)([hat])$/.exec(part)
    if (!match) continue
    const id = Number(match[1])
    if (Number.isSafeInteger(id) && known.has(id)) picks.set(id, codes[match[2]])
  }
  return [...picks].sort((a, b) => a[0] - b[0]).map(([gameId, result]) => ({ gameId, result }))
}
export const encodePicks = picks => [...picks].sort((a, b) => a.gameId - b.gameId).map(p => `${p.gameId}${p.result[0]}`).join(',')
export function pathScenario(data, games) {
  const picks = new Map([...data.winOutRisks, ...data.rootThisWeek].map(g => [g.gameId, g.rootFor]))
  for (const g of games) {
    if (g.home.teamId === data.team.teamId) picks.set(g.gameId, 'home')
    else if (g.away.teamId === data.team.teamId) picks.set(g.gameId, 'away')
  }
  const params = new URLSearchParams({ tab: 'whatif', season: data.season, rules: data.rules, picks: encodePicks([...picks].map(([gameId, result]) => ({ gameId, result }))) })
  return `/playoffs?${params}`
}
