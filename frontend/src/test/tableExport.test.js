import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiText, buildWorkbook, copyAi, csvText, exportCsv, fileStem, specCols, toRows } from '../utils/exportTable'

const spec = {
  name: 'Standings — AFC', qualifier: 'Season 108 · x', description: 'A fixture table',
  notes: ['A reading note'], rows: [{ n: 0.681, text: 'comma, "quote"\nnewline\rreturn' }, { n: null, text: 'plain' }],
  cols: [
    { label: 'Team', desc: 'Team name', text: r => r.text },
    { label: 'Att', group: 'Passing', desc: 'Pass attempts', value: r => r.n, text: () => '68.1%', z: '0.0%' },
    { label: 'Att', group: 'Rushing', desc: 'Rush attempts', value: r => r.n, text: r => r.n == null ? '—' : 'formatted' },
    { label: 'Ratio', desc: 'Ratio or unavailable', keepText: true, value: () => null, text: () => 'n/a' },
  ],
  api: { path: '/standings', params: { season: 5, stage: null, week: undefined, q: 'a b' }, fields: { Team: 'text' }, note: 'Returned unsorted' },
}

let anchorClick
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue() } })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn().mockReturnValue('blob:test'), revokeObjectURL: vi.fn() }))
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('table exports', () => {
  it('includes headers and every row, prefixing only duplicate labels', () => {
    expect(toRows(spec)).toEqual([
      ['Team', 'Passing Att', 'Rushing Att', 'Ratio'],
      ['comma, "quote"\nnewline\rreturn', '68.1%', 'formatted', 'n/a'],
      ['plain', '', '', 'n/a'],
    ])
  })

  it('quotes commas, quotes, CR and LF with doubled inner quotes and no BOM', () => {
    expect(csvText(spec)).toBe('Team,Passing Att,Rushing Att,Ratio\n"comma, ""quote""\nnewline\rreturn",68.1%,formatted,n/a\nplain,,,n/a')
    expect(csvText(spec).startsWith('\uFEFF')).toBe(false)
  })

  it.each([null, undefined, NaN])('does not format missing numeric values: %s', value => {
    const text = vi.fn(() => { throw new Error('must not format') })
    expect(toRows({ ...spec, rows: [{}], cols: [{ label: 'Missing', value: () => value, text }] })).toEqual([['Missing'], ['']])
    expect(text).not.toHaveBeenCalled()
  })

  it('adapts page columns, preserving text overrides, formats, raw values and heat colors', () => {
    const heat = vi.fn(() => 'red')
    const cols = specCols([
      { key: 'n', label: 'Number', title: 'Tooltip', desc: 'Definition', getValue: r => r.n * 2, fmt: v => v.toFixed(2), z: '0.00', align: 'right' },
      { key: 'text', label: 'Name', tx: (v, i, row) => `${v} ${i} ${row.n}`, fmt: () => { throw new Error('JSX formatter') }, keepText: true },
      { key: 'text', label: 'Raw', title: 'Raw text' },
    ], heat)
    expect(cols[0]).toMatchObject({ desc: 'Definition', z: '0.00', align: 'right' })
    expect(cols[0].text(spec.rows[0], 0)).toBe('0.68')
    expect(cols[0].value(spec.rows[0])).toBe(1.362)
    expect(cols[0].color(spec.rows[0], 0)).toBe('red')
    expect(heat).toHaveBeenCalledWith(expect.objectContaining({ key: 'n' }), 1.362, spec.rows[0], 0)
    expect(cols[1].text({ text: 'Team', n: 3 }, 2)).toBe('Team 2 3')
    expect(cols[2].text({})).toBe('')
    expect(cols[2].desc).toBe('Raw text')
    expect(specCols([{ key: 'n', label: 'n', fmt: v => v.toFixed(3) }])[0].color).toBeUndefined()
    expect(toRows({ rows: [{ n: null }], cols: specCols([{ key: 'n', label: 'n', fmt: v => v.toFixed(3) }]) })).toEqual([['n'], ['']])
  })

  it('uses exportLabel for headers and AI column names without touching label', () => {
    const cols = specCols([{ key: 'n', label: 'Played', exportLabel: 'SoS Played', desc: 'd' }, { key: 'n', label: 'Plain', desc: 'd' }])
    expect(toRows({ rows: [{ n: 1 }], cols })[0]).toEqual(['SoS Played', 'Plain'])
  })

  it('exports tx columns as text even when their key is not on the row', () => {
    const cols = specCols([{ key: 'rank', label: '#', tx: (_, i) => i + 1 }])
    expect(cols[0].value).toBeUndefined()
    expect(toRows({ rows: [{}, {}], cols })).toEqual([['#'], ['1'], ['2']])
  })

  describe('spreadsheet formula injection', () => {
    const risky = ['=1+1', '+SUM(1)', '-2+3', '@cmd', '\t=1', '-20', '+0.4', '68.1%', '1,234', 'Plain Name']
    const formulaSpec = { ...spec, rows: risky, cols: [{ label: 'Name', desc: 'd', text: r => r }] }
    const readText = blob => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob) })

    it('prefixes text that a spreadsheet would run as a formula, and leaves plain signed numbers alone', () => {
      expect(csvText(formulaSpec, { spreadsheetSafe: true }).split('\n')).toEqual([
        'Name', "'=1+1", "'+SUM(1)", "'-2+3", "'@cmd", "'\t=1", '-20', '+0.4', '68.1%', '"1,234"', 'Plain Name',
      ])
    })

    it('also catches formulas hidden behind leading whitespace, control characters or full-width lookalikes', () => {
      const hidden = [' =1+1', '  @SUM(1)', '\u00a0+1', '\u0001=1', '\uFF1D1+1', '\uFF0B1', '\uFF20x']
      const safe = csvText({ ...formulaSpec, rows: hidden }, { spreadsheetSafe: true }).split('\n').slice(1)
      expect(safe).toEqual(hidden.map(cell => `'${cell}`))
      expect(csvText({ ...formulaSpec, rows: ['\n=1+1'] }, { spreadsheetSafe: true })).toBe("Name\n\"'\n=1+1\"")
      expect(csvText({ ...formulaSpec, rows: ['fine = ok', 'a-b', ' '] }, { spreadsheetSafe: true })).toBe('Name\nfine = ok\na-b\n ')
    })

    it('downloads the neutralized CSV but keeps the AI text raw', async () => {
      exportCsv(formulaSpec)
      const downloaded = await readText(URL.createObjectURL.mock.calls[0][0])
      expect(downloaded).toContain("'=1+1")
      expect(downloaded).not.toMatch(/(^|\n)=1\+1/)
      expect(csvText(formulaSpec)).toContain('\n=1+1\n')
      expect(aiText(formulaSpec, 'http://x')).toContain('\n=1+1\n')
    })

    it('keeps formula-looking names as text cells in the workbook', () => {
      const sheet = buildWorkbook(formulaSpec).Sheets[buildWorkbook(formulaSpec).SheetNames[0]]
      expect(sheet.A2).toMatchObject({ t: 's', v: '=1+1' })
      expect(sheet.A2.f).toBeUndefined()
    })
  })

  it('downloads CSV with a UTF-8 BOM and the shared filename', async () => {
    exportCsv(spec)
    const blob = URL.createObjectURL.mock.calls[0][0]
    const text = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsArrayBuffer(blob) })
    expect(Array.from(new Uint8Array(text).slice(0, 3))).toEqual([239, 187, 191])
    expect(blob.type).toBe('text/csv')
    expect(anchorClick.mock.instances[0].download).toBe('standings-afc-season-108.csv')
    expect(fileStem(spec)).toBe('standings-afc-season-108')
  })

  it('writes numbers only with a number format, leaves missing cells empty and sanitizes sheet names', () => {
    const wb = buildWorkbook({ ...spec, qualifier: 'Se[]:*?/\\ason 108 · x' })
    expect(wb.SheetNames).toEqual(['Season 108'])
    const sheet = wb.Sheets['Season 108']
    expect(sheet.B2).toMatchObject({ t: 'n', v: 0.681, z: '0.0%' })
    expect(sheet.C2).toMatchObject({ t: 's', v: 'formatted' })
    expect(sheet.B3).toMatchObject({ t: 's', v: '' })
    expect(buildWorkbook({ ...spec, qualifier: '[]' }).SheetNames).toEqual(['Standings — AFC'])
    expect(buildWorkbook({ ...spec, qualifier: 'x'.repeat(40) }).SheetNames[0]).toHaveLength(31)
  })

  it.each(['http://localhost:5173', 'https://stats.example.com'])('documents the exact dataset and API at %s', origin => {
    const text = aiText(spec, origin)
    expect(text).toContain('# RZS Stats — Standings — AFC')
    expect(text).toContain('private Madden NFL online franchise league')
    expect(text).toContain('NOT real NFL data')
    toRows(spec)[0].forEach((label, i) => expect(text).toContain(`- \`${label}\` — ${spec.cols[i].desc}`))
    expect(text.match(/```csv\n([\s\S]*?)\n```/)[1]).toBe(csvText(spec))
    expect(text).toContain(`    GET ${origin}/api/standings?season=5&q=a+b`)
    expect(text).not.toContain('stage=null')
    expect(text).not.toContain('week=undefined')
    expect(text).toContain('stage=2 playoffs')
    expect(text).toContain('/api/qb/* and /api/efficiency take a NAME: regular | playoffs | both')
    expect(text).toContain('HTTP 400')
    expect(text).toContain('/api/elo/history takes only `season` and returns every team\'s weekly row for every matching season (no param = ALL seasons)')
    expect(text).toContain('(no params = EVERY game ever recorded)')
    expect(text).toContain('/api/elo/upcoming defaults season to the latest season')
    expect(text).not.toContain('omit for the latest')
    expect(text).toContain('null/no data, which is NOT zero')
    expect(text).toContain('### Mapping this table back to the API response')
    expect(text).toContain(`from ${origin}${window.location.pathname}`)
  })

  it('defaults to the current origin and omits optional sections and empty query strings', () => {
    const text = aiText({ ...spec, notes: [], api: { path: '/seasons', params: { season: null } } })
    expect(text).toContain(`GET ${window.location.origin}/api/seasons\n`)
    expect(text).not.toContain('## Reading notes')
    expect(text).not.toContain('### Mapping')
  })

  it('calls the clipboard synchronously and reports a successful copy', async () => {
    const result = copyAi(spec)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(aiText(spec))
    expect(await result).toBe('copied')
  })

  it('copies through a temporary textarea when the clipboard rejects', async () => {
    navigator.clipboard.writeText.mockRejectedValue(new Error('denied'))
    document.execCommand.mockImplementation(() => {
      expect(document.querySelector('textarea').value).toBe(aiText(spec).replace(/\r\n?/g, '\n'))
      return true
    })
    expect(await copyAi(spec)).toBe('copied')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('downloads markdown if both copy methods fail', async () => {
    navigator.clipboard.writeText.mockRejectedValue(new Error('denied'))
    expect(await copyAi(spec)).toBe('downloaded')
    expect(anchorClick.mock.instances[0].download).toBe('standings-afc-season-108-ai.md')
    expect(URL.createObjectURL.mock.calls[0][0].type).toBe('text/markdown')
  })
})
