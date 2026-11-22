import { getPlayoffOdds, getPlayoffPicture, getPlayoffClinch } from '../../api/client'
import { usePlayoffLoad } from '../../utils/usePlayoffLoad'
import { teamMarker, markerOdds, markerValue, clinchTexts } from '../playoffs/ClinchBadge'
import { rankIn } from '../../utils/teamProfile'
import ExportMenu from '../ExportMenu'
import { headerSpec } from './specs'
import { Link } from 'react-router-dom'
import { TeamLogo } from '../TeamLogo'
import InfoTip from '../InfoTip'
import { teamLogoUrl } from '../../utils/teamLogo'
import { ordinal, rankTone } from '../../utils/teamProfile'
import { seasonNumber } from '../../utils/seasons'

function Kpi({ label, value, tip, rank, rankWord = '', neutral, note, delta, className = '' }) {
  return (
    <div className={`bg-bg px-4 py-3 min-w-0 ${className}`}>
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
  const odds = usePlayoffLoad(season == null ? null : `playoffs-odds-${season}-madden`, () => getPlayoffOdds(season, 'madden'))
  const rows = odds.data?.conferences?.flatMap(c => c.teams) ?? []
  const row = rows.find(r => r.team.teamId === team.teamId)
  const picture = usePlayoffLoad(row ? `playoffs-picture-${season}-madden` : null, () => getPlayoffPicture(season, 'madden'))
  const clinch = usePlayoffLoad(row ? `playoffs-clinch-${season}-madden` : null, () => getPlayoffClinch(season, 'madden'))
  const markers = teamMarker(clinch.data, team.teamId)
  const probability = row?.odds?.playoffs
  const available = Number.isFinite(probability)
  const standing = picture.data?.conferences?.flatMap(c => [...c.seeds, ...c.hunt]).find(r => r.team.teamId === team.teamId)
  const seed = standing ? standing.seed ? `${ordinal(standing.seed)} seed · ${standing.divisionWinner ? 'Division winner' : 'Wild card'}` : 'Outside the field' : null
  const values = [...kpis, {
    label: 'Playoffs', value: available ? markerOdds(probability, markers?.playoffs) : '—',
    note: available ? [seed, ...clinchTexts(markers)].filter(Boolean).join(' · ') : null,
    tip: 'Probability of making the playoffs from simulations of the remaining season. Clinched and eliminated values are proven under Madden tiebreak rules. Rank compares all teams; the note shows the current playoff seed.',
    rank: available ? rankIn(markerValue(probability, markers?.playoffs), rows.map(r => markerValue(r.odds?.playoffs, teamMarker(clinch.data, r.team.teamId)?.playoffs))) : null,
  }]
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
      <div className="relative flex justify-end px-4"><ExportMenu spec={headerSpec(team, season, values)} /></div>
      <dl className="relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-line border-t border-line">
        {values.map((k, i) => <Kpi key={k.label} {...k} className={i === values.length - 1 ? [
          values.length % 2 ? 'col-span-2' : 'col-span-1',
          ({ 0: 'sm:col-span-1', 1: 'sm:col-span-3', 2: 'sm:col-span-2' })[values.length % 3],
          ({ 0: 'lg:col-span-1', 1: 'lg:col-span-4', 2: 'lg:col-span-3', 3: 'lg:col-span-2' })[values.length % 4],
        ].join(' ') : ''} />)}
      </dl>
    </header>
    </>
  )
}
