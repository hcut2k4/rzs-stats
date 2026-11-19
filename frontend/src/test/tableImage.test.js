import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseScale } from '../utils/tableImage'
let copyImage, copyChartImage

let ctx, calls, canvases, downloads, write, png
const spec = () => ({
  name: 'Standings', qualifier: 'Season 108',
  rows: [{ team: 'Eagles', wins: '11', rating: '72.6%' }],
  cols: [
    { label: 'Team', text: row => row.team },
    { label: 'Wins', text: row => row.wins },
    { label: 'Rating', text: row => row.rating, value: row => row.rating },
  ],
})

beforeEach(async () => {
  vi.resetModules()
  ;({ copyImage } = await import('../utils/tableImage'))
  ;({ copyChartImage } = await import('../utils/chartImage'))
  vi.useFakeTimers()
  calls = []
  canvases = []
  downloads = []
  png = new Blob(['png'], { type: 'image/png' })
  ctx = {
    textAlign: 'left',
    measureText: vi.fn(text => ({ width: text.length * 7 })),
    scale: vi.fn(),
    set fillStyle(value) {
      this.style = value
      calls.push({ type: 'fillStyle', value })
    },
    fillRect(...args) { calls.push({ type: 'fillRect', args, style: this.style }) },
    fillText(...args) { calls.push({ type: 'fillText', args, style: this.style, align: this.textAlign }) },
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
    canvases.push(this)
    return ctx
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(png))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { downloads.push(this) })
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:table-image')
    static revokeObjectURL = vi.fn()
  })
  write = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { write } })
  vi.stubGlobal('ClipboardItem', class {
    constructor(data) { this.data = data }
  })
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('chooseScale', () => {
  it('uses double resolution up to the area boundary', () => {
    expect(chooseScale(400, 300)).toBe(2)
    expect(chooseScale(2000, 2000)).toBe(2)
  })
  it('uses single resolution beyond the double-resolution area boundary', () => {
    expect(chooseScale(2000, 2001)).toBe(1)
    expect(chooseScale(4000, 4000)).toBe(1)
  })
  it('rejects area beyond the budget at both resolutions', () => {
    expect(chooseScale(4000, 4001)).toBeNull()
  })
  it('checks the side limit for both dimensions at both resolutions', () => {
    expect(chooseScale(8192, 10)).toBe(2)
    expect(chooseScale(8193, 10)).toBe(1)
    expect(chooseScale(10, 8193)).toBe(1)
    expect(chooseScale(16384, 10)).toBe(1)
    expect(chooseScale(16385, 10)).toBeNull()
    expect(chooseScale(10, 16385)).toBeNull()
  })
  it('budgets rounded device dimensions', () => {
    expect(chooseScale(2000.1, 2000)).toBe(1)
  })
})

