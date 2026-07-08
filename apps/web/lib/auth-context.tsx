"use client"

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"
import type { AuthUser } from "./auth"
import { fetchCurrentUser, logout as logoutApi } from "./auth"

interface AuthContextValue {
  user: AuthUser | null
  organizationId: string | null
  isLoading: boolean
  isAuthenticated: boolean
  /** 刷新用户信息 */
  refresh: () => Promise<void>
  /** 登出 */
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  organizationId: null,
  isLoading: true,
  isAuthenticated: false,
  refresh: async () => {},
  logout: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const result = await fetchCurrentUser()
      if (result) {
        setUser(result.user)
        setOrganizationId(result.organizationId)
      } else {
        setUser(null)
        setOrganizationId(null)
      }
    } catch {
      setUser(null)
      setOrganizationId(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    await logoutApi()
    setUser(null)
    setOrganizationId(null)
    window.location.href = "/login"
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <AuthContext.Provider
      value={{
        user,
        organizationId,
        isLoading,
        isAuthenticated: !!user,
        refresh,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
