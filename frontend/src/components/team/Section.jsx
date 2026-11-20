export default function Section({ id, kicker, title, summary, actions, className = '', children }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`border-t-2 border-rule pt-3 min-w-0 scroll-mt-28 ${className}`}>
      <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{kicker}</p>
          <h2 id={`${id}-title`} className="font-display font-extrabold uppercase text-2xl leading-none mt-0.5">{title}</h2>
          {summary && <p className="text-sm text-muted mt-1.5 max-w-2xl">{summary}</p>}
        </div>
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

export function Empty({ children }) {
  return <p className="text-sm text-muted border-y border-line py-6 text-center">{children}</p>
}

export const Loading = () => <Empty>Loading…</Empty>
