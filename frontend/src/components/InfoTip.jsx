export default function InfoTip({ children, text }) {
  return (
    <span title={text} className="cursor-help border-b border-dotted border-muted">
      {children}
    </span>
  )
}
