import { chooseScale, copyPng } from './tableImage'
import { loadLogo } from './teamLogo'

async function drawChart({ name, qualifier = '', points, league, xScale, yScale }) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const title = `RZS Stats — ${name}`
  const footer = `${window.location.host} · ${new Date().toISOString().slice(0, 10)}`
  ctx.font = 'bold 18px sans-serif'
  let width = Math.max(900, ctx.measureText(title).width + 20)
  ctx.font = '12px sans-serif'
  width = Math.ceil(Math.max(width, ctx.measureText(qualifier).width + 20, ctx.measureText(footer).width + 20))
  const height = 720
  const scale = chooseScale(width, height)
  if (!scale) return null
  canvas.width = width * scale
  canvas.height = height * scale
  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 18px sans-serif'
  ctx.fillText(title, 10, 19)
  ctx.fillStyle = '#646e7d'
  ctx.font = '12px sans-serif'
  ctx.fillText(qualifier, 10, 40)
  ctx.fillText(footer, 10, height - 13)

  const left = 80, right = width - 30, top = 70, bottom = height - 80
  const x = value => left + (value - xScale.domain[0]) / (xScale.domain[1] - xScale.domain[0]) * (right - left)
  const y = value => top + (value - yScale.domain[0]) / (yScale.domain[1] - yScale.domain[0]) * (bottom - top)
  const line = (x1, y1, x2, y2) => {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  ctx.strokeStyle = '#dfe3e9'
  ctx.setLineDash([2, 4])
  ctx.textAlign = 'center'
  xScale.ticks.forEach(tick => {
    line(x(tick), top, x(tick), bottom)
    ctx.fillText(tick.toFixed(1), x(tick), bottom + 16)
  })
  ctx.textAlign = 'right'
  yScale.ticks.forEach(tick => {
    line(left, y(tick), right, y(tick))
    ctx.fillText(tick.toFixed(1), left - 10, y(tick))
  })
  ctx.setLineDash([])
  line(left, top, left, bottom)
  line(left, bottom, right, bottom)
  ctx.textAlign = 'center'
  ctx.fillText('Offense points per drive → better', (left + right) / 2, bottom + 44)
  ctx.save()
  ctx.translate(20, (top + bottom) / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('Defense points allowed per drive → better', 0, 0)
  ctx.restore()
  ctx.strokeStyle = '#646e7d'
  ctx.setLineDash([4, 4])
  if (Number.isFinite(league)) {
    line(x(league), top, x(league), bottom)
    line(left, y(league), right, y(league))
  }
  ctx.setLineDash([])
  ctx.font = 'bold 12px sans-serif'
  for (const goodOffense of [false, true]) {
    for (const goodDefense of [true, false]) {
      ctx.textAlign = goodOffense ? 'right' : 'left'
      const labelX = goodOffense ? right - 8 : left + 8
      const labelY = goodDefense ? top + 18 : bottom - 30
      ctx.fillText(`${goodOffense ? 'Good' : 'Bad'} offense`, labelX, labelY)
      ctx.fillText(`${goodDefense ? 'Good' : 'Bad'} defense`, labelX, labelY + 15)
    }
  }
  const logos = await Promise.all(points.map(point => loadLogo(point.abbr)))
  ctx.textAlign = 'center'
  ctx.fillStyle = '#0f172a'
  points.forEach((point, i) => {
    if (logos[i]) {
      try {
        ctx.drawImage(logos[i], x(point.x) - 22, y(point.y) - 22, 44, 44)
        return
      } catch {
        // A decoded image can still be unavailable to draw.
      }
    }
    ctx.fillText(point.abbr, x(point.x), y(point.y))
  })
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}

export function copyChartImage(spec) {
  return copyPng(spec, drawChart(spec))
}
