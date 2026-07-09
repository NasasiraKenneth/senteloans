import {
  assertActorActive,
  assertActorAndBranchActive,
  assertStaffActive,
  assertStaffActiveRow,
  assertStaffAndBranchActive,
  getStaffById,
} from "@/lib/staff/staff-status"

describe("staff-status", () => {
  const activeStaff = {
    id: "staff-1",
    institution_id: "inst-1",
    branch_id: "branch-1",
    full_name: "Jane Manager",
    email: "jane@example.com",
    status: "Active" as const,
  }

  const mockClient = (row: unknown) => ({
    query: jest.fn().mockResolvedValue({ rows: row ? [row] : [] }),
  })

  it("getStaffById returns not found when missing", async () => {
    const client = mockClient(null) as any
    const res = await getStaffById(client, "staff-1")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("staff_not_found")
  })

  it("assertStaffActiveRow rejects inactive staff", () => {
    const res = assertStaffActiveRow({ ...activeStaff, status: "Suspended" })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe("staff_inactive")
      expect(res.status).toBe("Suspended")
    }
  })

  it("assertStaffActiveRow accepts Active staff", () => {
    const res = assertStaffActiveRow(activeStaff)
    expect(res.ok).toBe(true)
  })

  it("assertStaffActive rejects inactive staff from database", async () => {
    const client = mockClient({ ...activeStaff, status: "Inactive" }) as any
    const res = await assertStaffActive(client, "staff-1")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("staff_inactive")
  })

  it("assertActorActive uses status on actor context without re-querying", async () => {
    const client = { query: jest.fn() } as any
    const res = await assertActorActive(client, {
      id: "staff-1",
      institution_id: "inst-1",
      status: "Active",
    })
    expect(res.ok).toBe(true)
    expect(client.query).not.toHaveBeenCalled()
  })

  it("assertActorActive queries when status is missing on actor", async () => {
    const client = mockClient(activeStaff) as any
    const res = await assertActorActive(client, {
      id: "staff-1",
      institution_id: "inst-1",
    })
    expect(res.ok).toBe(true)
    expect(client.query).toHaveBeenCalledTimes(1)
  })

  it("assertStaffAndBranchActive rejects inactive branch", async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [activeStaff] })
        .mockResolvedValueOnce({
          rows: [{ id: "branch-1", institution_id: "inst-1", name: "HQ", status: "Suspended" }],
        }),
    } as any

    const res = await assertStaffAndBranchActive(client, "staff-1")
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe("branch_inactive")
      expect(res.branchStatus).toBe("Suspended")
    }
  })

  it("assertActorAndBranchActive accepts active actor and branch", async () => {
    const client = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [{ id: "branch-1", institution_id: "inst-1", name: "HQ", status: "Active" }],
      }),
    } as any

    const res = await assertActorAndBranchActive(client, {
      id: "staff-1",
      institution_id: "inst-1",
      branch_id: "branch-1",
      status: "Active",
    })

    expect(res.ok).toBe(true)
    expect(client.query).toHaveBeenCalledTimes(1)
  })
})
