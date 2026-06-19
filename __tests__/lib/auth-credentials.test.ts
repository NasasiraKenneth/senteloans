import { compare } from "bcryptjs"
import { AUTH_USER_TYPE_INSTITUTION_STAFF, AUTH_USER_TYPE_MEMBER } from "@/lib/auth-users"
import { LOGIN_ERROR_MESSAGES } from "@/lib/auth-login-messages"
import { AuthLoginError, authenticateCredentials } from "@/lib/auth-credentials"
import { runWithoutAuth } from "@/lib/db"

jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
}))

jest.mock("@/lib/db", () => ({
  runWithoutAuth: jest.fn(),
}))

const mockCompare = compare as jest.MockedFunction<typeof compare>
const mockRunWithoutAuth = runWithoutAuth as jest.MockedFunction<typeof runWithoutAuth>

function createClientMock(sequence: Array<{ rows: unknown[]; rowCount?: number }>) {
  const query = jest.fn()
  for (const result of sequence) {
    query.mockResolvedValueOnce({
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
    })
  }
  return { query }
}

describe("authenticateCredentials", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCompare.mockResolvedValue(true as never)
    mockRunWithoutAuth.mockImplementation(async (fn) => fn(createClientMock([]) as never))
  })

  it("rejects institution login when auth user_type is not institution_staff", async () => {
    mockRunWithoutAuth.mockImplementation(async (fn) => {
      const client = createClientMock([
        {
          rows: [
            {
              id: "auth-1",
              password_hash: "hash",
              user_type: AUTH_USER_TYPE_MEMBER,
            },
          ],
        },
        {
          rows: [
            {
              id: "user-1",
              full_name: "Staff User",
              institution_id: "inst-1",
              branch_status: "Active",
              role: "institution_admin",
            },
          ],
        },
      ])
      return fn(client as never)
    })

    await expect(
      authenticateCredentials("staff@example.com", "password123", "institution"),
    ).rejects.toThrow(new AuthLoginError(LOGIN_ERROR_MESSAGES.invalidAccountType))
  })

  it("rejects institution login when staff branch is inactive", async () => {
    mockRunWithoutAuth.mockImplementation(async (fn) => {
      const client = createClientMock([
        {
          rows: [
            {
              id: "auth-1",
              password_hash: "hash",
              user_type: AUTH_USER_TYPE_INSTITUTION_STAFF,
            },
          ],
        },
        {
          rows: [
            {
              id: "user-1",
              full_name: "Staff User",
              institution_id: "inst-1",
              branch_status: "Inactive",
              role: "institution_admin",
            },
          ],
        },
      ])
      return fn(client as never)
    })

    await expect(
      authenticateCredentials("staff@example.com", "password123", "institution"),
    ).rejects.toThrow(new AuthLoginError(LOGIN_ERROR_MESSAGES.branchInactive))
  })

  it("allows institution login for active staff with institution_staff user_type", async () => {
    mockRunWithoutAuth.mockImplementation(async (fn) => {
      const client = createClientMock([
        {
          rows: [
            {
              id: "auth-1",
              password_hash: "hash",
              user_type: AUTH_USER_TYPE_INSTITUTION_STAFF,
            },
          ],
        },
        {
          rows: [
            {
              id: "user-1",
              full_name: "Staff User",
              institution_id: "inst-1",
              branch_status: "Active",
              role: "institution_admin",
            },
          ],
        },
        { rows: [], rowCount: 1 },
      ])
      return fn(client as never)
    })

    const user = await authenticateCredentials("staff@example.com", "password123", "institution")

    expect(user).toMatchObject({
      type: "staff",
      authUserId: "auth-1",
      userId: "user-1",
      institutionId: "inst-1",
      role: "institution_admin",
    })
    expect(mockRunWithoutAuth).toHaveBeenCalled()
  })

  it("updates users.last_login on successful staff login", async () => {
    mockRunWithoutAuth.mockImplementation(async (fn) => {
      const client = createClientMock([
        {
          rows: [
            {
              id: "auth-1",
              password_hash: "hash",
              user_type: AUTH_USER_TYPE_INSTITUTION_STAFF,
            },
          ],
        },
        {
          rows: [
            {
              id: "user-1",
              full_name: "Staff User",
              institution_id: "inst-1",
              branch_status: "Active",
              role: "institution_admin",
            },
          ],
        },
        { rows: [], rowCount: 1 },
      ])
      await fn(client as never)
      expect(client.query).toHaveBeenCalledTimes(3)
      expect(client.query.mock.calls[2][0]).toContain("UPDATE users SET last_login")
      expect(client.query.mock.calls[2][0]).toContain("updated_at")
      expect(client.query.mock.calls[2][1]).toEqual(["user-1"])
    })

    await authenticateCredentials("staff@example.com", "password123", "institution")
  })

  it("rejects institution login for member accounts", async () => {
    mockRunWithoutAuth.mockImplementation(async (fn) => {
      const client = createClientMock([
        {
          rows: [
            {
              id: "auth-1",
              password_hash: "hash",
              user_type: AUTH_USER_TYPE_MEMBER,
            },
          ],
        },
        { rows: [] },
        {
          rows: [{ id: "member-1", full_name: "Member User", branch_status: "Active" }],
        },
      ])
      return fn(client as never)
    })

    await expect(
      authenticateCredentials("member@example.com", "password123", "institution"),
    ).rejects.toThrow(new AuthLoginError(LOGIN_ERROR_MESSAGES.useClientLogin))
  })

  it("rejects client login when auth user_type is not member", async () => {
    mockRunWithoutAuth.mockImplementation(async (fn) => {
      const client = createClientMock([
        {
          rows: [
            {
              id: "auth-1",
              password_hash: "hash",
              user_type: AUTH_USER_TYPE_INSTITUTION_STAFF,
            },
          ],
        },
        { rows: [] },
        {
          rows: [{ id: "member-1", full_name: "Member User", branch_status: "Active" }],
        },
      ])
      return fn(client as never)
    })

    await expect(
      authenticateCredentials("member@example.com", "password123", "client"),
    ).rejects.toThrow(new AuthLoginError(LOGIN_ERROR_MESSAGES.invalidClientAccountType))
  })

  it("rejects client login when member branch is inactive", async () => {
    mockRunWithoutAuth.mockImplementation(async (fn) => {
      const client = createClientMock([
        {
          rows: [
            {
              id: "auth-1",
              password_hash: "hash",
              user_type: AUTH_USER_TYPE_MEMBER,
            },
          ],
        },
        { rows: [] },
        {
          rows: [{ id: "member-1", full_name: "Member User", branch_status: "Suspended" }],
        },
      ])
      return fn(client as never)
    })

    await expect(
      authenticateCredentials("member@example.com", "password123", "client"),
    ).rejects.toThrow(new AuthLoginError(LOGIN_ERROR_MESSAGES.branchInactive))
  })

  it("allows client login for active member with member user_type", async () => {
    mockRunWithoutAuth.mockImplementation(async (fn) => {
      const client = createClientMock([
        {
          rows: [
            {
              id: "auth-1",
              password_hash: "hash",
              user_type: AUTH_USER_TYPE_MEMBER,
            },
          ],
        },
        { rows: [] },
        {
          rows: [{ id: "member-1", full_name: "Member User", branch_status: "Active" }],
        },
      ])
      return fn(client as never)
    })

    const user = await authenticateCredentials("member@example.com", "password123", "client")

    expect(user).toMatchObject({
      type: "client",
      authUserId: "auth-1",
      memberId: "member-1",
      clientId: "member-1",
    })
  })
})
