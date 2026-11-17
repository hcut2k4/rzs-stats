import { LEAN_AWAY, LEAN_HOME } from '../utils/eloLean'

export default function LeanBar({ homeFav, edge }) {
  return (
    <div className="relative h-4 w-full min-w-[140px]" aria-hidden="true">
      <div className="absolute inset-y-0 left-1/2 w-px bg-rule" />
      <div
        className="absolute inset-y-0.5"
        style={{
          [homeFav ? 'left' : 'right']: '50%',
          width: `${(edge * 50).toFixed(1)}%`,
          background: `rgb(${homeFav ? LEAN_HOME : LEAN_AWAY} / ${(0.25 + edge * 0.45).toFixed(2)})`,
        }}
      />
    </div>
  )
}
