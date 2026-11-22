import { probShade, chanceShade, formatOdds, SEED_COLORS } from '../../utils/playoffOdds'
import { snapshotLabel } from './PlayoffMomentum'
import { FINGERPRINT_FOOTER, LANDSCAPE_FOOTER, TRUTH_EXPLANATION, FRANCHISE_NOTE, trajectoryCopy } from '../../utils/teamProfileCopy'
import { IMAGE, drawCellVisual, layoutTable, wrapText } from '../../utils/tableImage'
import { loadLogo } from '../../utils/teamLogo'
import { drawChartPlot } from '../../utils/chartImage'
import { ordinal, signed1, teamColor, eloPeaks, rankTone } from '../../utils/teamProfile'
import { pct0 } from '../../utils/eloLean'
import { shortWeekName, weekName } from '../../utils/playoffRounds'
import { seasonNumber } from '../../utils/seasons'

const color = team => teamColor(team.primaryColor) ?? IMAGE.accent
const text = (ctx, value, x, y, size = 12, tone = IMAGE.ink, bold = false) => {
  ctx.font = `${bold ? 'bold ' : ''}${size}px sans-serif`
  ctx.fillStyle = tone
  ctx.textAlign = 'left'
  ctx.fillText(value ?? '—', x, y)
}
function paragraph(ctx, value, width, y) {
  ctx.font = '11px sans-serif'
  wrapText(ctx, value, width - 40).forEach((row, i) => text(ctx, row, 20, y + i * 15, 11, IMAGE.muted))
}

export const tableWithFooter = (spec, footer) => ({ async draw(ctx, width) {
  const table = await layoutTable(spec, ctx)
  ctx.font = '11px sans-serif'
  const footerHeight = wrapText(ctx, footer, width - 40).length * 15 + 30
  return { height: table.height + footerHeight, draw(ctx) {
    ctx.save()
    ctx.scale(Math.min(1, width / table.width), 1)
    table.draw(ctx, 0, 0)
    ctx.restore()
    paragraph(ctx, footer, width, table.height + 20)
  } }
} })

const line = (ctx, x1, y1, x2, y2, tone = IMAGE.line, dash = []) => {
  ctx.strokeStyle = tone
  ctx.setLineDash(dash)
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.setLineDash([])
}
const dot = (ctx, x, y, tone, radius = 4) => {
  ctx.fillStyle = tone
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}
const logo = (ctx, img, abbr, x, y, size) => {
  if (img) {
    try { ctx.drawImage(img, x, y, size, size); return } catch { /* A decoded logo can still fail to draw. */ }
  }
  text(ctx, abbr, x, y + size / 2)
}

export const headerImage = (team, season, kpis) => ({ width: 390, async draw(ctx, width) {
  const img = await loadLogo(team.abbrName)
  ctx.font = '11px sans-serif'
  const rowHeights = Array.from({ length: Math.ceil(kpis.length / 2) }, (_, i) => Math.max(126, ...kpis.slice(i * 2, i * 2 + 2).map(k => 98 + (k.note ? wrapText(ctx, k.note, (i * 2 === kpis.length - 1 ? width : width / 2) - 24).length * 14 : 0) + (k.delta ? 20 : 0))))
  const height = 164 + rowHeights.reduce((sum, h) => sum + h, 0)
  return { height, draw(ctx) {
    const wash = ctx.createLinearGradient(0, 0, width, 0)
    wash.addColorStop(0, `${color(team)}42`)
    wash.addColorStop(0.4, `${color(team)}1a`)
    wash.addColorStop(0.78, `${color(team)}00`)
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, width, 158)
    ctx.fillStyle = color(team)
    ctx.fillRect(0, 0, 6, 158)
    logo(ctx, img, team.abbrName, 20, 12, 68)
    text(ctx, `${team.conference} · ${team.division} · Season ${seasonNumber(season)}`, 20, 94, 11, IMAGE.muted)
    text(ctx, team.cityName, 20, 117, 20, IMAGE.muted, true)
    text(ctx, team.displayName, 20, 145, 32, IMAGE.ink, true)
    kpis.forEach((k, i) => {
      const x = (i % 2) * width / 2, y = 164 + rowHeights.slice(0, Math.floor(i / 2)).reduce((sum, h) => sum + h, 0)
      ctx.fillStyle = IMAGE.surface
      const cellWidth = i === kpis.length - 1 && kpis.length % 2 ? width : width / 2
      ctx.fillRect(x + 1, y, cellWidth - 2, rowHeights[Math.floor(i / 2)] - 2)
      text(ctx, k.label, x + 12, y + 17, 11, IMAGE.muted, true)
      text(ctx, k.value, x + 12, y + 46, 28, IMAGE.ink, true)
      const rankColor = k.neutral ? IMAGE.ink : IMAGE[rankTone(k.rank?.rank, k.rank?.of)]
      if (k.rank) text(ctx, `${ordinal(k.rank.rank)}${k.rankWord ?? ''} of ${k.rank.of}`, x + 12, y + 72, 11, rankColor, true)
      if (k.note) {
        ctx.font = '11px sans-serif'
        wrapText(ctx, k.note, cellWidth - 24).forEach((row, j) => text(ctx, row, x + 12, y + 89 + j * 14, 11, IMAGE.muted))
      }
      if (k.delta) text(ctx, `${k.delta.minor ? '' : k.delta.up ? '▲ ' : '▼ '}${k.delta.text}`, x + 12, y + rowHeights[Math.floor(i / 2)] - 16, 11, k.delta.minor ? IMAGE.muted : k.delta.up ? IMAGE.good : IMAGE.bad)
    })
  } }
} })

