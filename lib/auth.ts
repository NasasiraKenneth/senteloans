/**
 * NextAuth config and session helpers for plain Postgres auth (replaces Supabase Auth).
 */

import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { compare } from "bcryptjs"
import { runWithoutAuth } from "./db"

export interface AppSessionUser {
  authUserId: string
  email: string
  name: string
  role: string
  type: "staff" | "client"
  institutionId?: string
  memberId?: string
  clientId?: string
  userId?: string // users.id for staff
}

declare module "next-auth" {
  interface Session {
    user: AppSessionUser
  }
}

declare module "next-auth/jwt" {
  interface JWT extends AppSessionUser {}
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: { email: { label: "Email" }, password: { label: "Password" } },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase()
        const password = credentials?.password
        if (!email || !password) return null

        const user = await runWithoutAuth(async (client) => {
          const authRes = await client.query<{ id: string; password_hash: string }>(
            `SELECT id, password_hash FROM app_auth_users WHERE email = $1`,
            [email]
          )
          const row = authRes.rows[0]
          if (!row || !(await compare(password, row.password_hash))) return null

          const authUserId = row.id

          const staffRes = await client.query<{ id: string; full_name: string; role: string; institution_id: string }>(
            `SELECT
               u.id,
               u.full_name,
               u.institution_id,
               CASE
                  WHEN r.name = 'System Admin' THEN 'system_admin'
                  WHEN r.name = 'Super Admin' THEN 'super_admin'
                 WHEN r.name = 'Admin' THEN 'institution_admin'
                 WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
                 ELSE NULL
               END AS role
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE u.supabase_user_id = $1 AND u.status = 'Active'`,
            [authUserId]
          )
          const staff = staffRes.rows[0]
          if (staff) {
            return {
              id: authUserId,
              authUserId,
              email,
              name: staff.full_name,
              role: staff.role,
              type: "staff" as const,
              institutionId: staff.institution_id,
              userId: staff.id,
            }
          }

          const clientRes = await client.query<{ id: string; full_name: string }>(
            `SELECT id, full_name FROM members WHERE supabase_user_id = $1 AND status = 'Active'`,
            [authUserId]
          )
          const clientRow = clientRes.rows[0]
          if (clientRow) {
            return {
              id: authUserId,
              authUserId,
              email,
              name: clientRow.full_name,
              role: "client",
              type: "client" as const,
              memberId: clientRow.id,
              clientId: clientRow.id,
            }
          }

          return null
        })

        return user
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.authUserId = user.authUserId
        token.email = user.email
        token.name = user.name
        token.role = user.role
        token.type = user.type
        token.institutionId = user.institutionId
        token.memberId = user.memberId
        token.clientId = user.clientId
        token.userId = user.userId
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
