import { useState } from 'react'
import InfoTip from './InfoTip'

export function useSorter(initial) {
  const [sort, setSort] = useState(initial)
  const click = key => setSort(s => (s.key === key ? { key, asc: !s.asc } : { key, asc: false }))
  const apply = (rows, getters) => {
    if (!sort.key) return rows
    const get = getters[sort.key]
    return [...rows].sort((a, b) => {
      const av = get(a)
      const bv = get(b)
      if (av == null || bv == null) return av == null ? (bv == null ? 0 : 1) : -1
      if (typeof av === 'string') return sort.asc ? av.localeCompare(bv) : bv.localeCompare(av)
      return sort.asc ? av - bv : bv - av
    })
  }
  return { sort, click, apply }
}

export function SortTh({ tip, sortKey, state, onSort, className = '', children }) {
  return (
    <th
      className={`th cursor-pointer hover:text-ink ${className}`}
      onClick={() => onSort(sortKey)}
      aria-sort={state.key === sortKey ? (state.asc ? 'ascending' : 'descending') : 'none'}
    >
      {/* The button only makes the header focusable; its click bubbles to the th, so the whole cell stays clickable and fires once. */}
      <button type="button" className="uppercase cursor-pointer">
        <InfoTip text={tip}>{children}</InfoTip>
        {state.key === sortKey && (state.asc ? ' ▲' : ' ▼')}
      </button>
    </th>
  )
}
