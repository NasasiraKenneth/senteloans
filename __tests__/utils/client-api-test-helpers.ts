export const AUTH_USER_ID = "auth-user-123"
export const MEMBER_ID = "client-1"
export const INSTITUTION_ID = "inst-123"
export const BRANCH_ID = "branch-123"

export const clientSession = {
  user: {
    authUserId: AUTH_USER_ID,
    email: "client@example.com",
    name: "John Doe",
    role: "client",
    type: "client" as const,
    institutionId: INSTITUTION_ID,
    memberId: MEMBER_ID,
    clientId: MEMBER_ID,
  },
}

export const defaultMemberRow = {
  id: MEMBER_ID,
  institution_id: INSTITUTION_ID,
  branch_id: BRANCH_ID,
  member_number: "MEM-001",
  full_name: "John Doe",
  phone_number: "+256700000000",
  email: "john@example.com",
  kyc_status: "Verified",
  status: "Active",
  village: "Kampala",
  district: "Kampala",
  occupation: "Teacher",
  next_of_kin_name: "Jane Doe",
  next_of_kin_relationship: "Sister",
  next_of_kin_phone: "+256700000001",
  passport_photo: "https://example.com/photo.jpg",
  national_id_front: "https://example.com/id-front.jpg",
  national_id_back: null,
  join_date: "2024-01-01",
  date_of_birth: "1990-01-01",
  gender: "Male",
  marital_status: "Single",
  monthly_income: 500000,
  mobile_money_provider: "MTN",
  mobile_money_number: "+256700000000",
  bank_name: "Stanbic",
  bank_account_number: "1234567890",
  bank_account_name: "John Doe",
  bank_branch: "Kampala",
  updated_at: "2024-01-01",
}

export function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase()
}

export type PgQueryResult = { rows: Record<string, unknown>[]; rowCount?: number }

export type PgMockOptions = {
  member?: Record<string, unknown> | null
  institution?: Record<string, unknown> | null
  onQuery?: (sql: string, params?: unknown[]) => PgQueryResult | undefined
}

export function createPgMock(options: PgMockOptions = {}) {
  const member =
    options.member !== undefined ? options.member : ({ ...defaultMemberRow } as Record<string, unknown>)
  const institution = options.institution ?? {
    id: INSTITUTION_ID,
    name: "Test SACCO",
    type: "SACCO",
    logo: null,
    status: "Active",
  }

  return {
    query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      const custom = options.onQuery?.(sql, params)
      if (custom) return custom

      const s = normalizeSql(sql)

      if (s.includes("from members where auth_id")) {
        return { rows: member ? [member] : [] }
      }

      if (s.includes("from institutions where id")) {
        return { rows: institution ? [institution] : [] }
      }

      if (s.includes("update members set")) {
        return { rows: [], rowCount: 1 }
      }

      if (s.includes("update notifications")) {
        return { rows: [], rowCount: 1 }
      }

      if (s.includes("update member_kyc_docs")) {
        return { rows: [], rowCount: 1 }
      }

      if (s.includes("update app_auth_users")) {
        return { rows: [], rowCount: 1 }
      }

      if (s.includes("from app_auth_users where id")) {
        return { rows: [{ password_hash: "hashed-old-password" }] }
      }

      return { rows: [] }
    }),
  }
}
