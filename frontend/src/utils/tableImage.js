import { fileStem, downloadBlob } from './exportTable'

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

function drawTable(spec) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const title = `RZS Stats — ${spec.name}`
  const qualifier = spec.qualifier ?? ''
  const footer = `${window.location.host} · ${new Date().toISOString().slice(0, 10)}`
  const widths = spec.cols.map(col => {
    ctx.font = 'bold 12px sans-serif'
    let width = ctx.measureText(col.label).width
    ctx.font = '12px sans-serif'
    spec.rows.forEach((row, i) => { width = Math.max(width, ctx.measureText(col.text(row, i)).width) })
    return Math.ceil(width) + 20
  })
  ctx.font = 'bold 18px sans-serif'
  let width = Math.max(widths.reduce((sum, value) => sum + value, 0), ctx.measureText(title).width + 20)
  ctx.font = '12px sans-serif'
  width = Math.ceil(Math.max(width, ctx.measureText(qualifier).width + 20, ctx.measureText(footer).width + 20))
  const grouped = spec.cols.some(col => col.group)
  const headerY = 54 + (grouped ? 26 : 0)
  const bodyY = headerY + 26
  const height = bodyY + spec.rows.length * 24 + 26
  const scale = chooseScale(width, height)
  if (!scale) return null

  canvas.width = Math.ceil(width * scale)
  canvas.height = Math.ceil(height * scale)
  ctx.scale(scale, scale)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 18px sans-serif'
  ctx.fillText(title, 10, 19)
  ctx.font = '12px sans-serif'
  ctx.fillStyle = '#646e7d'
  ctx.fillText(qualifier, 10, 40)

  if (grouped) {
    let x = 0
    for (let start = 0; start < spec.cols.length;) {
      let end = start + 1
      while (end < spec.cols.length && spec.cols[end].group === spec.cols[start].group) end++
      const spanWidth = widths.slice(start, end).reduce((sum, value) => sum + value, 0)
      ctx.fillStyle = '#dfe3e9'
      ctx.fillRect(x, 54, spanWidth, 1)
      ctx.fillRect(x, 54, 1, 26)
      ctx.fillRect(x + spanWidth - 1, 54, 1, 26)
      ctx.fillStyle = '#646e7d'
      ctx.textAlign = 'center'
      ctx.fillText(spec.cols[start].group ?? '', x + spanWidth / 2, 67)
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
      ctx.fillStyle = '#0f172a'
      ctx.textAlign = col.align ?? (i < 2 ? 'left' : 'right')
      ctx.fillText(rowIndex == null ? col.label : col.text(row, rowIndex), x + (ctx.textAlign === 'right' ? widths[i] - 10 : 10), y + (rowIndex == null ? 13 : 12))
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

export async function copyImage(spec) {
  try {
    const canvas = drawTable(spec)
    if (!canvas) return 'toobig'
    return copyPng(spec, new Promise(resolve => canvas.toBlob(resolve, 'image/png')))
  } catch {
    return 'toobig'
  }
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
