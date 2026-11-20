import ExportMenu from '../ExportMenu'
import { headerSpec } from './specs'
import { Link } from 'react-router-dom'
import { TeamLogo } from '../TeamLogo'
import InfoTip from '../InfoTip'
import { teamLogoUrl } from '../../utils/teamLogo'
import { ordinal, rankTone } from '../../utils/teamProfile'
import { seasonNumber } from '../../utils/seasons'

function Kpi({ label, value, tip, rank, rankWord = '', neutral, note, delta }) {
  return (
    <div className="bg-bg px-4 py-3 min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted truncate">
        {tip ? <InfoTip text={tip}>{label}</InfoTip> : label}
      </dt>
      <dd className="font-display font-extrabold text-3xl sm:text-4xl leading-none mt-1 num">{value}</dd>
      <dd className="text-xs mt-1.5 flex items-center gap-2 flex-wrap num">
        {rank && <span className={`font-semibold ${neutral ? 'text-ink' : ({ good: 'text-good', bad: 'text-bad', muted: 'text-muted' })[rankTone(rank.rank, rank.of)]}`}>{ordinal(rank.rank)}{rankWord} of {rank.of}</span>}
        {note && <span className="text-muted">{note}</span>}
        {delta && (delta.minor
          ? <span className="text-muted" title={delta.title}>{delta.text}</span>
          : <span className={delta.up ? 'text-good' : 'text-bad'} title={delta.title}>{delta.up ? '▲' : '▼'} {delta.text}</span>)}
      </dd>
    </div>
  )
}

export default function Masthead({ team, season, seasons, onSeason, kpis }) {
  const wash = 'linear-gradient(100deg, color-mix(in srgb, var(--team-c) 26%, transparent) 0%, color-mix(in srgb, var(--team-c) 10%, transparent) 40%, transparent 78%)'
  return (
    <>
    <nav aria-label="Breadcrumb" className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
      <Link to="/teams" className="hover:text-ink">Teams</Link>
      <span className="mx-1.5" aria-hidden="true">›</span>
      <span>{team.division}</span>
    </nav>
    <header className="relative overflow-hidden border-y-2 border-rule mb-6 bg-surface">
      <div className="absolute inset-0" style={{ background: wash }} aria-hidden="true" />
      <div className="absolute left-0 inset-y-0 w-1.5" style={{ background: 'var(--team-c)' }} aria-hidden="true" />
      <img src={teamLogoUrl(team.abbrName)} alt="" aria-hidden="true"
        className="absolute -right-12 -top-16 w-80 h-80 object-contain opacity-[0.08] pointer-events-none select-none hidden sm:block"
        onError={e => { e.target.style.display = 'none' }} />
      <div className="relative pl-5 pr-4 sm:pl-8 sm:pr-6 py-5 flex items-center gap-4 sm:gap-6 flex-wrap">
        <TeamLogo abbr={team.abbrName} size={88} />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {team.conference} · {team.division} · Season {seasonNumber(season)}
          </p>
          <p className="font-display font-bold uppercase text-xl sm:text-2xl leading-none mt-2 text-muted">{team.cityName}</p>
          <h1 className="font-display font-extrabold uppercase tracking-tight text-5xl sm:text-6xl leading-[0.9]">{team.displayName}</h1>
        </div>
        <select className="field sm:ml-auto self-start sm:self-center" aria-label="Season" value={season} onChange={e => onSeason(Number(e.target.value))}>
          {[...seasons].reverse().map(s => <option key={s} value={s}>Season {seasonNumber(s)}</option>)}
        </select>
      </div>
      <div className="relative flex justify-end px-4"><ExportMenu spec={headerSpec(team, season, kpis)} /></div>
      <dl className="relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-line border-t border-line">
        {kpis.map(k => <Kpi key={k.label} {...k} />)}
      </dl>
    </header>
    </>
  )
}
