import { assertBranchActive, getBranchById } from "@/lib/branches/branch-status"

describe("branch-status", () => {
  const mockClient = (row: unknown) => ({
    query: jest.fn().mockResolvedValue({ rows: row ? [row] : [] }),
  })

  it("getBranchById returns not found when missing", async () => {
    const client = mockClient(null) as any
    const res = await getBranchById(client, "branch-1")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("branch_not_found")
  })

  it("assertBranchActive rejects inactive branch", async () => {
    const client = mockClient({
      id: "b1",
      institution_id: "i1",
      name: "HQ",
      status: "Suspended",
    }) as any
    const res = await assertBranchActive(client, "b1")
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe("branch_inactive")
      expect(res.status).toBe("Suspended")
    }
  })

  it("assertBranchActive accepts Active branch", async () => {
    const client = mockClient({
      id: "b1",
      institution_id: "i1",
      name: "HQ",
      status: "Active",
    }) as any
    const res = await assertBranchActive(client, "b1")
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.branch.status).toBe("Active")
  })
})