export const fingerprintImage = groups => ({ draw(ctx, width) {
  const rowHeight = 36, columns = 2, gap = 28, w = (width - 40 - gap) / columns
  const height = Math.ceil(groups.length / columns) * (Math.max(...groups.map(g => g.rows.length)) * rowHeight + 44) + 70
  return { height, draw(ctx) {
    groups.forEach((group, i) => {
      const x = 20 + (i % columns) * (w + gap), top = Math.floor(i / columns) * (height - 48)
      text(ctx, group.title, x, top + 16, 18, IMAGE.ink, true)
      text(ctx, 'Pctl · Value', x + w - 85, top + 16, 11, IMAGE.muted)
      line(ctx, x, top + 30, x + w, top + 30, IMAGE.ink)
      group.rows.forEach((r, j) => {
        const y = top + 36 + j * rowHeight
        text(ctx, r.label, x, y + 12)
        if (r.percentile != null) drawCellVisual(ctx, { meter: () => r.percentile }, r, j, x + 132, y, w - 210, String(r.percentile))
        else text(ctx, 'No data', x + 132, y + 12, 11, IMAGE.muted)
        text(ctx, r.text, x + w - 60, y + 12, 12, IMAGE.ink, true)
        line(ctx, x, y + 29, x + w, y + 29)
      })
    })
    const y = height - 50
    text(ctx, 'Poor', 20, y, 11, IMAGE.muted)
    const gradient = ctx.createLinearGradient(52, 0, 164, 0)
    gradient.addColorStop(0, IMAGE.bad); gradient.addColorStop(0.5, IMAGE.line); gradient.addColorStop(1, IMAGE.good)
    ctx.fillStyle = gradient
    ctx.fillRect(52, y - 3, 112, 6)
    text(ctx, 'Great', 174, y, 11, IMAGE.muted)
    paragraph(ctx, FINGERPRINT_FOOTER, width, y + 24)
  } }
} })

export const landscapeImage = chart => ({ draw: () => ({ height: 670, async draw(ctx) {
  await drawChartPlot(ctx, 900, 694, chart, 16)
  paragraph(ctx, LANDSCAPE_FOOTER, 900, 649)
} }) })