describe('copyImage', () => {
  it('writes the PNG promise synchronously before encoding finishes', async () => {
    let finish
    HTMLCanvasElement.prototype.toBlob.mockImplementation(callback => { finish = callback })
    const result = copyImage(spec())
    expect(write).toHaveBeenCalledTimes(1)
    const [item] = write.mock.calls[0][0]
    expect(item).toBeInstanceOf(window.ClipboardItem)
    expect(Object.keys(item.data)).toEqual(['image/png'])
    expect(item.data['image/png']).toBeInstanceOf(Promise)
    await vi.waitFor(() => expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png'))
    finish(png)
    await expect(item.data['image/png']).resolves.toBe(png)
    await expect(result).resolves.toBe('copied')
    expect(downloads).toHaveLength(0)
  })
  it.each(['item', 'write'])('downloads a PNG when clipboard %s support is missing', async missing => {
    if (missing === 'item') vi.stubGlobal('ClipboardItem', undefined)
    else navigator.clipboard.write = undefined
    await expect(copyImage(spec())).resolves.toBe('downloaded')
    expect(write).not.toHaveBeenCalled()
    expect(downloads).toHaveLength(1)
    expect(downloads[0].download).toBe('standings-season-108.png')
    expect(URL.createObjectURL).toHaveBeenCalledWith(png)
  })
  it('downloads the same encoded PNG when clipboard writing rejects', async () => {
    write.mockRejectedValue(new Error('permission denied'))
    await expect(copyImage(spec())).resolves.toBe('downloaded')
    expect(write).toHaveBeenCalledTimes(1)
    expect(downloads[0].download).toMatch(/\.png$/)
    expect(URL.createObjectURL).toHaveBeenCalledWith(png)
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(1)
  })
  it('rejects oversized tables before assigning canvas dimensions', async () => {
    const widthSetter = vi.spyOn(HTMLCanvasElement.prototype, 'width', 'set')
    const heightSetter = vi.spyOn(HTMLCanvasElement.prototype, 'height', 'set')
    const large = { ...spec(), rows: Array.from({ length: 2000 }, () => ({})), cols: Array.from({ length: 30 }, () => ({ label: 'Metric', text: () => '12345' })) }
    await expect(copyImage(large)).resolves.toBe('toobig')
    expect(write).toHaveBeenCalledTimes(1)
    expect(widthSetter).not.toHaveBeenCalled()
    expect(heightSetter).not.toHaveBeenCalled()
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled()
  })
  it('renders every row at single resolution when double resolution exceeds the budget', async () => {
    const table = spec()
    table.rows = Array.from({ length: 400 }, () => table.rows[0])
    await expect(copyImage(table)).resolves.toBe('copied')
    expect(ctx.scale).toHaveBeenCalledWith(1, 1)
    expect(canvases[0].width * canvases[0].height).toBeLessThanOrEqual(16_000_000)
    expect(calls.filter(call => call.type === 'fillText' && call.args[0] === 'Eagles')).toHaveLength(400)
  })
  it('reports failed encoding when toBlob yields null', async () => {
    HTMLCanvasElement.prototype.toBlob.mockImplementation(callback => callback(null))
    await expect(copyImage(spec())).resolves.toBe('toobig')
    expect(downloads).toHaveLength(0)
  })
  it.each(['context', 'allocation', 'drawing', 'encoding'])('reports a %s failure as too big', async failure => {
    if (failure === 'context') HTMLCanvasElement.prototype.getContext.mockReturnValue(null)
    if (failure === 'allocation') vi.spyOn(HTMLCanvasElement.prototype, 'width', 'set').mockImplementation(() => { throw new Error('allocation') })
    if (failure === 'drawing') ctx.fillRect = () => { throw new Error('drawing') }
    if (failure === 'encoding') HTMLCanvasElement.prototype.toBlob.mockImplementation(() => { throw new Error('encoding') })
    await expect(copyImage(spec())).resolves.toBe('toobig')
    expect(downloads).toHaveLength(0)
  })
  it('composites unmodified heat tints over the row background before drawing text', async () => {
    const table = spec()
    table.rows.push(table.rows[0])
    const color = 'rgb(22 163 74 / 0.31)'
    table.cols[2].color = () => color
    await copyImage(table)
    for (const y of [80, 104]) {
      const index = calls.findIndex(call => call.type === 'fillRect' && call.style === color && call.args[1] === y)
      expect(index).toBeGreaterThan(0)
      expect(calls[index - 1]).toEqual({ type: 'fillStyle', value: color })
      expect(calls[index].args).toEqual([110, y, 62, 24])
      expect(calls.slice(0, index)).toContainEqual({ type: 'fillRect', args: [0, y, canvases[0].width / 2, 24], style: y === 80 ? '#ffffff' : 'rgb(245 247 250)' })
      expect(calls.slice(index + 1)).toContainEqual(expect.objectContaining({ type: 'fillText', args: ['72.6%', 162, y + 12], style: '#0f172a' }))
    }
  })
  it('adds a centered band merging only adjacent columns with the same group', async () => {
    const table = spec()
    table.cols[1].group = 'Stats'
    table.cols[2].group = 'Stats'
    table.cols.push({ label: 'Other', group: 'Other', text: () => '0' })
    table.cols.push({ label: 'Again', group: 'Stats', text: () => '0' })
    await copyImage(table)
    const bands = calls.filter(call => call.type === 'fillText' && call.args[2] === 67)
    expect(bands.map(call => call.args[0])).toEqual(['', 'Stats', 'Other', 'Stats'])
    expect(bands.every(call => call.align === 'center')).toBe(true)
    expect(bands[1].args[1]).toBe(62 + (48 + 62) / 2)
    expect(calls).toContainEqual(expect.objectContaining({ type: 'fillText', args: ['Team', 10, 93] }))
  })
  it('omits the band without groups and honors default and explicit alignment', async () => {
    const table = spec()
    table.cols.push({ label: 'Explicit', align: 'left', text: () => 'text' })
    table.cols[0].align = 'right'
    await copyImage(table)
    expect(calls.filter(call => call.type === 'fillText' && call.align === 'center')).toHaveLength(0)
    const cells = calls.filter(call => call.type === 'fillText' && call.args[2] === 92)
    expect(cells.map(call => call.align)).toEqual(['right', 'left', 'right', 'left'])
    expect(canvases[0].height).toBe((54 + 26 + 24 + 26) * 2)
  })
  it.each(['loaded', 'failed', 'drawing failed'])('draws a logo or falls back without a gap when %s', async state => {
    const images = []
    vi.stubGlobal('Image', class { constructor() { images.push(this) } })
    ctx.drawImage = vi.fn(() => { if (state === 'drawing failed') throw new Error('decode') })
    const table = spec()
    table.cols[0].logo = () => 'PHI'
    const result = copyImage(table)
    expect(write).toHaveBeenCalledTimes(1)
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled()
    expect(images[0].crossOrigin).toBe('anonymous')
    if (state === 'failed') images[0].onerror()
    else images[0].onload()
    await expect(result).resolves.toBe('copied')
    expect(ctx.drawImage).toHaveBeenCalledTimes(state === 'failed' ? 0 : 1)
    expect(calls).toContainEqual(expect.objectContaining({ type: 'fillText', args: ['Eagles', state === 'loaded' ? 36 : 10, 92] }))
    await copyImage(table)
    expect(images).toHaveLength(1)
  })
  it('draws centered bars growing toward each favored side with formatted numbers', async () => {
    const table = spec()
    table.rows = [{ edge: 0.04983821822268974 }, { edge: -0.5 }]
    table.cols = [{ label: 'Edge', text: r => r.edge.toFixed(2), value: r => r.edge, align: 'center', bar: r => ({ value: r.edge, max: 1, color: 'orange' }) }]
    await copyImage(table)
    const bars = calls.filter(c => c.type === 'fillRect' && c.style === 'orange')
    expect(bars[0].args).toEqual([80, 86, table.rows[0].edge * 70, 12])
    expect(bars[1].args).toEqual([45, 110, 35, 12])
    expect(calls).toContainEqual(expect.objectContaining({ type: 'fillText', args: ['0.05', 80, 92], align: 'center' }))
  })
  it('keeps missing values tidy and applies PNG-only columns without changing the spec', async () => {
    const table = spec()
    table.cols = [
      { label: 'Raw', image: { label: 'Display' }, text: () => NaN },
      { label: 'Hidden', text: () => 'secret', imageHidden: true },
      { label: 'Missing', value: () => null, text: () => 'null' },
    ]
    await copyImage(table)
    const texts = calls.filter(c => c.type === 'fillText').map(c => c.args[0])
    expect(texts).toContain('Display')
    expect(texts.filter(t => t === '—')).toHaveLength(2)
    expect(texts).not.toContain('secret')
    expect(table.cols[0].label).toBe('Raw')
  })
  it('aligns headers and rows by column type regardless of position', async () => {
    const table = spec()
    table.cols = [
      { label: 'Number', value: () => 1, text: () => '1' },
      { label: 'Away', text: () => 'PHI' },
      { label: 'Home', text: () => 'DAL' },
      { label: 'Center', align: 'center', text: () => 'x' },
    ]
    await copyImage(table)
    for (const y of [67, 92]) {
      expect(calls.filter(c => c.type === 'fillText' && c.args[2] === y).map(c => c.align)).toEqual(['right', 'left', 'left', 'center'])
    }
  })
  it('wraps a long qualifier above the group band without widening the table', async () => {
    const table = spec()
    table.qualifier = 'sorted by win probability ascending · '.repeat(20).trim()
    table.cols[1].group = 'A longer group heading than its cells'
    await copyImage(table)
    expect(canvases[0].width / 2).toBeLessThan(1000)
    const band = calls.find(c => c.type === 'fillText' && c.args[0] === table.cols[1].group)
    const qualifier = calls.filter(c => c.type === 'fillText' && c.args[1] === 10 && c.args[2] >= 40 && c.args[2] < band.args[2])
    expect(qualifier.length).toBeGreaterThan(1)
    expect(qualifier.every(c => c.args[2] < band.args[2] - 13)).toBe(true)
  })
  it('measures every value and draws the title, qualifier, host and date on a light ground', async () => {
    const table = spec()
    table.rows.push({ team: 'A much longer team', wins: '0', rating: '—' })
    await copyImage(table)
    for (const col of table.cols) {
      expect(ctx.measureText).toHaveBeenCalledWith(col.label)
      for (const [i, row] of table.rows.entries()) expect(ctx.measureText).toHaveBeenCalledWith(col.text(row, i))
    }
    expect(calls[1]).toEqual({ type: 'fillRect', args: [0, 0, canvases[0].width / 2, canvases[0].height / 2], style: '#ffffff' })
    const texts = calls.filter(call => call.type === 'fillText').map(call => call.args[0])
    expect(texts).toContain('RZS Stats — Standings')
    expect(texts).toContain('Season 108')
    expect(texts).toContain(`${window.location.host} · ${new Date().toISOString().slice(0, 10)}`)
    expect(texts).toContain('—')
  })
})

const chartSpec = () => ({
  name: 'Efficiency Overview chart', qualifier: 'Season 108',
  points: [{ x: 3, y: 1, abbr: 'PHI' }, { x: 1, y: 3, abbr: 'DAL' }],
  league: 2,
  xScale: { domain: [0.5, 3.5], ticks: [0.5, 1, 1.5, 2, 2.5, 3, 3.5] },
  yScale: { domain: [0.5, 3.5], ticks: [0.5, 1, 1.5, 2, 2.5, 3, 3.5] },
})

describe('chart PNG export', () => {
  let images
  beforeEach(() => {
    images = []
    vi.stubGlobal('Image', class {
      constructor() { images.push(this) }
    })
    for (const method of ['beginPath', 'moveTo', 'lineTo', 'stroke', 'setLineDash', 'save', 'translate', 'rotate', 'restore', 'drawImage']) ctx[method] = vi.fn()
  })
  const load = () => images.forEach(image => image.onload())

  it('writes a PNG promise before any logo loads and draws the complete light chart', async () => {
    const result = copyChartImage(chartSpec())
    expect(write).toHaveBeenCalledTimes(1)
    const promise = write.mock.calls[0][0][0].data['image/png']
    expect(promise).toBeInstanceOf(Promise)
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled()
    expect(images.map(image => image.crossOrigin)).toEqual(['anonymous', 'anonymous'])
    expect(images[0].src).toBe('https://a.espncdn.com/i/teamlogos/nfl/500/phi.png')
    load()
    await expect(result).resolves.toBe('copied')
    await expect(promise).resolves.toBe(png)
    expect(ctx.drawImage).toHaveBeenCalledTimes(2)
    const first = ctx.drawImage.mock.calls[0]
    const second = ctx.drawImage.mock.calls[1]
    expect(first[1]).toBeGreaterThan(second[1])
    expect(first[2]).toBeLessThan(second[2])
    const texts = calls.filter(call => call.type === 'fillText').map(call => call.args[0])
    expect(texts).toEqual(expect.arrayContaining([
      'RZS Stats — Efficiency Overview chart', 'Season 108',
      `${window.location.host} · ${new Date().toISOString().slice(0, 10)}`,
      'Offense points per drive → better', 'Defense points allowed per drive → better',
      'Good offense', 'Bad offense', 'Good defense', 'Bad defense',
      '0.5', '1.0', '1.5', '2.0', '2.5', '3.0', '3.5',
    ]))
    expect(calls).toContainEqual({ type: 'fillRect', args: [0, 0, 900, 720], style: '#ffffff' })
    expect(ctx.setLineDash).toHaveBeenCalledWith([2, 4])
    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4])
    expect(ctx.stroke).toHaveBeenCalledTimes(18)
    expect(downloads).toHaveLength(0)
  })

  it.each(['unsupported', 'denied'])('downloads a distinctly named chart when clipboard is %s', async failure => {
    if (failure === 'unsupported') vi.stubGlobal('ClipboardItem', undefined)
    else write.mockRejectedValue(new Error('denied'))
    const result = copyChartImage(chartSpec())
    load()
    await expect(result).resolves.toBe('downloaded')
    expect(downloads[0].download).toBe('efficiency-overview-chart-season-108.png')
    expect(URL.createObjectURL).toHaveBeenCalledWith(png)
  })

  it('draws an abbreviation at the point when a logo fails', async () => {
    const result = copyChartImage(chartSpec())
    images[0].onerror()
    images[1].onload()
    await expect(result).resolves.toBe('copied')
    expect(ctx.drawImage).toHaveBeenCalledTimes(1)
    expect(calls).toContainEqual(expect.objectContaining({ type: 'fillText', args: ['PHI', 80 + 2.5 / 3 * 790, 70 + 0.5 / 3 * 570] }))
  })

  it('uses abbreviations after three seconds for logos that never load', async () => {
    const result = copyChartImage(chartSpec())
    await vi.advanceTimersByTimeAsync(3000)
    await expect(result).resolves.toBe('copied')
    expect(ctx.drawImage).not.toHaveBeenCalled()
    expect(calls.filter(call => call.type === 'fillText').map(call => call.args[0])).toEqual(expect.arrayContaining(['PHI', 'DAL']))
  })

  it('rejects an oversized chart before allocating dimensions or loading logos', async () => {
    const widthSetter = vi.spyOn(HTMLCanvasElement.prototype, 'width', 'set')
    const heightSetter = vi.spyOn(HTMLCanvasElement.prototype, 'height', 'set')
    await expect(copyChartImage({ ...chartSpec(), qualifier: 'x'.repeat(20000) })).resolves.toBe('toobig')
    expect(widthSetter).not.toHaveBeenCalled()
    expect(heightSetter).not.toHaveBeenCalled()
    expect(images).toHaveLength(0)
    expect(downloads).toHaveLength(0)
  })

  it.each(['null', 'tainted'])('reports %s encoding as too big without throwing', async failure => {
    HTMLCanvasElement.prototype.toBlob.mockImplementation(callback => {
      if (failure === 'tainted') throw new DOMException('Tainted canvas', 'SecurityError')
      callback(null)
    })
    const result = copyChartImage(chartSpec())
    load()
    await expect(result).resolves.toBe('toobig')
    expect(downloads).toHaveLength(0)
  })
})
