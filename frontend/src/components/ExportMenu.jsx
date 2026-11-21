import { useEffect, useRef, useState } from 'react'
import { copyAi, exportCsv, exportExcel } from '../utils/exportTable'
import { copyImage } from '../utils/tableImage'

const titles = {
  XLSX: 'Download every row of the table, in its current sort and columns, as an Excel workbook',
  CSV: 'Download every row of the table, in its current sort and columns, as CSV',
  PNG: 'Copy an image of this table (downloads instead if your browser can\'t copy images)',
  AI: 'Copy this table with column definitions, ready to paste into ChatGPT, Claude or Gemini',
}

export default function ExportMenu({ spec, className = '' }) {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef()
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; clearTimeout(timer.current) }
  }, [])

  const handleClick = async (e, label) => {
    e.preventDefault()
    e.stopPropagation()
    clearTimeout(timer.current)
    setBusy(true)
    let message
    try {
      const result = label === 'PNG' ? copyImage(spec.image ? spec : spec.imageSpec ?? spec) : label === 'AI' ? copyAi(spec) : label === 'XLSX' ? exportExcel(spec) : exportCsv(spec)
      const outcome = await result
      message = outcome === 'toobig' ? 'Too big for an image' : outcome === 'copied' ? 'Copied' : 'Saved'
    } catch {
      message = 'Failed'
    }
    if (!mounted.current) return
    setBusy(false)
    setStatus({ label, message })
    timer.current = setTimeout(() => setStatus(null), 1600)
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {Object.keys(titles).map(label => (
        <button key={label} type="button" disabled={busy} onClick={e => handleClick(e, label)}
          className="px-2 py-1 text-xs text-muted hover:text-ink"
          title={status?.label === label && status.message === 'Too big for an image' ? 'Too big for an image; use CSV/AI for the full data' : titles[label]}>
          {status?.label === label ? status.message : label}
        </button>
      ))}
      <span className="sr-only" aria-live="polite">{status?.message}</span>
    </div>
  )
}
