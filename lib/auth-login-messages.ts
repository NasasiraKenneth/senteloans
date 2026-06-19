/** Client-safe login error messages. */
export const LOGIN_ERROR_MESSAGES = {
  invalidCredentials: "Invalid email or password",
  invalidAccountType: "This account is not authorized for institution access.",
  invalidClientAccountType: "This account is not authorized for client portal access.",
  branchInactive: "Your branch is inactive. Contact your administrator.",
  useClientLogin: "This account uses the client portal. Please sign in at the client login page.",
  useStaffLogin: "Use the staff login for institution access.",
  signInFailed: "Failed to sign in. Please try again.",
} as const

export const LOGIN_SUCCESS_MESSAGES = {
  institution: "Welcome back! Redirecting to your dashboard.",
  client: "Welcome back! Redirecting to your account.",
  admin: "Welcome back! Redirecting to admin portal.",
} as const

export type LoginContext = "institution" | "client"

export function resolveSignInErrorMessage(error: string | undefined): string {
  if (!error || error === "CredentialsSignin") {
    return LOGIN_ERROR_MESSAGES.invalidCredentials
  }
  const known = Object.values(LOGIN_ERROR_MESSAGES) as string[]
  if (known.includes(error)) return error
  return error
}
