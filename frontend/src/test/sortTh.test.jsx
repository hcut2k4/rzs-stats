import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SortTh, useSorter } from '../components/SortTh'

function Harness() {
  const { sort, click } = useSorter({ key: 'alpha', asc: false })
  return (
    <table>
      <thead>
        <tr>
          <SortTh tip="First column" sortKey="alpha" state={sort} onSort={click}>Alpha</SortTh>
          <SortTh tip="Second column" sortKey="beta" state={sort} onSort={click}>Beta</SortTh>
        </tr>
      </thead>
    </table>
  )
}

describe('SortTh', () => {
  it('puts every sortable header in the keyboard tab order', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.tab()
    expect(screen.getByRole('button', { name: /Alpha/ })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: /Beta/ })).toHaveFocus()
  })

  it('sorts from the keyboard with Enter and flips direction with Space', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const beta = () => screen.getByRole('columnheader', { name: /Beta/ })

    await user.tab()
    await user.tab()
    await user.keyboard('{Enter}')
    expect(beta()).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByRole('columnheader', { name: /Alpha/ })).toHaveAttribute('aria-sort', 'none')

    await user.keyboard(' ')
    expect(beta()).toHaveAttribute('aria-sort', 'ascending')
  })
})