function plot(ctx, width, top, data, keys, colors, { baseline, boundaries = false, peaks = false, band = false } = {}) {
  if (!data.length) return
  const valid = data.flatMap(d => keys.map(k => d[k])).filter(v => v != null && Number.isFinite(v))
  if (!valid.length) return
  const lo = Math.floor((Math.min(...valid, baseline ?? Infinity) - (baseline ? 20 : 0)) / (baseline ? 50 : 1)) * (baseline ? 50 : 1)
  const hi = Math.max(lo + 1, Math.ceil((Math.max(...valid, baseline ?? -Infinity) + (baseline ? 20 : 0)) / (baseline ? 50 : 1)) * (baseline ? 50 : 1))
  const left = 60, right = width - 45, bottom = top + 190
  const x = i => left + i / Math.max(1, data.length - 1) * (right - left)
  const y = v => bottom - (v - lo) / (hi - lo) * 164
  for (let i = 0; i <= 4; i++) {
    const v = lo + (hi - lo) * i / 4
    line(ctx, left, y(v), right, y(v), IMAGE.line, [2, 4])
    text(ctx, v.toFixed(baseline ? 0 : 1), 12, y(v), 11, IMAGE.muted)
  }
  if (baseline != null) {
    line(ctx, left, y(baseline), right, y(baseline), IMAGE.muted)
    text(ctx, `${baseline} avg`, right - 52, y(baseline) - 10, 10, IMAGE.muted)
  }
  if (band && keys.length === 2) {
    ctx.beginPath()
    data.forEach((d, i) => i ? ctx.lineTo(x(i), y(d[keys[0]])) : ctx.moveTo(x(i), y(d[keys[0]])))
    for (let i = data.length - 1; i >= 0; i--) ctx.lineTo(x(i), y(data[i][keys[1]]))
    ctx.closePath()
    ctx.fillStyle = data.at(-1)[keys[0]] >= data.at(-1)[keys[1]] ? IMAGE.good : IMAGE.bad
    ctx.globalAlpha = 0.15
    ctx.fill()
    ctx.globalAlpha = 1
  }
  data.forEach((d, i) => {
    if (boundaries && (i === 0 || data[i - 1].season !== d.season)) {
      if (i) line(ctx, x(i), top + 26, x(i), bottom, IMAGE.muted, [3, 3])
      text(ctx, `S${seasonNumber(d.season)}`, x(i), bottom + 18, 11, IMAGE.muted)
    } else if (!boundaries && (data.length < 20 || i % Math.ceil(data.length / 16) === 0)) text(ctx, d.label ?? shortWeekName(d.week), x(i) - 8, bottom + 18, 10, IMAGE.muted)
  })
  keys.forEach((key, k) => {
    ctx.strokeStyle = colors[k]
    ctx.lineWidth = 2
    ctx.setLineDash(k ? [5, 4] : [])
    ctx.beginPath()
    let started = false
    data.forEach((d, i) => {
      if (d[key] == null || !Number.isFinite(d[key])) { started = false; return }
      if (started) ctx.lineTo(x(i), y(d[key]))
      else ctx.moveTo(x(i), y(d[key]))
      started = true
    })
    ctx.stroke()
    ctx.setLineDash([])
  })
  if (peaks) {
    const extrema = eloPeaks(data.filter(d => d.endElo != null))
    if (extrema) for (const [label, d, tone] of [['Peak', extrema.peak, IMAGE.good], ['Low', extrema.trough, IMAGE.bad]]) {
      const i = data.indexOf(d)
      dot(ctx, x(i), y(d.endElo), tone)
      text(ctx, `${label} ${d.endElo.toFixed(0)}`, Math.min(right - 65, x(i)), y(d.endElo) + (label === 'Peak' ? -12 : 14), 11)
    }
  }
}

export const truthImage = (lanes, games, arc) => ({ draw: () => ({ height: arc.length > 1 ? 475 : 240, draw(ctx) {
  const left = 135, right = 805, x = v => left + v / Math.max(1, games) * (right - left)
  line(ctx, x(lanes[0].value), 5, x(lanes[0].value), lanes.length * 38, IMAGE.muted, [4, 4])
  lanes.forEach((lane, i) => {
    const y = 20 + i * 38, tone = [IMAGE.ink, IMAGE.muted, IMAGE.accent][i]
    text(ctx, lane.label, 15, y)
    line(ctx, left, y, right, y)
    ctx.fillStyle = tone
    ctx.globalAlpha = 0.35
    ctx.fillRect(left, y - 4, x(lane.value) - left, 8)
    ctx.globalAlpha = 1
    dot(ctx, x(lane.value), y, tone, 7)
    text(ctx, lane.value?.toFixed(1), right + 20, y, 22, IMAGE.ink, true)
  })
  text(ctx, '0', left, 142, 11, IMAGE.muted)
  text(ctx, `${games} games`, right - 42, 142, 11, IMAGE.muted)
  if (arc.length > 1) {
    const gap = arc.at(-1).cumWins - arc.at(-1).cumExpected
    text(ctx, `Week by week    — Actual wins    - - Elo expected wins    ${gap >= 0 ? 'Ahead of' : 'Behind'} Elo by ${Math.abs(gap).toFixed(1)}`, 20, 178, 12, IMAGE.muted)
    plot(ctx, 900, 182, arc, ['cumWins', 'cumExpected'], [IMAGE.ink, IMAGE.accent], { band: true })
  }
  paragraph(ctx, TRUTH_EXPLANATION, 900, arc.length > 1 ? 425 : 180)
} }) })

