import {
  getSession,
  mergeSessionFromAuthUser,
  patchSession,
  setSession,
  type SessionData,
} from "@/lib/session"
import { isUsableInstitutionLogo } from "@/lib/institution-brand"

type AuthSessionUser = {
  userId?: string
  authUserId?: string
  email?: string
  name?: string
  role?: string
  institutionId?: string
  type?: string
}

function normalizeLogo(logo: unknown): string | null {
  return isUsableInstitutionLogo(logo) ? logo.trim() : null
}

/** Write staff fields from NextAuth immediately after login (before navigation). */
export function seedStaffSessionFromAuthUser(user: AuthSessionUser): SessionData {
  return mergeSessionFromAuthUser({
    ...(user.userId ? { userId: user.userId } : {}),
    ...(user.authUserId ? { authUserId: user.authUserId } : {}),
    ...(user.email ? { email: user.email } : {}),
    ...(user.name ? { name: user.name } : {}),
    ...(user.role ? { role: user.role } : {}),
    ...(user.institutionId ? { institutionId: user.institutionId } : {}),
    ...(user.type === "staff" || user.type === "client" ? { type: user.type } : {}),
  })
}

/** Merge NextAuth staff session + institution APIs into localStorage. */
export async function hydrateStaffSession(): Promise<SessionData | null> {
  const localSession = getSession()

  try {
    const authRes = await fetch("/api/auth/session", { cache: "no-store" })
    if (!authRes.ok) return localSession

    const auth = await authRes.json()
    const user = auth?.user as AuthSessionUser | undefined
    if (!user?.authUserId || user?.type !== "staff") return localSession

    const merged: SessionData = {
      ...(localSession || {
        userId: "",
        email: "",
        name: "",
        role: "",
      }),
      userId: user.userId || localSession?.userId || "",
      authUserId: user.authUserId || localSession?.authUserId,
      email: user.email || localSession?.email || "",
      name: user.name || localSession?.name || "",
      role: user.role || localSession?.role || "",
      type: "staff",
      institutionId: user.institutionId || localSession?.institutionId,
      institution: localSession?.institution,
    }

    // Always refresh branding from DB — cached localStorage may have logo: null from before upload.
    const orgRes = await fetch("/api/institution/organization", { cache: "no-store" })
    if (orgRes.ok) {
      const org = await orgRes.json()
      merged.institutionId = merged.institutionId || org?.id || ""
      merged.institution = {
        id: merged.institution?.id || org?.id || "",
        name: org?.name || merged.institution?.name || "",
        type: org?.type || merged.institution?.type || "",
        logo: normalizeLogo(org?.logo),
        config: merged.institution?.config,
      }
    }

    const instRes = await fetch("/api/institution/settings", { cache: "no-store" })
    if (instRes.ok) {
      const inst = await instRes.json()
      merged.institutionId = merged.institutionId || inst?.id || ""
      merged.institution = {
        id: inst?.id || merged.institution?.id || "",
        name: inst?.name || merged.institution?.name || "",
        type: inst?.type || merged.institution?.type || "",
        logo: normalizeLogo(inst?.logo) ?? merged.institution?.logo ?? null,
        config: inst?.config || merged.institution?.config,
      }
    }

    if (!merged.name || !merged.email) {
      const profRes = await fetch("/api/institution/profile", { cache: "no-store" })
      if (profRes.ok) {
        const prof = await profRes.json()
        merged.email = prof.email || merged.email
        merged.name = prof.name || merged.name
        merged.role = merged.role || prof.role || ""
      }
    }

    setSession(merged)
    return merged
  } catch {
    return localSession
  }
}

/** Update only institution branding in localStorage (e.g. after settings save). */
export function patchStaffInstitutionBranding(
  branding: Partial<{ name: string; type: string; logo: string | null }>,
): SessionData | null {
  const current = getSession()
  if (!current?.institution) return null
  return patchSession({
    institution: {
      ...current.institution,
      ...branding,
      logo: branding.logo !== undefined ? normalizeLogo(branding.logo) : current.institution.logo,
    },
  })
}
