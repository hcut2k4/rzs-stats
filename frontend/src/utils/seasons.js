export const SEASON_OFFSET = 103

export const seasonNumber = index => index + SEASON_OFFSET

export const seasonLabel = index => `Season ${seasonNumber(index)}`
