import { useEffect, useState } from 'react'
import { api } from '../services/api'

let cached = null

// Non-secret server settings (is the AI configured? upload limits?). Loaded once and shared.
export function useAppConfig() {
  const [config, setConfig] = useState(cached)
  useEffect(() => {
    if (cached) return
    api.config().then((c) => { cached = c; setConfig(c) }).catch(() => setConfig(null))
  }, [])
  return config
}
