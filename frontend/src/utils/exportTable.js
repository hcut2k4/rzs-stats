import * as XLSX from 'xlsx'

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const fileStem = spec => slug(`${spec.name} ${(spec.qualifier ?? '').split(' · ')[0]}`)

export function downloadBlob(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function specCols(cols, cellColor) {
  return cols.map(col => ({
    label: col.exportLabel ?? col.label, group: col.group, desc: col.desc ?? col.title,
    align: col.align, z: col.z, keepText: col.keepText,
    value: col.value ?? (col.tx ? undefined : row => col.getValue ? col.getValue(row) : row[col.key]),
    text: (row, i) => String(col.tx ? col.tx(row[col.key], i, row) : col.fmt ? col.fmt(row[col.key], i, row) : row[col.key] ?? ''),
    color: cellColor ? (row, i) => cellColor(col, col.getValue ? col.getValue(row) : row[col.key], row, i) : undefined,
  }))
}

const missing = value => value == null || Number.isNaN(value)
const headers = cols => cols.map(col => cols.filter(c => c.label === col.label).length > 1 ? `${col.group} ${col.label}` : col.label)
const cellText = (col, row, i) => !col.keepText && col.value && missing(col.value(row, i)) ? '' : String(col.text(row, i))

export function toRows(spec) {
  return [headers(spec.cols), ...spec.rows.map((row, i) => spec.cols.map(col => cellText(col, row, i)))]
}

const quoteCell = cell => /[,"\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
// A spreadsheet runs a cell that starts with = + - @ as a formula, so a player named "=HYPERLINK(...)" would execute. Importers also skip leading whitespace and fold full-width lookalikes, so look past both. Plain signed numbers like -20 or +0.4 must stay numbers.
const neutralize = cell => /^[\s\x00-\x1f]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/.test(cell) && !/^[+-]?\d[\d,]*(\.\d+)?%?$/.test(cell) ? `'${cell}` : cell

export function csvText(spec, { spreadsheetSafe = false } = {}) {
  return toRows(spec).map(row => row.map(cell => quoteCell(spreadsheetSafe ? neutralize(cell) : cell)).join(',')).join('\n')
}

export function exportCsv(spec) {
  downloadBlob(new Blob(['\uFEFF', csvText(spec, { spreadsheetSafe: true })], { type: 'text/csv' }), `${fileStem(spec)}.csv`)
}

export function buildWorkbook(spec) {
  const rows = [headers(spec.cols), ...spec.rows.map((row, i) => spec.cols.map(col => {
    const value = col.value?.(row, i)
    return col.value && col.z && !missing(value) ? { t: 'n', v: value, z: col.z } : cellText(col, row, i)
  }))]
  const wb = XLSX.utils.book_new()
  const cleanName = name => name.replace(/[\[\]:*?/\\]/g, '').slice(0, 31)
  const name = cleanName((spec.qualifier ?? '').split(' · ')[0]) || cleanName(spec.name)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return wb
}

export function exportExcel(spec) {
  XLSX.writeFile(buildWorkbook(spec), `${fileStem(spec)}.xlsx`)
}

const INTRO = "Red Zone Sports (RZS) is a private Madden NFL online franchise league; human owners run all 32 teams, games not played are simulated; results are pulled from the league's NeonSportz host into a database and served by rzs-stats, a public site computing PyPAT, Luck, SoS, Elo, QB TANY/A and team efficiency. This is simulated-football data, NOT real NFL data. Team names are NFL names but every result happened only inside this league. Do not reconcile with real NFL seasons."

const CONVENTIONS = `- Season index is 0-based; the league's display number is index + 103 (season=5 is "Season 108"). Always send the index.
- Week index is 0-based (week=0 is Week 1). Playoffs are weeks 18+ (18 wild card, 19 divisional, 20 conference, 22 Super Bowl).
- \`stage\` means different things in a response and in a request. In a RESPONSE, \`stageIndex\` is storage: 0 = preseason, 1 = regular season AND playoffs together. In a REQUEST: /api/games and /api/games/weeks take a NUMBER, stage=1 regular season and stage=2 playoffs (the server maps 2 to stored stage 1, weeks 18+; /api/games/weeks?stage=1 returns regular-season weeks only so you will not discover playoff weeks that way). /api/qb/* and /api/efficiency take a NAME: regular | playoffs | both (case-insensitive); a numeric stage (e.g. stage=1) returns HTTP 400. standings, trends and the Elo endpoints take no stage.
- Elo endpoints take OPTIONAL filters, and what an omitted filter means differs by endpoint: /api/elo/ratings returns the one latest snapshot matching the filters (no params = the latest season's latest week); /api/elo/history takes only \`season\` and returns every team's weekly row for every matching season (no param = ALL seasons); /api/elo/games takes season, week and teamId filters and returns every matching completed game (no params = EVERY game ever recorded); /api/elo/upcoming defaults season to the latest season and can filter by week. /api/standings, /api/games, /api/efficiency, /api/trends/weekly REQUIRE season (omitting it is a 400), and /api/games also requires week.
- A game with status >= 2 is completed and counted; below 2 it is unplayed.
- Nullable fields: an empty CSV field means null/no data, which is NOT zero (this matters most for SoS and the efficiency rates).`

const RELATED = [
  ['/api/seasons', 'Valid season indexes'],
  ['/api/standings?season=<s>', 'Season standings'],
  ['/api/trends/season', 'Every season and team'],
  ['/api/trends/weekly?season=<s>', 'Weekly cumulative team trends'],
  ['/api/games?season=<s>&stage=1&week=<w>', 'Game results (stage=2 for playoffs)'],
  ['/api/games/weeks?season=<s>&stage=1', 'Available regular-season weeks'],
  ['/api/elo/ratings?season=<s>&week=<w>', 'Team Elo ratings'],
  ['/api/elo/history?season=<s>', 'Elo rating history'],
  ['/api/elo/games?season=<s>&week=<w>', 'Played games and Elo changes'],
  ['/api/elo/upcoming?season=<s>', 'Upcoming game projections'],
  ['/api/efficiency?season=<s>&stage=regular', 'Team efficiency rates'],
  ['/api/qb/leaderboard?scope=SEASON&season=<s>&stage=REGULAR', 'Quarterback leaderboard'],
  ['/api/qb/movement?season=<s>&stage=REGULAR&window=1&basis=SEASON', 'Quarterback movement and rank history'],
]

export function aiText(spec, origin = window.location.origin) {
  const query = new URLSearchParams(Object.entries(spec.api.params ?? {}).filter(([, value]) => value != null)).toString()
  return [
    `# RZS Stats — ${spec.name}`, spec.qualifier,
    '## What this data is', INTRO,
    '## This table', spec.description,
    '## Columns', headers(spec.cols).map((label, i) => `- \`${label}\` — ${spec.cols[i].desc}`).join('\n'),
    ...(spec.notes?.length ? ['## Reading notes', spec.notes.map(note => `- ${note}`).join('\n')] : []),
    `## Data (CSV, ${spec.rows.length} rows)`, `\`\`\`csv\n${csvText(spec)}\n\`\`\``,
    '## Getting fresh data yourself (public REST API, no authentication)',
    `Base URL: ${origin}/api — all GET, all JSON, no key.`,
    'This exact table came from:', `    GET ${origin}/api${spec.api.path}${query ? `?${query}` : ''}`,
    ...(spec.api.note ? [spec.api.note] : []),
    'Related endpoints:', RELATED.map(([path, desc]) => `- \`GET ${path}\` — ${desc}`).join('\n'),
    ...(spec.api.fields ? ['### Mapping this table back to the API response', Object.entries(spec.api.fields).map(([label, desc]) => `- \`${label}\` — ${desc}`).join('\n')] : []),
    '### Conventions you must know', CONVENTIONS,
    `Generated ${new Date().toISOString().slice(0, 10)} from ${origin}${window.location.pathname}`,
  ].join('\n\n')
}

export async function copyAi(spec) {
  const text = aiText(spec)
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    const focused = document.activeElement
    try {
      textarea.select()
      if (document.execCommand('copy')) return 'copied'
    } catch {
    } finally {
      textarea.remove()
      focused?.focus()
    }
    downloadBlob(new Blob([text], { type: 'text/markdown' }), `${fileStem(spec)}-ai.md`)
    return 'downloaded'
  }
}
