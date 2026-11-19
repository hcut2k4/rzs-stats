import { fileStem, downloadBlob } from './exportTable'
import { loadLogo } from './teamLogo'

const MAX_AREA = 16_000_000
const MAX_SIDE = 16384

export function chooseScale(cssWidth, cssHeight) {
  for (const scale of [2, 1]) {
    const width = Math.ceil(cssWidth * scale)
    const height = Math.ceil(cssHeight * scale)
    if (width > 0 && height > 0 && width <= MAX_SIDE && height <= MAX_SIDE && width * height <= MAX_AREA) return scale
  }
  return null
}

export async function drawTable(spec) {
  spec = { ...spec, cols: spec.cols.filter(col => !col.imageHidden).map(col => ({ ...col, ...col.image })) }
  const text = (col, row, i) => {
    const value = col.value?.(row, i)
    if (!col.keepText && col.value && (value == null || Number.isNaN(value))) return '—'
    const result = col.text(row, i)
    return result == null || result === '' || /^(NaN|null|undefined)$/.test(String(result)) ? '—' : String(result)
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const logos = await Promise.all(spec.rows.map((row, i) => Promise.all(spec.cols.map(col => loadLogo(col.logo?.(row, i))))))

  const title = `RZS Stats — ${spec.name}`
  const qualifier = spec.qualifier ?? ''
  const footer = `${window.location.host} · ${new Date().toISOString().slice(0, 10)}`
  const widths = spec.cols.map((col, c) => {
    ctx.font = 'bold 12px sans-serif'
    let width = ctx.measureText(col.label).width
    ctx.font = '12px sans-serif'
    spec.rows.forEach((row, i) => { width = Math.max(width, ctx.measureText(text(col, row, i)).width + (logos[i][c] ? 26 : 0)) })
    return Math.max(Math.ceil(width) + 20, col.bar ? (col.barWidth ?? 140) + 20 : 0)
  })
  ctx.font = 'bold 18px sans-serif'
  let width = Math.max(widths.reduce((sum, value) => sum + value, 0), ctx.measureText(title).width + 20)
  ctx.font = '12px sans-serif'
  width = Math.ceil(Math.max(width, ctx.measureText(footer).width + 20))
  let groupX = 0
  for (let start = 0; start < spec.cols.length;) {
    let end = start + 1
    while (end < spec.cols.length && spec.cols[end].group === spec.cols[start].group) end++
    const span = widths.slice(start, end).reduce((sum, w) => sum + w, 0)
    const needed = ctx.measureText(spec.cols[start].group ?? '').width + 20
    if (needed > span) widths[end - 1] += needed - span
    groupX += widths.slice(start, end).reduce((sum, w) => sum + w, 0)
    start = end
  }
  width = Math.max(width, groupX)
  const qualifierLines = ['']
  for (const word of qualifier.split(/\s+/)) {
    const last = qualifierLines.length - 1
    const line = qualifierLines[last] ? `${qualifierLines[last]} ${word}` : word
    if (qualifierLines[last] && ctx.measureText(line).width > width - 20) qualifierLines.push(word)
    else qualifierLines[last] = line
  }
  const groupY = 54 + (qualifierLines.length - 1) * 16
  const grouped = spec.cols.some(col => col.group)
  const headerY = groupY + (grouped ? 26 : 0)
  const bodyY = headerY + 26
  const height = bodyY + spec.rows.length * 24 + 26
  const scale = chooseScale(width, height)
  if (!scale) return null

  canvas.width = Math.ceil(width * scale)
  canvas.height = Math.ceil(height * scale)
  ctx.scale(scale, scale)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 18px sans-serif'
  ctx.fillText(title, 10, 19)
  ctx.font = '12px sans-serif'
  ctx.fillStyle = '#646e7d'
  qualifierLines.forEach((line, i) => ctx.fillText(line, 10, 40 + i * 16))

  if (grouped) {
    let x = 0
    for (let start = 0; start < spec.cols.length;) {
      let end = start + 1
      while (end < spec.cols.length && spec.cols[end].group === spec.cols[start].group) end++
      const spanWidth = widths.slice(start, end).reduce((sum, value) => sum + value, 0)
      ctx.fillStyle = '#dfe3e9'
      ctx.fillRect(x, groupY, spanWidth, 1)
      ctx.fillRect(x, groupY, 1, 26)
      ctx.fillRect(x + spanWidth - 1, groupY, 1, 26)
      ctx.fillStyle = '#646e7d'
      ctx.textAlign = 'center'
      ctx.fillText(spec.cols[start].group ?? '', x + spanWidth / 2, groupY + 13)
      x += spanWidth
      start = end
    }
  }

  const drawCells = (y, row, rowIndex) => {
    let x = 0
    spec.cols.forEach((col, i) => {
      const color = rowIndex == null ? undefined : col.color?.(row, rowIndex)
      if (color) {
        ctx.fillStyle = color
        ctx.fillRect(x, y, widths[i], 24)
      }
      const bar = rowIndex == null ? null : col.bar?.(row, rowIndex)
      if (bar) {
        const center = x + widths[i] / 2
        const extent = bar.max > 0 ? Math.min(Math.abs(bar.value) / bar.max, 1) * (widths[i] - 20) / 2 : 0
        ctx.fillStyle = '#dfe3e9'
        ctx.fillRect(center, y + 4, 1, 16)
        ctx.fillStyle = bar.color
        ctx.fillRect(bar.value >= 0 ? center : center - extent, y + 6, extent, 12)
      }
      let logo = rowIndex == null ? null : logos[rowIndex][i]
      const content = rowIndex == null ? col.label : text(col, row, rowIndex)
      ctx.textAlign = col.align ?? (col.value ? 'right' : 'left')
      const textWidth = ctx.measureText(content).width
      const totalWidth = textWidth + (logo ? 26 : 0)
      let left = x + (ctx.textAlign === 'right' ? widths[i] - 10 - totalWidth : ctx.textAlign === 'center' ? (widths[i] - totalWidth) / 2 : 10)
      if (logo) {
        try { ctx.drawImage(logo, left, y + 2, 20, 20) } catch {
          logo = null
          left += ctx.textAlign === 'right' ? 26 : ctx.textAlign === 'center' ? 13 : 0
        }
        if (logo) left += 26
      }
      ctx.fillStyle = '#0f172a'
      const textX = left + (ctx.textAlign === 'right' ? textWidth : ctx.textAlign === 'center' ? textWidth / 2 : 0)
      if (rowIndex == null || bar?.text !== false) ctx.fillText(content, textX, y + (rowIndex == null ? 13 : 12))
      x += widths[i]
    })
    ctx.fillStyle = '#dfe3e9'
    ctx.fillRect(0, y + (rowIndex == null ? 25 : 23), width, 1)
  }
  ctx.font = 'bold 12px sans-serif'
  drawCells(headerY)
  ctx.font = '12px sans-serif'
  spec.rows.forEach((row, i) => {
    const y = bodyY + i * 24
    ctx.fillStyle = i % 2 ? 'rgb(245 247 250)' : '#ffffff'
    ctx.fillRect(0, y, width, 24)
    drawCells(y, row, i)
  })
  ctx.textAlign = 'left'
  ctx.fillStyle = '#646e7d'
  ctx.fillText(footer, 10, height - 13)
  return canvas
}

export function copyImage(spec) {
  const blob = drawTable(spec).then(canvas => canvas ? new Promise(resolve => canvas.toBlob(resolve, 'image/png')) : null)
  return copyPng(spec, blob)
}

export async function copyPng(spec, blob) {
  const blobPromise = Promise.resolve(blob).catch(() => null)
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      try {
        // Safari drops the click's clipboard permission across an await, so write() is the first async step.
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blobPromise })])
        return await blobPromise ? 'copied' : 'toobig'
      } catch {
        // fall through to the download
      }
    }
    const result = await blobPromise
    if (!result) return 'toobig'
    downloadBlob(result, `${fileStem(spec)}.png`)
    return 'downloaded'
  } catch {
    return 'toobig'
  }
}
