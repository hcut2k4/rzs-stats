import { formatOdds } from './playoffOdds'
import { IMAGE, imageFrame, copyPng } from './tableImage'
import { loadLogo } from './teamLogo'

export async function drawChart(spec) {
  const { name, qualifier = '' } = spec
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
  const frame = imageFrame(spec, width, height - 80, canvas)
  if (!frame) return null
  await drawChartPlot(ctx, width, height, spec)
  frame.finish()
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}

export async function drawChartPlot(ctx, width, height, { points, league, xScale, yScale, focus, focusColor = IMAGE.accent }, plotTop = 70) {
  ctx.font = '12px sans-serif'
  ctx.fillStyle = IMAGE.muted
  const left = 80, right = width - 30, top = plotTop, bottom = height - 80
  const x = value => left + (value - xScale.domain[0]) / (xScale.domain[1] - xScale.domain[0]) * (right - left)
  const y = value => top + (value - yScale.domain[0]) / (yScale.domain[1] - yScale.domain[0]) * (bottom - top)
  const line = (x1, y1, x2, y2) => {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  ctx.strokeStyle = IMAGE.line
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
  ctx.strokeStyle = IMAGE.muted
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
      ctx.fillText(`${goodOffense ? 'Good' : 'Bad'} ${focus != null ? 'O' : 'offense'}`, labelX, labelY)
      ctx.fillText(`${goodDefense ? 'Good' : 'Bad'} ${focus != null ? 'D' : 'defense'}`, labelX, labelY + 15)
    }
  }
  const logos = await Promise.all(points.map(point => loadLogo(point.abbr)))
  ctx.textAlign = 'center'
  ctx.fillStyle = IMAGE.ink
  const order = points.map((point, i) => ({ point, i }))
  if (focus != null) order.sort((a, b) => Number(a.point.id === focus) - Number(b.point.id === focus))
  order.forEach(({ point, i }) => {
    ctx.save()
    if (focus != null) {
      ctx.globalAlpha = point.id === focus ? 1 : 0.45
      ctx.filter = point.id === focus ? 'none' : 'grayscale(1)'
      if (point.id === focus) {
        ctx.beginPath()
        ctx.arc(x(point.x), y(point.y), 27, 0, Math.PI * 2)
        ctx.fillStyle = IMAGE.bg
        ctx.fill()
        ctx.strokeStyle = focusColor
        ctx.lineWidth = 3
        ctx.stroke()
      }
    }
    if (logos[i]) {
      try {
        const size = focus != null && point.id !== focus ? 26 : 44
        ctx.drawImage(logos[i], x(point.x) - size / 2, y(point.y) - size / 2, size, size)
        ctx.restore()
        return
      } catch {
        // A decoded image can still be unavailable to draw.
      }
    }
    ctx.fillStyle = IMAGE.ink
    ctx.fillText(point.abbr, x(point.x), y(point.y))
    ctx.restore()
  })
}

export function copyChartImage(spec) {
  return copyPng(spec, drawChart(spec))
}

export async function leveragePanel(ctx, width, rows, goal) {
  const logos = await Promise.all(rows.map(r => loadLogo(r.team.abbrName)))
  const x = p => 170 + p * (width - 260)
  return {
    height: rows.length * 42 + 35,
    draw(ctx) {
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = IMAGE.muted
      for (const p of [0, 0.25, 0.5, 0.75, 1]) ctx.fillText(`${p * 100}%`, x(p), 16)
      rows.forEach((r, i) => {
        const y = 42 + i * 42
        ctx.textAlign = 'left'
        ctx.fillStyle = IMAGE.ink
        ctx.fillText(r.team.displayName, 10, y + 4)
        ctx.strokeStyle = IMAGE.line
        ctx.beginPath(); ctx.moveTo(x(0), y); ctx.lineTo(x(1), y); ctx.stroke()
        ctx.lineWidth = 4
        ctx.strokeStyle = IMAGE.muted
        ctx.beginPath(); ctx.moveTo(x(r.ifLoss[goal]), y); ctx.lineTo(x(r.ifWin[goal]), y); ctx.stroke()
        ctx.lineWidth = 1
        for (const [p, color, align, offset] of [[r.ifLoss[goal], '#ea580c', 'right', -9], [r.ifWin[goal], '#2563eb', 'left', 9]]) {
          ctx.fillStyle = color
          ctx.beginPath(); ctx.arc(x(p), y, 4, 0, Math.PI * 2); ctx.fill()
          ctx.textAlign = align
          ctx.fillText(formatOdds(p), x(p) + offset, y - 10)
        }
        if (logos[i]) ctx.drawImage(logos[i], x(r.current[goal]) - 12, y - 12, 24, 24)
        else { ctx.textAlign = 'center'; ctx.fillStyle = IMAGE.ink; ctx.fillText(r.team.abbrName, x(r.current[goal]), y + 4) }
      })
    },
  }
}

export function oddsHistoryPanel(ctx, width, rows, teams, weekText) {
  const plotHeight = 300
  const legendRows = Math.ceil(teams.length / 4)
  return {
    height: plotHeight + 60 + legendRows * 22,
    draw(ctx) {
      const left = 55, right = width - 20, top = 15, bottom = plotHeight
      const x = i => rows.length <= 1 ? (left + right) / 2 : left + i / (rows.length - 1) * (right - left)
      const y = p => bottom - p * (bottom - top)
      ctx.font = '12px sans-serif'
      ctx.lineWidth = 1
      for (const p of [0, .25, .5, .75, 1]) {
        ctx.strokeStyle = IMAGE.line
        ctx.beginPath(); ctx.moveTo(left, y(p)); ctx.lineTo(right, y(p)); ctx.stroke()
        ctx.fillStyle = IMAGE.muted
        ctx.textAlign = 'right'
        ctx.fillText(`${p * 100}%`, left - 8, y(p) + 4)
      }
      ctx.textAlign = 'center'
      rows.forEach((r, i) => ctx.fillText(weekText(r.week), x(i), bottom + 22))
      teams.forEach((t, index) => {
        ctx.strokeStyle = t.color
        ctx.setLineDash(t.dash ? t.dash.split(' ').map(Number) : [])
        ctx.lineWidth = 2
        ctx.beginPath()
        let connected = false
        rows.forEach((r, i) => {
          const p = r[t.teamId]
          if (p == null) { connected = false; return }
          if (connected) ctx.lineTo(x(i), y(p))
          else ctx.moveTo(x(i), y(p))
          connected = true
        })
        ctx.stroke()
        ctx.setLineDash([])
        rows.forEach((r, i) => {
          if (r[t.teamId] == null) return
          ctx.fillStyle = t.color
          ctx.beginPath(); ctx.arc(x(i), y(r[t.teamId]), 3, 0, Math.PI * 2); ctx.fill()
        })
        ctx.fillStyle = t.color
        ctx.textAlign = 'left'
        ctx.fillText(t.abbrName, left + index % 4 * (right - left) / 4, bottom + 50 + Math.floor(index / 4) * 22)
      })
    },
  }
}
