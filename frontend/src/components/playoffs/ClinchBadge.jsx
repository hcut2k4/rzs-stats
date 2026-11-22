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
export default function ClinchBadge({ markers, compact = false }) {
  if (!markers) return null
  const clinched = [['oneSeed', 'No. 1 seed'], ['division', 'division'], ['playoffs', 'playoffs']].find(([key]) => markers[key] === 'clinched')
  const eliminated = [['playoffs', 'playoffs'], ['division', 'division'], ['oneSeed', 'No. 1 seed']].find(([key]) => markers[key] === 'eliminated')
  const badges = [clinched && `Clinched ${clinched[1]}`, eliminated && !(eliminated[0] === 'oneSeed' && clinched) && `Eliminated from the ${eliminated[1]}`].filter(Boolean)
  return <span className={`inline-flex gap-1 ${compact ? 'whitespace-nowrap' : 'flex-wrap'}`}>{badges.map(text => <InfoTip key={text} text={compact ? `${text}. ${CLINCH_TIP}` : CLINCH_TIP}><span tabIndex={0} className={`text-xs rounded border border-line ${compact ? 'px-1' : 'px-1.5 py-0.5'}`}>{compact ? <><span className="sr-only">{text}</span><span aria-hidden="true">{text.startsWith('Eliminated') ? 'Out' : clinched[0] === 'oneSeed' ? '#1' : clinched[0] === 'division' ? 'Div' : 'In'}</span></> : text}</span></InfoTip>)}</span>
}
