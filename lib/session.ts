export interface SessionData {
  userId: string
  email: string
  name: string
  role: string
  institutionId?: string
  institution?: {
    id: string
    name: string
    type: string
    config: any
  }
}

export const getSession = (): SessionData | null => {
  if (typeof window === "undefined") return null

  const sessionStr = localStorage.getItem("senteloans_session")
  if (!sessionStr) return null

  try {
    return JSON.parse(sessionStr)
  } catch {
    return null
  }
}

export const clearSession = () => {
  if (typeof window !== "undefined") {
    localStorage.removeItem("senteloans_session")
  }
}

export const setSession = (session: SessionData) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("senteloans_session", JSON.stringify(session))
  }
}

export const updateInstitutionConfig = (config: any) => {
  const session = getSession()
  if (session && session.institution) {
    session.institution.config = config
    localStorage.setItem("senteloans_session", JSON.stringify(session))
  }
}
