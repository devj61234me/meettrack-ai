import { ChevronLeft, ChevronRight } from 'lucide-react'
import Button from './Button'

// `data` is the paginated API response: { count, page, page_size, total_pages }
export default function Pagination({ data, onPage }) {
  if (!data || data.count === 0) return null
  const from = (data.page - 1) * data.page_size + 1
  const to = Math.min(data.page * data.page_size, data.count)
  return (
    <nav className="pagination" aria-label="Pagination">
      <span>Showing {from}–{to} of {data.count}</span>
      <span className="spacer" />
      <Button size="sm" variant="secondary" icon={ChevronLeft} disabled={data.page <= 1} onClick={() => onPage(data.page - 1)} aria-label="Previous page">Prev</Button>
      <span aria-current="page">Page {data.page} of {data.total_pages}</span>
      <Button size="sm" variant="secondary" disabled={data.page >= data.total_pages} onClick={() => onPage(data.page + 1)} aria-label="Next page">Next<ChevronRight size={15} /></Button>
    </nav>
  )
}
