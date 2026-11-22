import { getPlayoffClinch } from '../../api/client'
import { useLoad } from '../../utils/useLoad'
import { formatOdds } from '../../utils/playoffOdds'
import InfoTip from '../InfoTip'

export const CLINCH_TIP = 'Proven in every possible outcome of the remaining games, including ties and unknown scores. A missing badge only means not proven yet.'
export function useClinch(season, rules) {
  return useLoad(season == null ? null : `playoffs-clinch-${season}-${rules}`, async () => getPlayoffClinch(season, rules)).data
}
export const teamMarker = (data, teamId) => data?.teams?.find(r => r.team.teamId === teamId)
export const markerValue = (p, marker) => marker === 'clinched' ? 1 : marker === 'eliminated' ? 0 : p
export function markerOdds(p, marker) {
  return formatOdds(markerValue(p, marker), marker === 'clinched' || marker === 'eliminated')
}
export default function ClinchBadge({ markers }) {
  if (!markers) return null
  const clinched = [['oneSeed', 'No. 1 seed'], ['division', 'division'], ['playoffs', 'playoffs']].find(([key]) => markers[key] === 'clinched')
  const eliminated = [['playoffs', 'playoffs'], ['division', 'division'], ['oneSeed', 'No. 1 seed']].find(([key]) => markers[key] === 'eliminated')
  const badges = [clinched && `Clinched ${clinched[1]}`, eliminated && !(eliminated[0] === 'oneSeed' && clinched) && `Eliminated from the ${eliminated[1]}`].filter(Boolean)
  return <span className="inline-flex flex-wrap gap-1">{badges.map(text => <InfoTip key={text} text={CLINCH_TIP}><span tabIndex={0} className="text-xs rounded border border-line px-1.5 py-0.5">{text}</span></InfoTip>)}</span>
}
