import { fileStem, downloadBlob } from './exportTable'
import { loadLogo } from './teamLogo'
import { goodBadColor } from './heat'

export const IMAGE = { bg: '#ffffff', surface: 'rgb(245 247 250)', ink: '#0f172a', muted: '#646e7d', line: '#dfe3e9', accent: '#1d4ed8', good: '#16a34a', bad: '#dc2626' }

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

export function wrapText(ctx, text, width) {
  const lines = ['']
  for (const word of String(text ?? '').split(/\s+/)) {
    const i = lines.length - 1
    const line = lines[i] ? `${lines[i]} ${word}` : word
    if (lines[i] && ctx.measureText(line).width > width) lines.push(word)
    else lines[i] = line
  }
  return lines
}

export function imageFrame(spec, width, contentHeight, canvas = document.createElement('canvas')) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.font = '12px sans-serif'
  const lines = wrapText(ctx, spec.qualifier, width - 20)
  const top = 54 + (lines.length - 1) * 16
  const height = top + contentHeight + 26
  const scale = chooseScale(width, height)
  if (!scale) return null
  canvas.width = Math.ceil(width * scale)
  canvas.height = Math.ceil(height * scale)
  ctx.scale(scale, scale)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = IMAGE.bg
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = IMAGE.ink
  ctx.font = 'bold 18px sans-serif'
  const title = `RZS Stats — ${spec.name}`
  if (ctx.measureText(title).width > width - 20) ctx.fillText(title, 10, 19, width - 20)
  else ctx.fillText(title, 10, 19)
  ctx.font = '12px sans-serif'
  ctx.fillStyle = IMAGE.muted
  lines.forEach((line, i) => ctx.fillText(line, 10, 40 + i * 16))
  return { canvas, ctx, top, finish() {
    ctx.textAlign = 'left'
    ctx.font = '12px sans-serif'
    ctx.fillStyle = IMAGE.muted
    ctx.fillText(`${window.location.host} · ${new Date().toISOString().slice(0, 10)}`, 10, height - 13)
    return canvas
  } }
}

