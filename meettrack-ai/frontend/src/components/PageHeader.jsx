export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-head">
      <div style={{ minWidth: 0 }}>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <span className="spacer" />
      {actions && <div className="row-wrap">{actions}</div>}
    </div>
  )
}
