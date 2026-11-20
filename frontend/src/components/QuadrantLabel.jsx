// Two short lines per corner, so the labels of neighboring quadrants cannot collide on a narrow screen.
export default function QuadrantLabel({ viewBox, lines, right, bottom }) {
  if (!viewBox) return null
  const x = right ? viewBox.x + viewBox.width - 8 : viewBox.x + 8
  const first = bottom ? viewBox.y + viewBox.height - 8 - (lines.length - 1) * 15 : viewBox.y + 18
  return (
    <text textAnchor={right ? 'end' : 'start'} fill="rgb(var(--muted))" fontSize={12} fontWeight={600}>
      {lines.map((line, i) => <tspan key={line} x={x} y={first + i * 15}>{line}</tspan>)}
    </text>
  )
}