export async function layoutTable(spec, ctx) {
  spec = { ...spec, cols: spec.cols.filter(col => !col.imageHidden).map(col => ({ ...col, ...col.image })) }
  const text = (col, row, i) => {
    const value = col.value?.(row, i)
    if (!col.keepText && col.value && (value == null || Number.isNaN(value))) return '—'
    const result = col.text(row, i)
    return result == null || result === '' || /^(NaN|null|undefined)$/.test(String(result)) ? '—' : String(result)
  }
  const logos = await Promise.all(spec.rows.map((row, i) => Promise.all(spec.cols.map(col => loadLogo(col.logo?.(row, i))))))
  const title = `RZS Stats — ${spec.name}`
  const footer = `${window.location.host} · ${new Date().toISOString().slice(0, 10)}`
  const widths = spec.cols.map((col, c) => {
    ctx.font = 'bold 12px sans-serif'
    let width = ctx.measureText(col.label).width
    ctx.font = '12px sans-serif'
    spec.rows.forEach((row, i) => { width = Math.max(width, ctx.measureText(text(col, row, i)).width + (logos[i][c] ? 26 : 0)) })
    return Math.max(Math.ceil(width) + 20, col.bar || col.meter || col.chance ? (col.barWidth ?? 140) + 20 : col.form ? 110 : col.pill ? width + 36 : 0)
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
  const grouped = spec.cols.some(col => col.group)
  const groupY = spec.tiles?.length ? 82 : 0
  const headerY = groupY + (grouped ? 26 : 0)
  const bodyY = headerY + 26
  const height = bodyY + spec.rows.length * 24
  return { width, height, draw(ctx, offsetX = 0, offsetY = 0) {
    ctx.save()
    ctx.translate(offsetX, offsetY)
    ctx.textBaseline = 'middle'
    ctx.font = '12px sans-serif'
    spec.tiles?.forEach((tile, i) => {
      const w = width / spec.tiles.length
      ctx.fillStyle = IMAGE.surface
      ctx.fillRect(i * w + 1, 0, w - 2, 72)
      ctx.textAlign = 'left'
      ctx.fillStyle = IMAGE.muted
      ctx.fillText(tile.label, i * w + 10, 15)
      ctx.font = 'bold 22px sans-serif'
      ctx.fillStyle = IMAGE.ink
      ctx.fillText(tile.value ?? '—', i * w + 10, 38)
      ctx.font = '12px sans-serif'
      ctx.fillStyle = IMAGE.muted
      ctx.fillText(tile.note ?? '', i * w + 10, 59)
    })
    if (grouped) {
      let x = 0
      for (let start = 0; start < spec.cols.length;) {
        let end = start + 1
        while (end < spec.cols.length && spec.cols[end].group === spec.cols[start].group) end++
        const spanWidth = widths.slice(start, end).reduce((sum, value) => sum + value, 0)
        ctx.fillStyle = IMAGE.line
        ctx.fillRect(x, groupY, spanWidth, 1)
        ctx.fillRect(x, groupY, 1, 26)
        ctx.fillRect(x + spanWidth - 1, groupY, 1, 26)
        ctx.fillStyle = IMAGE.muted
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
          ctx.fillStyle = IMAGE.line
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
        ctx.fillStyle = spec.rowMuted?.(row, rowIndex) ? IMAGE.muted : IMAGE.ink
        const textX = left + (ctx.textAlign === 'right' ? textWidth : ctx.textAlign === 'center' ? textWidth / 2 : 0)
        const visual = rowIndex != null && drawCellVisual(ctx, col, row, rowIndex, x + 10, y, widths[i] - 20, content)
        if (!visual && (rowIndex == null || bar?.text !== false)) ctx.fillText(content, textX, y + (rowIndex == null ? 13 : 12))
        x += widths[i]
      })
      ctx.fillStyle = IMAGE.line
      ctx.fillRect(0, y + (rowIndex == null ? 25 : 23), width, 1)
    }
    ctx.font = 'bold 12px sans-serif'
    drawCells(headerY)
    ctx.font = '12px sans-serif'
    spec.rows.forEach((row, i) => {
      const y = bodyY + i * 24
      ctx.fillStyle = i % 2 ? IMAGE.surface : IMAGE.bg
      ctx.fillRect(0, y, width, 24)
      drawCells(y, row, i)
    })
    ctx.restore()
  } }
}

export function drawCellVisual(ctx, col, row, i, x, y, width, content) {
  const meter = col.meter?.(row, i)
  const chance = col.chance?.(row, i)
  if (Number.isFinite(meter) || Number.isFinite(chance)) {
    const p = Math.min(1, Math.max(0, meter != null ? meter / 100 : chance))
    const trackWidth = meter != null ? width - 28 : width - 42
    const left = x + (meter != null ? 14 : 0)
    ctx.fillStyle = IMAGE.line
    ctx.fillRect(left, y + 9, trackWidth, 6)
    ctx.fillStyle = meter != null ? goodBadColor(meter, [0, 100]) ?? IMAGE.line : p >= 0.5 ? IMAGE.good : IMAGE.bad
    ctx.fillRect(left, y + 9, trackWidth * p, 6)
    ctx.fillStyle = IMAGE.muted
    for (const tick of meter != null ? [0.25, 0.5, 0.75] : [0.5]) ctx.fillRect(left + tick * trackWidth, y + 6, 1, 12)
    ctx.textAlign = 'center'
    if (meter != null) {
      ctx.beginPath()
      ctx.arc(left + trackWidth * p, y + 12, 11, 0, Math.PI * 2)
      ctx.fillStyle = IMAGE.bg
      ctx.fill()
      ctx.fillStyle = goodBadColor(meter, [0, 100]) ?? IMAGE.line
      ctx.fill()
      ctx.fillStyle = IMAGE.ink
      ctx.fillText(String(meter), left + trackWidth * p, y + 12)
    } else {
      ctx.fillStyle = IMAGE.ink
      ctx.fillText(content, x + width - 17, y + 12)
    }
    return true
  }
  if (col.pill?.(row, i)) {
    ctx.strokeStyle = IMAGE.line
    ctx.strokeRect(x - 3, y + 3, width + 6, 18)
    ctx.textAlign = 'center'
    ctx.fillStyle = IMAGE.muted
    ctx.fillText(content, x + width / 2, y + 12)
    return true
  }
  const form = col.form?.(row, i)
  if (form?.length) {
    Array.from(form).forEach((result, j) => {
      ctx.fillStyle = result === 'W' ? IMAGE.good : result === 'L' ? IMAGE.bad : IMAGE.muted
      ctx.fillRect(x + j * 18, y + 4, 15, 16)
      ctx.fillStyle = IMAGE.bg
      ctx.textAlign = 'center'
      ctx.fillText(result, x + j * 18 + 7.5, y + 12)
    })
    return true
  }
  return false
}

export async function drawTable(spec) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const table = await layoutTable(spec, ctx)
  const frame = imageFrame(spec, table.width, table.height, canvas)
  if (!frame) return null
  table.draw(frame.ctx, 0, frame.top)
  return frame.finish()
}

export async function drawPanel(spec) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const width = spec.image.width ?? 900
  const panel = await spec.image.draw(ctx, width)
  const frame = imageFrame(spec, width, panel.height, canvas)
  if (!frame) return null
  ctx.save()
  ctx.translate(0, frame.top)
  await panel.draw(ctx)
  ctx.restore()
  return frame.finish()
}

export function copyImage(spec) {
  const blob = (spec.image ? drawPanel(spec) : drawTable(spec)).then(canvas => canvas ? new Promise(resolve => canvas.toBlob(resolve, 'image/png')) : null)
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
