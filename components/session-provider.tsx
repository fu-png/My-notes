"use client"

import { createContext, useContext } from "react"

interface User {
  id: string
  email: string
  name: string
}

interface SessionContextValue {
  user: User | null
}

const SessionContext = createContext<SessionContextValue>({ user: null })

export function SessionProvider({
  children,
  user,
}: {
  children: React.ReactNode
  user: User | null
}) {
  return (
    <SessionContext.Provider value={{ user }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  return useContext(SessionContext)
}
