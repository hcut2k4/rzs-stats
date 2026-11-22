import { isBusy } from '../../utils/usePlayoffLoad'

export default function PlayoffError({ error, retry, children }) {
  return <div><p className="text-bad">{isBusy(error) ? 'The server is busy. Try again' : children}</p><button className="field mt-2" onClick={retry}>Retry</button></div>
}
