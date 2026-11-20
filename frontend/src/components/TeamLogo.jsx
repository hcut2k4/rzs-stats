import { Link } from 'react-router-dom'
import { teamLogoUrl } from '../utils/teamLogo'

export function TeamLogo({ abbr, size = 24 }) {
  return (
    <img
      src={teamLogoUrl(abbr)}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="object-contain shrink-0"
      onError={e => { e.target.style.visibility = 'hidden' }}
    />
  )
}

export function TeamCell({ abbr, name, size = 24 }) {
  return (
    <span className="flex items-center gap-2">
      <TeamLogo abbr={abbr} size={size} />
      {abbr ? <Link to={`/teams/${abbr}`} className="hover:text-accent hover:underline underline-offset-2">{name ?? abbr}</Link> : <span>{name}</span>}
    </span>
  )
}
