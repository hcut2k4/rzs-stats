import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RankTooltip } from '../pages/QbPage'

const named = Array.from({ length: 40 }, (_, i) => ({ rosterId: String(i), label: `QB${i}` }))
const payload = named.map((s, i) => ({ dataKey: s.rosterId, value: i + 1, stroke: '#000' }))

describe('RankTooltip', () => {
  it('caps the rows so it cannot overflow the viewport', () => {
    render(<RankTooltip active payload={payload} label="'28 W4" named={named} focus={new Set()} />)
    expect(screen.getAllByText(/^QB\d+$/)).toHaveLength(8)
    expect(screen.getByText(/\+32 more/)).toBeInTheDocument()
  })

  it('lists the leaders at that week when nothing is highlighted', () => {
    render(<RankTooltip active payload={payload} label="'28 W4" named={named} focus={new Set()} />)
    expect(screen.getByText('QB0')).toBeInTheDocument()
    expect(screen.queryByText('QB20')).toBeNull()
  })

  it('shows only the highlighted quarterbacks, however far down they rank', () => {
    render(<RankTooltip active payload={payload} label="'28 W4" named={named} focus={new Set(['30', '7'])} />)
    expect(screen.getAllByText(/^QB\d+$/).map(e => e.textContent)).toEqual(['QB7', 'QB30'])
    expect(screen.queryByText(/more/)).toBeNull()
  })

  it('skips quarterbacks with no rank at that week', () => {
    const gappy = [{ dataKey: '0', value: null, stroke: '#000' }, { dataKey: '1', value: 2, stroke: '#000' }]
    render(<RankTooltip active payload={gappy} label="'26 W1" named={named} focus={new Set()} />)
    expect(screen.queryByText('QB0')).toBeNull()
    expect(screen.getByText('QB1')).toBeInTheDocument()
  })

  it('renders nothing when inactive', () => {
    const { container } = render(<RankTooltip active={false} payload={payload} named={named} focus={new Set()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
