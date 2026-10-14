/**
 * Client-side staff session cache (localStorage).
 *
 * NextAuth owns the auth cookie/JWT. This module stores a denormalized staff
 * snapshot (profile + institution branding + branch config) for fast UI reads.
 *
 * - In React dashboard code, prefer `useStaffSession()` from
 *   `@/components/staff-session-provider` so the UI stays in sync.
 * - Use `getSession()` for one-off reads in forms, utilities, or legacy pages.
 * - Call `hydrateStaffSession()` (from `@/lib/staff-session-hydration`) after
 *   login or when you need fresh data from the API.
 */

import type { AppSessionUser } from "@/lib/auth"

export const SESSION_STORAGE_KEY = "senteloans_session"

/** Branch config payload from `/api/institution/settings`. */
export type StaffInstitutionConfig = Record<string, unknown>

export type StaffInstitutionSnapshot = {
  id: string
  name: string
  type: string
  logo?: string | null
  config?: StaffInstitutionConfig
}

/**
 * Cached staff session written to localStorage.
 * Fields mirror `AppSessionUser` where applicable.
 */
export type SessionData = {
  /** `users.id` for institution staff */
  userId: string
  /** `app_auth_users.id` */
  authUserId?: string
  email: string
  name: string
  role: string
  type?: AppSessionUser["type"]
  activeRole?: AppSessionUser["activeRole"]
  availableRoles?: AppSessionUser["availableRoles"]
  institutionId?: string
  institution?: StaffInstitutionSnapshot
}

export type AuthSessionSeed = Partial<
  Pick<
    AppSessionUser,
    | "userId"
    | "authUserId"
    | "email"
    | "name"
    | "role"
    | "type"
    | "activeRole"
    | "availableRoles"
    | "institutionId"
  >
>

function isBrowser(): boolean {
  return typeof window !== "undefined"
}

export function getSession(): SessionData | null {
  if (!isBrowser()) return null

  const sessionStr = localStorage.getItem(SESSION_STORAGE_KEY)
  if (!sessionStr) return null

  try {
    return JSON.parse(sessionStr) as SessionData
  } catch {
    return null
  }
}

export function setSession(session: SessionData): void {
  if (!isBrowser()) return
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  if (!isBrowser()) return
  localStorage.removeItem(SESSION_STORAGE_KEY)
}

/** Shallow-merge top-level fields; deep-merge `institution` when both sides exist. */
export function patchSession(partial: Partial<SessionData>): SessionData | null {
  const current = getSession()
  if (!current) return null

  const next: SessionData = { ...current, ...partial }
  if (partial.institution) {
    next.institution = {
      ...(current.institution || { id: "", name: "", type: "" }),
      ...partial.institution,
    }
  }

  setSession(next)
  return next
}

/**
 * Seed localStorage immediately after institution staff login (before navigation).
 * Preserves any institution snapshot already cached from a prior session.
 */
export function mergeSessionFromAuthUser(user: AuthSessionSeed): SessionData {
  const existing = getSession()
  const merged: SessionData = {
    userId: user.userId || existing?.userId || "",
    authUserId: user.authUserId || existing?.authUserId,
    email: user.email || existing?.email || "",
    name: user.name || existing?.name || "",
    role: user.role || existing?.role || "",
    type: user.type || existing?.type,
    activeRole: user.activeRole || existing?.activeRole,
    availableRoles: user.availableRoles || existing?.availableRoles,
    institutionId: user.institutionId || existing?.institutionId,
    institution: existing?.institution,
  }
  setSession(merged)
  return merged
}

export function updateInstitutionConfig(config: StaffInstitutionConfig): SessionData | null {
  const current = getSession()
  if (!current?.institution) return null
  return patchSession({
    institution: { ...current.institution, config },
  })
}

export function updateInstitutionBranding(
  branding: Partial<Pick<StaffInstitutionSnapshot, "name" | "type" | "logo">>,
): SessionData | null {
  const current = getSession()
  if (!current?.institution) return null
  return patchSession({
    institution: { ...current.institution, ...branding },
  })
}

export function getInstitutionConfig(): StaffInstitutionConfig | null {
  return getSession()?.institution?.config ?? null
}

export function getInstitutionCurrency(fallback = "UGX"): string {
  const config = getInstitutionConfig()
  const currency = config?.currency
  return typeof currency === "string" && currency.trim() ? currency : fallback
}
