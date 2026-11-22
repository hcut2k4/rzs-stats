import { getPublicSyncStatus } from '../api/client'
import { SYNC_LINE } from './siteCopy'
import { useLoad } from './useLoad'

export function useSyncLine() {
  const { data } = useLoad('public-sync-status', getPublicSyncStatus, { freshMs: Infinity, cacheErrors: true })
  if (!data?.lastSyncAt) return SYNC_LINE
  const date = new Date(data.lastSyncAt)
  if (Number.isNaN(date.getTime())) return SYNC_LINE
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date)
  return `Last synced ${formatted} ET`
}
