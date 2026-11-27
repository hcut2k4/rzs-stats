import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

const TOKEN_KEY = 'rzs-admin-token'

export const getAdminToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export const setAdminToken = token => {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY) } catch { /* storage unavailable */ }
}

api.interceptors.request.use(config => {
  const token = getAdminToken()
  if (token && config.url?.startsWith('/admin')) config.headers['X-Admin-Token'] = token
  return config
})

export const checkAdminAuth = () => api.get('/admin/auth').then(r => r.data)

export const getPublicSyncStatus = () => api.get('/sync/status').then(r => r.data)

export const getSeasons = () => api.get('/seasons').then(r => r.data)
export const getPlayoffPicture = (season, rules = 'madden') => api.get('/playoffs/picture', { params: { season, rules } }).then(r => r.data)
export const getPlayoffOdds = (season, rules = 'madden') => api.get('/playoffs/odds', { params: { season, rules } }).then(r => r.data)
export const getPlayoffLeverage = (season, week, rules = 'madden') => api.get('/playoffs/leverage', { params: { season, week, rules } }).then(r => r.data)
export const getPlayoffCalibration = season => api.get('/playoffs/calibration', { params: { season } }).then(r => r.data)
export const getStandings = (season) => api.get('/standings', { params: { season } }).then(r => r.data)
export const getGames = (season, stage, week) => api.get('/games', { params: { season, stage, week } }).then(r => r.data)
export const getAvailableWeeks = (season, stage = 1) => api.get('/games/weeks', { params: { season, stage } }).then(r => r.data)
export const getSeasonTrends = () => api.get('/trends/season').then(r => r.data)
export const getWeeklyTrends = (season) => api.get('/trends/weekly', { params: { season } }).then(r => r.data)
export const triggerSync = () => api.post('/admin/sync').then(r => r.data)
export const triggerForceSync = () => api.post('/admin/sync/force').then(r => r.data)
export const getSyncStatus = () => api.get('/admin/sync/status').then(r => r.data)
export const triggerCacheWarm = () => api.post('/admin/cache/warm').then(r => r.data)
export const getCacheWarmStatus = () => api.get('/admin/cache/warm/status').then(r => r.data)

export const getEloRatings = (season, week) => api.get('/elo/ratings', { params: { season, week } }).then(r => r.data)
export const getEloHistory = (season) => api.get('/elo/history', { params: { season } }).then(r => r.data)
export const getEloGames = (season, week, teamId) => api.get('/elo/games', { params: { season, week, teamId } }).then(r => r.data)
export const getEloMatchup = (teamA, teamB, homeTeam) => api.get('/elo/matchup', { params: { teamA, teamB, homeTeam } }).then(r => r.data)
export const getPublicEloConfig = () => api.get('/elo/config').then(r => r.data)
export const getEloConfig = () => api.get('/admin/elo/config').then(r => r.data)
export const putEloConfig = (config) => api.put('/admin/elo/config', config).then(r => r.data)
export const getEloUpcoming = (season) => api.get('/elo/upcoming', { params: { season } }).then(r => r.data)

export const getQbLeaderboard = (params) => api.get('/qb/leaderboard', { params }).then(r => r.data)
export const getQbMovement = (params) => api.get('/qb/movement', { params }).then(r => r.data)
export const triggerProbabilityBackfill = season => api.post('/admin/playoffs/odds/backfill', null, { params: { season } }).then(r => r.data)
export const triggerQbSync = () => api.post('/admin/sync/qb').then(r => r.data)
export const getQbSyncStatus = () => api.get('/admin/sync/qb/status').then(r => r.data)

export const getEfficiency = (season, stage) => api.get('/efficiency', { params: { season, stage } }).then(r => r.data)

export const getPlayoffClinch = (season, rules = 'madden') => api.get('/playoffs/clinch', { params: { season, rules } }).then(r => r.data)
export const getPlayoffRemaining = season => api.get('/playoffs/remaining', { params: { season } }).then(r => r.data)
export const simulatePlayoffs = (body, signal) => api.post('/playoffs/simulate', body, { signal }).then(r => r.data)
export const getPlayoffPath = (abbr, season, rules = 'madden') => api.get(`/playoffs/path/${encodeURIComponent(abbr)}`, { params: { season, rules } }).then(r => r.data)

export const getPlayoffOddsHistory = (season, team) => api.get('/playoffs/odds/history', { params: { season, team } }).then(r => r.data)
export const getPlayoffChampionship = (season, rules = 'madden') => api.get('/playoffs/championship', { params: { season, rules } }).then(r => r.data)

export const getSyncSettings = () => api.get('/admin/sync/settings').then(r => r.data)
export const putSyncSettings = intervalMinutes => api.put('/admin/sync/settings', { intervalMinutes }).then(r => r.data)