export const arcImage = (team, games) => ({ async draw(ctx, width) {
  const logos = await Promise.all(games.map(g => loadLogo(g.opp.abbrName)))
  const count = 6, w = (width - 40) / count, rows = Math.ceil(games.length / count), chartTop = rows * 160 + 35
  return { height: chartTop + 275, draw(ctx) {
    games.forEach((g, i) => {
      const x = 20 + i % count * w, y = Math.floor(i / count) * 160
      ctx.fillStyle = IMAGE.surface
      ctx.fillRect(x, y, w - 8, 150)
      ctx.fillStyle = g.result === 'W' ? IMAGE.good : g.result === 'L' ? IMAGE.bad : IMAGE.muted
      ctx.fillRect(x, y, w - 8, 4)
      text(ctx, weekName(g.week), x + 8, y + 18, 11, IMAGE.muted)
      text(ctx, g.home ? 'Home' : 'Away', x + w - 48, y + 18, 10, IMAGE.muted)
      logo(ctx, logos[i], g.opp.abbrName, x + 8, y + 32, 26)
      text(ctx, `${g.home ? 'vs' : '@'} ${g.opp.abbrName}`, x + 40, y + 45, 13, IMAGE.ink, true)
      text(ctx, g.result, x + 8, y + 76, 20, g.result === 'W' ? IMAGE.good : g.result === 'L' ? IMAGE.bad : IMAGE.ink, true)
      text(ctx, `${g.teamScore ?? '—'}–${g.oppScore ?? '—'}`, x + 30, y + 76, 20, IMAGE.ink, true)
      text(ctx, g.winProb == null ? '—' : `${pct0(g.winProb)} win probability`, x + 8, y + 95, 11, IMAGE.muted)
      text(ctx, `${signed1(g.eloChange)} Elo`, x + 8, y + 109, 11, g.eloChange >= 0 ? IMAGE.good : IMAGE.bad, true)
      if (g.upset) {
        ctx.globalAlpha = g.upset.alpha
        ctx.fillStyle = g.upset.won ? IMAGE.good : IMAGE.bad
        ctx.fillRect(x, y + 122, w - 8, 28)
        ctx.globalAlpha = 1
        text(ctx, `${g.upset.label} ${g.upset.won ? 'win' : 'loss'}`, x + 8, y + 136, 10, IMAGE.ink, true)
      }
    })
    text(ctx, 'Elo through the season', 20, chartTop, 14, IMAGE.ink, true)
    if (games.length) paragraph(ctx, trajectoryCopy(games.at(-1).postElo == null || games[0].preElo == null ? null : games.at(-1).postElo - games[0].preElo), width, chartTop + 232)
    const data = games.length ? [{ elo: games[0].preElo, label: 'Start' }, ...games.map(g => ({ ...g, elo: g.postElo }))] : []
    plot(ctx, width, chartTop + 5, data, ['elo'], [color(team)], { baseline: 1500 })
  } }
} })

export const franchiseImage = (team, points, spec) => ({ async draw(ctx, width) {
  const table = await layoutTable(spec, ctx)
  const panelWidth = Math.max(width, table.width)
  return { height: 295 + table.height, draw(ctx) {
    text(ctx, 'Elo rating after each week', 20, 14, 14, IMAGE.ink, true)
    plot(ctx, width, 20, points, ['endElo'], [color(team)], { baseline: 1500, boundaries: true, peaks: true })
    paragraph(ctx, FRANCHISE_NOTE, width, 253)
    if (panelWidth > width) {
      ctx.save()
      ctx.scale(width / panelWidth, 1)
      table.draw(ctx, 0, 295)
      ctx.restore()
    } else table.draw(ctx, 0, 295)
  } }
} })

