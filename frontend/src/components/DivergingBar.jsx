const POSITIVE = 'rgb(37 99 235 / 0.55)'
const NEGATIVE = 'rgb(234 88 12 / 0.55)'

export default function DivergingBar({ value, max }) {
  const pct = max > 0 ? Math.min(Math.abs(value) / max, 1) * 50 : 0
  return (
    <div className="relative h-4 w-full min-w-[120px]" aria-hidden="true">
      <div className="absolute inset-y-0 left-1/2 w-px bg-rule" />
      <div
        className="absolute inset-y-0.5"
        style={value >= 0
          ? { left: '50%', width: `${pct}%`, background: POSITIVE }
          : { right: '50%', width: `${pct}%`, background: NEGATIVE }}
      />
    </div>
  )
}
