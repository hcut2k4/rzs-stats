import { render, screen } from '@testing-library/react'
import ClinchBadge, { clinchIcons, clinchTexts, CLINCH_TIP } from '../components/playoffs/ClinchBadge'

const cases = [
  [{}, []],
  [{ oneSeed: 'eliminated' }, [['oneSeed', 'eliminated']]],
  [{ division: 'eliminated', oneSeed: 'eliminated' }, [['division', 'eliminated']]],
  [{ playoffs: 'eliminated', division: 'eliminated', oneSeed: 'eliminated' }, [['playoffs', 'eliminated']]],
  [{ playoffs: 'clinched' }, [['playoffs', 'clinched']]],
  [{ playoffs: 'clinched', oneSeed: 'eliminated' }, [['playoffs', 'clinched'], ['oneSeed', 'eliminated']]],
  [{ playoffs: 'clinched', division: 'eliminated', oneSeed: 'eliminated' }, [['playoffs', 'clinched'], ['division', 'eliminated']]],
  [{ playoffs: 'clinched', division: 'clinched' }, [['division', 'clinched']]],
  [{ playoffs: 'clinched', division: 'clinched', oneSeed: 'eliminated' }, [['division', 'clinched'], ['oneSeed', 'eliminated']]],
  [{ playoffs: 'clinched', division: 'clinched', oneSeed: 'clinched' }, [['oneSeed', 'clinched']]],
]

it.each(cases)('shows the highest clinched goal and broadest elimination for %j', (markers, expected) => {
  const labels = { playoffs: 'playoffs', division: 'division', oneSeed: 'No. 1 seed' }
  expect(clinchIcons(markers)).toEqual(expected.map(([goal, state]) => ({ goal, state, text: state === 'clinched' ? `Clinched ${labels[goal]}` : `Eliminated from the ${labels[goal]}` })))
})

it('shows no icon without markers', () => {
  expect(clinchIcons(null)).toEqual([])
  const { container } = render(<ClinchBadge compact />)
  expect(container).toBeEmptyDOMElement()
})

it('does not label No. 1 seed elimination as playoff elimination in compact mode', () => {
  const { container } = render(<ClinchBadge markers={{ oneSeed: 'eliminated' }} compact />)
  const text = screen.getByText('Eliminated from the No. 1 seed')
  expect(text).toHaveClass('sr-only')
  expect(text.closest('[title]')).toHaveAttribute('title', `Eliminated from the No. 1 seed. ${CLINCH_TIP}`)
  expect(screen.queryByText('Out')).not.toBeInTheDocument()
  expect(screen.queryByText('Eliminated from the playoffs')).not.toBeInTheDocument()
  expect(container.querySelector('svg')).toHaveClass('text-muted')
  expect(container.querySelector('[tabindex]')).not.toBeInTheDocument()
  expect(container.querySelector('[class*="border"]')).not.toBeInTheDocument()
})

it('preserves full-text badges and suppresses No. 1 seed elimination in clinchTexts', () => {
  const markers = { playoffs: 'clinched', division: 'clinched', oneSeed: 'eliminated' }
  expect(clinchTexts(markers)).toEqual(['Clinched division'])
  render(<ClinchBadge markers={markers} />)
  expect(screen.getByText('Clinched division')).not.toHaveClass('sr-only')
  expect(screen.getByText('Clinched division').closest('[title]')).toHaveAttribute('title', CLINCH_TIP)
})
