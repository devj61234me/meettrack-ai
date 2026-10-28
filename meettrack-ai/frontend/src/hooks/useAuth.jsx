import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(tokenStore.get()))

  // Restore the session when the app opens.
  useEffect(() => {
    if (!tokenStore.get()) return
    api.auth.me().then(setUser).catch(() => tokenStore.clear()).finally(() => setLoading(false))
  }, [])

  // Any 401 from the API signs the user out everywhere in the UI.
  useEffect(() => { setUnauthorizedHandler(() => setUser(null)) }, [])

  const login = useCallback(async (email, password) => {
    const data = await api.auth.login({ email, password })
    tokenStore.set(data.token)
    setUser(data.user)
  }, [])

  const register = useCallback(async (payload) => {
    const data = await api.auth.register(payload)
    tokenStore.set(data.token)
    setUser(data.user)
  }, [])

  const logout = useCallback(async () => {
    try { await api.auth.logout() } catch { /* token may already be invalid */ }
    tokenStore.clear()
    setUser(null)
  }, [])

  const clearSession = useCallback(() => { tokenStore.clear(); setUser(null) }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, logout, setUser, clearSession }),
    [user, loading, login, register, logout, clearSession],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
