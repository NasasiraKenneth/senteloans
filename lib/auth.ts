/**
 * NextAuth config and session helpers for plain Postgres auth (replaces Supabase Auth).
 */

import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { AuthLoginError, authenticateCredentials } from "./auth-credentials"
import type { LoginContext } from "./auth-login-messages"

export interface AppSessionUser {
  id: string
  authUserId: string
  email: string
  name: string
  role: string
  type: "staff" | "client"
  activeRole?: "staff" | "client" | "system_admin"
  availableRoles?: Array<"staff" | "client" | "system_admin">
  institutionId?: string
  memberId?: string
  clientId?: string
  userId?: string // users.id for staff
}

declare module "next-auth" {
  interface Session {
    user: AppSessionUser
  }
  interface User extends AppSessionUser {}
}

declare module "next-auth/jwt" {
  interface JWT extends AppSessionUser {}
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email" },
        password: { label: "Password" },
        loginContext: { label: "Login Context", type: "text" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase()
        const password = credentials?.password
        if (!email || !password) return null

        const rawContext = credentials?.loginContext
        const loginContext: LoginContext | "admin" | undefined =
          rawContext === "institution" || rawContext === "client" || rawContext === "admin"
            ? rawContext
            : undefined

        try {
          return await authenticateCredentials(email, password, loginContext)
        } catch (err) {
          if (err instanceof AuthLoginError) throw err
          return null
        }
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 60 }, // 30 minutes
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.authUserId = user.authUserId ?? user.id
        token.email = user.email
        token.name = user.name
        token.role = user.role
        token.type = user.type
        token.activeRole = user.activeRole ?? (user.type === "client" ? "client" : "staff")
        token.availableRoles = user.availableRoles ?? [user.type === "client" ? "client" : "staff"]
        token.institutionId = user.institutionId
        token.memberId = user.memberId
        token.clientId = user.clientId
        token.userId = user.userId
      }

      // Dynamic workspace/role switching via useSession().update({ activeRole: "client" | "staff" | "system_admin" })
      if (trigger === "update" && session) {
        const newActiveRole = session.activeRole as "staff" | "client" | "system_admin" | undefined
        const roles = Array.isArray(token.availableRoles) ? (token.availableRoles as string[]) : []

        if (newActiveRole && roles.includes(newActiveRole)) {
          token.activeRole = newActiveRole
          token.type = newActiveRole === "client" ? "client" : "staff"
          if (newActiveRole === "client") {
            token.role = "client"
          } else if (newActiveRole === "system_admin") {
            token.role = "system_admin"
          }
        }
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.authUserId = token.authUserId
        session.user.email = token.email ?? ""
        session.user.name = token.name ?? ""
        session.user.role = token.role ?? ""
        session.user.type = token.type ?? "staff"
        session.user.activeRole = (token.activeRole as "staff" | "client" | "system_admin") ?? token.type ?? "staff"
        session.user.availableRoles = (token.availableRoles as Array<"staff" | "client" | "system_admin">) ?? [session.user.type]
        session.user.institutionId = token.institutionId
        session.user.memberId = token.memberId
        session.user.clientId = token.clientId
        session.user.userId = token.userId
      }
      return session
    },
  },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
}
