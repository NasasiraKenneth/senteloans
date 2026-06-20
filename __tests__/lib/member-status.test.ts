import {
  assertMemberActive,
  assertMemberActiveRow,
  assertMemberAndBranchActive,
  getMemberById,
  isMemberRouteDenial,
  mapMemberWriteGateClientMessage,
  memberRouteDenialBody,
  memberRouteHttpStatus,
  memberWriteGateRouteError,
} from "@/lib/members/member-status"
import { SUPER_ADMIN_WRITE_BLOCKED } from "@/lib/api/rbac"

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

  it("memberWriteGateRouteError maps failed gate to route error shape", () => {
    expect(
      memberWriteGateRouteError({
        ok: false,
        error: "member_inactive",
        memberStatus: "Suspended",
      }),
    ).toEqual({
      error: "member_inactive",
      memberStatus: "Suspended",
    })
    expect(memberWriteGateRouteError({ ok: true, member: activeMember })).toBeNull()
  })

  it("memberRouteDenialBody builds API error payload", () => {
    expect(
      memberRouteDenialBody({
        error: "branch_inactive",
        branchStatus: "Closed",
      }),
    ).toEqual({
      error: "branch_inactive",
      code: "branch_inactive",
      branch_status: "Closed",
    })
  })

  it("mapMemberWriteGateClientMessage returns user-facing copy", () => {
    expect(mapMemberWriteGateClientMessage("member_inactive", "uploading KYC documents")).toContain(
      "uploading KYC documents",
    )
  })

  it("memberRouteHttpStatus classifies route-specific error groups", () => {
    expect(
      memberRouteHttpStatus("missing_permission:edit_shares", {
        forbidden: ["missing_permission:edit_shares"],
      }),
    ).toBe(403)
    expect(memberRouteHttpStatus("minimum_shares_2")).toBe(400)
    expect(
      memberRouteHttpStatus(SUPER_ADMIN_WRITE_BLOCKED, {
        forbidden: [SUPER_ADMIN_WRITE_BLOCKED],
      }),
    ).toBe(403)
  })

  it("isMemberRouteDenial narrows route error results", () => {
    expect(isMemberRouteDenial({ error: "member_inactive", memberStatus: "Suspended" })).toBe(true)
    expect(isMemberRouteDenial({ ok: true, docs: {} })).toBe(false)
    expect(isMemberRouteDenial(null)).toBe(false)
  })

  it("memberRouteDenialBody includes detail when provided", () => {
    expect(
      memberRouteDenialBody({
        error: "shares_transaction_failed",
        detail: "db timeout",
      }),
    ).toEqual({
      error: "shares_transaction_failed",
      code: "shares_transaction_failed",
      detail: "db timeout",
    })
  })
})
