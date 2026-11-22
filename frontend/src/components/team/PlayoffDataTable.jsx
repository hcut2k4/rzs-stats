import { SortTh, useSorter } from '../SortTh'
import ExportMenu from '../ExportMenu'

export default function PlayoffDataTable({ title, spec, initial }) {
  const sorter = useSorter(initial ?? { key: null, asc: true })
  const rows = sorter.apply(spec.rows, Object.fromEntries(spec.cols.map(c => [c.label, c.sort ?? c.value ?? c.text])))
  return <div className="min-w-0">
    <div className="flex justify-end mb-2"><ExportMenu spec={{ ...spec, rows }} /></div>
    <div className="overflow-x-auto border-y border-rule whitespace-nowrap"><table className="w-full text-sm num" aria-label={title}>
      <thead><tr className="border-b border-rule">{spec.cols.map(c => <SortTh key={c.label} sortKey={c.label} tip={c.desc} state={sorter.sort} onSort={sorter.click} className={c.value ? 'text-right' : 'text-left'}>{c.label}</SortTh>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className={`border-t border-line ${i % 2 ? 'bg-surface' : 'bg-bg'}`}>
        {spec.cols.map(c => <td key={c.label} className={`px-3 py-1.5 ${c.value ? 'num text-right' : 'text-left'}`} style={{ background: c.color?.(r) }}>{c.render ? c.render(r) : c.text(r)}</td>)}
      </tr>)}</tbody>
    </table></div>
  </div>
}
