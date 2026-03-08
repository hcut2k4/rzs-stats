import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const getSeasons = () => api.get('/seasons').then(r => r.data)
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