export const playoffOutlookImage = ({ team, probability, probabilityText, badges, status, finished, story, stages, preplayoff, seedOdds, points, next, opp, week, rank }) => ({ async draw(ctx, width) {
  const img = next ? await loadLogo(opp.abbrName) : null
  const gap = 24, padding = 20, w = (width - padding * 2 - gap * 2) / 3
  const xs = [padding, padding + w + gap, padding + (w + gap) * 2]
  const wrapped = (value, size = 14, maxWidth = w, bold = false) => {
    ctx.font = `${bold ? 'bold ' : ''}${size}px sans-serif`
    return wrapText(ctx, value, maxWidth)
  }
  const badgeRows = badges.map(b => wrapped(b, 12))
  const statusRows = status ? wrapped(`${finished ? 'Final seed: ' : 'If the season ended today: '}${status}`, 14, w, true) : []
  const storyRows = wrapped(story)
  const headlineHeight = 207 + badgeRows.reduce((n, rows) => n + rows.length * 16 + 10, 0) + statusRows.length * 20 + storyRows.length * 22
  const jump = points.length < 2 ? null : points.slice(1).reduce((best, p, i) => {
    const change = p.p - points[i].p
    return Math.abs(change) > Math.abs(best.change) ? { index: i + 1, change } : best
  }, { index: 1, change: points[1].p - points[0].p })
  const jumpText = jump ? `Biggest weekly jump: ${jump.change >= 0 ? '+' : ''}${Math.round(jump.change * 100)} pp · ${snapshotLabel(points[jump.index].week)}` : ''
  const jumpRows = jump ? wrapped(jumpText, 12) : []
  const momentumHeight = jump ? 35 + w * 138 / 320 + jumpRows.length * 16 + 16 : 0
  const opponentRows = next ? wrapped(`${next.side === 'home' ? 'vs' : '@'} ${opp.displayName}`, 14, w - 54) : []
  const gameHeight = next ? 106 + opponentRows.length * 20 : 0
  const height = Math.max(headlineHeight, 400 + (preplayoff ? 32 : 0), momentumHeight + gameHeight + 75) + 20
  return { height, draw(ctx) {
    const block = (rows, x, y, size, tone = IMAGE.muted, bold = false, leading = 20) => {
      rows.forEach((row, i) => text(ctx, row, x, y + i * leading, size, tone, bold))
      return y + rows.length * leading
    }
    const box = (x, y, bw, bh, fill, stroke = false) => {
      ctx.beginPath()
      ctx.roundRect(x, y, bw, bh, 4)
      ctx.fillStyle = fill
      ctx.fill()
      if (stroke) { ctx.strokeStyle = IMAGE.line; ctx.lineWidth = 1; ctx.stroke() }
    }
    box(padding, 0, width - padding * 2, 4, color(team))
    line(ctx, xs[1] - 12, 28, xs[1] - 12, height - 20)
    line(ctx, xs[2] - 12, 28, xs[2] - 12, height - 20)
    const cx = xs[0] + w / 2, cy = 108
    ctx.lineWidth = 12
    ctx.strokeStyle = IMAGE.line
    ctx.beginPath(); ctx.arc(cx, cy, 68, 0, Math.PI * 2); ctx.stroke()
    if (probability > 0) {
      ctx.strokeStyle = probShade(probability) ?? IMAGE.muted
      ctx.lineCap = 'round'
      ctx.beginPath(); ctx.arc(cx, cy, 68, -Math.PI / 2, -Math.PI / 2 + probability * Math.PI * 2); ctx.stroke()
      ctx.lineCap = 'butt'
    }
    ctx.font = 'bold 36px sans-serif'
    text(ctx, probabilityText, cx - ctx.measureText(probabilityText).width / 2, cy - 3, 36, probShade(probability), true)
    ctx.font = '10px sans-serif'
    const captionWidth = ctx.measureText('Playoff probability').width
    text(ctx, 'Playoff probability', cx - captionWidth / 2, cy + 23, 10, IMAGE.muted)
    let y = 207
    badgeRows.forEach(rows => {
      box(xs[0], y - 10, w, rows.length * 16 + 6, IMAGE.bg, true)
      y = block(rows, xs[0] + 6, y, 12, IMAGE.ink, false, 16) + 10
    })
    y = block(statusRows, xs[0], y, 14, IMAGE.ink, true) + 12
    block(storyRows, xs[0], y, 14, IMAGE.muted, false, 22)
    y = 33
    text(ctx, 'ROAD TO THE TITLE', xs[1], y, 12, IMAGE.muted, true)
    y += 28
    if (preplayoff) y = block(wrapped('Pre-playoff projection (end of regular season)', 12), xs[1], y, 12, IMAGE.muted, false, 16) + 8
    stages.forEach((stage, i) => {
      text(ctx, stage.label, xs[1], y, 12)
      ctx.font = 'bold 12px sans-serif'
      text(ctx, stage.text, xs[1] + w - ctx.measureText(stage.text).width, y, 12, IMAGE.ink, true)
      box(xs[1], y + 12, w, 16, IMAGE.surface, true)
      if (stage.p > 0) box(xs[1], y + 12, w * stage.p, 16, (i === 0 ? probShade : chanceShade)(stage.p))
      y += 44
    })
    y += 4
    text(ctx, 'Division winners', xs[1], y, 12, IMAGE.muted)
    text(ctx, 'Wild cards', xs[1], y + 22, 12, IMAGE.muted)
    SEED_COLORS.forEach((tone, i) => {
      const x = xs[1] + 105 + (i < 4 ? i : i - 4) * 32, sy = y + (i < 4 ? 0 : 22)
      box(x, sy - 6, 12, 12, tone)
      text(ctx, String(i + 1), x + 16, sy, 12, IMAGE.muted)
    })
    y += 42
    box(xs[1], y, w, 12, IMAGE.line)
    let seedX = xs[1]
    seedOdds.forEach((p, i) => {
      ctx.fillStyle = SEED_COLORS[i]
      ctx.fillRect(seedX, y, p * w, 12)
      if (i === 4 && p > 0) { ctx.fillStyle = IMAGE.bg; ctx.fillRect(seedX, y, 2, 12) }
      seedX += p * w
    })
    ctx.fillStyle = IMAGE.muted
    ctx.globalAlpha = 0.3
    ctx.fillRect(xs[1] + w * probability, y, w * (1 - probability), 12)
    ctx.globalAlpha = 1
    text(ctx, `Out: ${formatOdds(1 - probability, finished)}`, xs[1], y + 27, 12, IMAGE.muted)
    y = 33
    if (jump) {
      text(ctx, 'MOMENTUM', xs[2], y, 12, IMAGE.muted, true)
      const scale = w / 320, top = y + 12
      const coords = points.map((p, i) => [xs[2] + (12 + i / (points.length - 1) * 296) * scale, top + (108 - p.p * 78) * scale])
      ctx.beginPath()
      coords.forEach(([x, py], i) => i ? ctx.lineTo(x, py) : ctx.moveTo(x, py))
      ctx.lineTo(xs[2] + 308 * scale, top + 112 * scale)
      ctx.lineTo(xs[2] + 12 * scale, top + 112 * scale)
      ctx.closePath(); ctx.fillStyle = color(team); ctx.globalAlpha = 0.14; ctx.fill(); ctx.globalAlpha = 1
      ctx.beginPath()
      coords.forEach(([x, py], i) => i ? ctx.lineTo(x, py) : ctx.moveTo(x, py))
      ctx.strokeStyle = color(team); ctx.lineWidth = 2.5; ctx.stroke()
      const [jx, jy] = coords[jump.index]
      dot(ctx, jx, jy, color(team))
      text(ctx, `${jump.change >= 0 ? '+' : ''}${Math.round(jump.change * 100)} pp`, Math.min(xs[2] + w - 54, Math.max(xs[2], jx - 22)), Math.max(top + 12, jy - 12), 12)
      text(ctx, snapshotLabel(points[0].week), xs[2] + 12 * scale, top + 132 * scale, 11, IMAGE.muted)
      const last = snapshotLabel(points.at(-1).week)
      ctx.font = '11px sans-serif'
      text(ctx, last, xs[2] + 308 * scale - ctx.measureText(last).width, top + 132 * scale, 11, IMAGE.muted)
      y = block(jumpRows, xs[2], top + 138 * scale + 14, 12, IMAGE.muted, false, 16) + 20
    }
    if (next) {
      box(xs[2], y - 12, w, gameHeight, IMAGE.bg, true)
      text(ctx, `NEXT GAME · ${weekName(week)}`, xs[2] + 12, y + 6, 12, IMAGE.muted, true)
      logo(ctx, img, opp.abbrName, xs[2] + 12, y + 22, 20)
      const bottom = block(opponentRows, xs[2] + 40, y + 32, 14, IMAGE.ink, true)
      const chipWidth = (w - 32) / 2
      ;[[next.ifWin.playoffs, 'Win →', '▲'], [next.ifLoss.playoffs, 'Lose →', '▼']].forEach(([p, label, arrow], i) => {
        const x = xs[2] + 12 + i * (chipWidth + 8)
        box(x, bottom + 2, chipWidth, 28, probShade(p) ?? IMAGE.surface)
        text(ctx, `${label} ${formatOdds(p)} ${arrow}`, x + 6, bottom + 16, 12)
      })
      text(ctx, `${ordinal(rank)} biggest game this week`, xs[2] + 12, bottom + 48, 12, IMAGE.muted)
      y += gameHeight + 8
    }
    text(ctx, 'Path to the playoffs →', xs[2], y + 8, 14, IMAGE.accent)
    text(ctx, 'All playoff probabilities →', xs[2], y + 36, 14, IMAGE.accent)
  } }
} })
