import { getPlayoffClinch } from '../../api/client'
import { useLoad } from '../../utils/useLoad'
import { formatOdds } from '../../utils/playoffOdds'
import InfoTip from '../InfoTip'

export const CLINCH_TIP = 'Guaranteed under Madden 27\'s tiebreak rules for every possible result of the remaining games, including ties. No badge means it isn\'t settled yet.'
export function useClinch(season, rules) {
  return useLoad(season == null ? null : `playoffs-clinch-${season}-${rules}`, async () => getPlayoffClinch(season, 'madden')).data
}
export const teamMarker = (data, teamId) => data?.teams?.find(r => r.team.teamId === teamId)
export const markerValue = (p, marker) => marker === 'clinched' ? 1 : marker === 'eliminated' ? 0 : p
export function markerOdds(p, marker) {
  return formatOdds(markerValue(p, marker), marker === 'clinched' || marker === 'eliminated')
}
const GOAL_LABELS = { oneSeed: 'No. 1 seed', division: 'division', playoffs: 'playoffs' }
const CLINCHED_GOALS = ['oneSeed', 'division', 'playoffs']
const ELIMINATED_GOALS = ['playoffs', 'division', 'oneSeed']
const markerText = (goal, state) => state === 'clinched' ? `Clinched ${GOAL_LABELS[goal]}` : `Eliminated from the ${GOAL_LABELS[goal]}`

export function clinchTexts(markers) {
  if (!markers) return []
  const clinched = CLINCHED_GOALS.find(goal => markers[goal] === 'clinched')
  const eliminated = ELIMINATED_GOALS.find(goal => markers[goal] === 'eliminated')
  return [clinched && markerText(clinched, 'clinched'), eliminated && !(eliminated === 'oneSeed' && clinched) && markerText(eliminated, 'eliminated')].filter(Boolean)
}
export function clinchIcons(markers) {
  if (!markers) return []
  if (markers.playoffs === 'eliminated') return [{ goal: 'playoffs', state: 'eliminated', text: markerText('playoffs', 'eliminated') }]
  const clinched = CLINCHED_GOALS.find(goal => markers[goal] === 'clinched')
  const eliminated = ELIMINATED_GOALS.find(goal => markers[goal] === 'eliminated')
  return [clinched && { goal: clinched, state: 'clinched', text: markerText(clinched, 'clinched') }, eliminated && { goal: eliminated, state: 'eliminated', text: markerText(eliminated, 'eliminated') }].filter(Boolean)
}

function ClinchIcon({ goal, state }) {
  const out = state === 'eliminated'
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={out ? goal === 'playoffs' ? 'shrink-0 text-bad' : 'shrink-0 text-muted' : 'shrink-0 text-good'}>
    {goal === 'playoffs' ? <path d={out ? 'M4 4l8 8M12 4l-8 8' : 'M3 8l3 3 7-7'} /> : goal === 'division' ? <path fill={out ? 'none' : 'currentColor'} d="M2 4l3 3 3-5 3 5 3-3-2 9H4Z" /> : <><rect x="2" y="1.5" width="12" height="13" rx="3" fill={out ? 'none' : 'currentColor'} /><path d="M7 5l2-1v8M7 12h4" className={out ? 'text-muted' : 'text-bg'} /></>}
    {out && goal !== 'playoffs' && <path d="M1 15L15 1" strokeWidth="2" />}
  </svg>
}

export function ClinchKey() {
  return <div aria-label="Clinch key" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
    <span className="inline-flex items-center gap-1"><ClinchIcon goal="playoffs" state="clinched" />Playoffs</span>
    <span className="inline-flex items-center gap-1"><ClinchIcon goal="division" state="clinched" />Division</span>
    <span className="inline-flex items-center gap-1"><ClinchIcon goal="oneSeed" state="clinched" />No. 1 seed</span>
    <span className="inline-flex items-center gap-1"><ClinchIcon goal="oneSeed" state="eliminated" />Slashed = out</span>
    <span className="inline-flex items-center gap-1"><ClinchIcon goal="playoffs" state="eliminated" />Eliminated</span>
  </div>
}

export default function ClinchBadge({ markers, compact = false }) {
  if (compact) {
    const icons = clinchIcons(markers)
    return icons.length ? <span className="inline-flex items-center gap-1 whitespace-nowrap">{icons.map(icon => <span key={icon.text} title={`${icon.text}. ${CLINCH_TIP}`} className="inline-flex items-center"><ClinchIcon {...icon} /><span className="sr-only">{icon.text}</span></span>)}</span> : null
  }
  const badges = clinchTexts(markers)
  if (!markers) return null
  return <span className="inline-flex gap-1 flex-wrap">{badges.map(text => <InfoTip key={text} text={CLINCH_TIP}><span tabIndex={0} className="text-xs rounded border border-line px-1.5 py-0.5">{text}</span></InfoTip>)}</span>
}
