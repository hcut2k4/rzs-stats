import { teamLogoUrl } from '../utils/teamLogo'

describe('teamLogoUrl', () => {
  it('maps Arizona AZ to the ESPN ari logo', () => {
    expect(teamLogoUrl('AZ')).toBe('https://a.espncdn.com/i/teamlogos/nfl/500/ari.png')
  })

  it('lowercases other abbreviations', () => {
    expect(teamLogoUrl('NE')).toBe('https://a.espncdn.com/i/teamlogos/nfl/500/ne.png')
  })
})
