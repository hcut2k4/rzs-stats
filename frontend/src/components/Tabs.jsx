export default function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="flex border-b border-line mb-5">
      {tabs.map(t => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            value === t.value ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
