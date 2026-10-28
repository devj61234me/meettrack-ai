import { Compass } from 'lucide-react'
import Button from '../components/Button'
import { EmptyState } from '../components/Feedback'

export default function NotFound() {
  return (
    <div className="card">
      <EmptyState icon={Compass} title="Page not found" action={<Button variant="primary" to="/">Back to dashboard</Button>}>
        The page you are looking for does not exist or was moved.
      </EmptyState>
    </div>
  )
}
