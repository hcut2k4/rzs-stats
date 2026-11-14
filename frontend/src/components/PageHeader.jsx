export default function PageHeader({ title, qualifier, takeaway, children }) {
  return (
    <div className="mb-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-extrabold uppercase tracking-tight text-3xl sm:text-4xl leading-none">{title}</h1>
          {qualifier && <p className="text-sm text-muted mt-1">{qualifier}</p>}
        </div>
        {children && <div className="flex items-center gap-3 flex-wrap">{children}</div>}
      </div>
      {takeaway && <p className="text-sm mt-2 max-w-3xl">{takeaway}</p>}
      <div className="border-b-2 border-rule mt-3" />
    </div>
  )
}
