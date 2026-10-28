import { useCallback, useEffect, useRef, useState } from 'react'

// Runs an async loader whenever `deps` change and tracks loading / error state.
// Out-of-order responses are ignored so fast typing in filters never shows stale data.
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const counter = useRef(0)

  const run = useCallback(async () => {
    const id = ++counter.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await loader()
      if (id === counter.current) setState({ data, loading: false, error: null })
    } catch (error) {
      if (id === counter.current) setState((s) => ({ data: s.data, loading: false, error }))
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { run() }, [run])
  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) }
}
