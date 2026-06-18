import {
  assertMemberActive,
  assertMemberActiveRow,
  assertMemberAndBranchActive,
  getMemberById,
} from "@/lib/members/member-status"

jest.mock("@/lib/branches/branch-status", () => ({
  assertBranchActive: jest.fn(),
}))

import { assertBranchActive } from "@/lib/branches/branch-status"

const assertBranchActiveMock = assertBranchActive as jest.Mock

const activeMember = {
  id: "m1",
  institution_id: "i1",
  branch_id: "b1",
  full_name: "Jane Doe",
  member_number: "M-001",
  email: "jane@example.com",
  status: "Active" as const,
}

describe("member-status", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    assertBranchActiveMock.mockResolvedValue({
      ok: true,
      branch: { id: "b1", institution_id: "i1", name: "HQ", status: "Active" },
    })
  })

  const mockClient = (row: unknown) => ({
    query: jest.fn().mockResolvedValue({ rows: row ? [row] : [] }),
  })

  it("getMemberById returns not found when missing", async () => {
    const client = mockClient(null) as any
    const res = await getMemberById(client, "m1")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("member_not_found")
  })

  it("getMemberById hides cross-tenant members when institutionId is supplied", async () => {
    const client = mockClient(activeMember) as any
    const res = await getMemberById(client, "m1", "other-inst")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("member_not_found")
  })

  it("assertMemberActiveRow rejects inactive member", () => {
    const res = assertMemberActiveRow({ ...activeMember, status: "Suspended" })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe("member_inactive")
      expect(res.status).toBe("Suspended")
    }
  })

  it("assertMemberActive accepts Active member", async () => {
    const client = mockClient(activeMember) as any
    const res = await assertMemberActive(client, "m1", "i1")
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.member.status).toBe("Active")
  })

  it("assertMemberAndBranchActive rejects inactive branch", async () => {
    const client = mockClient(activeMember) as any
    assertBranchActiveMock.mockResolvedValue({
      ok: false,
      error: "branch_inactive",
      status: "Suspended",
    })
    const res = await assertMemberAndBranchActive(client, "m1", "i1")
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe("branch_inactive")
      expect(res.branchStatus).toBe("Suspended")
    }
  })

  it("assertMemberAndBranchActive accepts active member and branch", async () => {
    const client = mockClient(activeMember) as any
    const res = await assertMemberAndBranchActive(client, "m1", "i1")
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.member.id).toBe("m1")
    expect(assertBranchActiveMock).toHaveBeenCalledWith(client, "b1")
  })
})
