import {
  assertSavingsAccountActive,
  assertSavingsAccountActiveRow,
  assertSavingsAccountAndBranchActive,
  getSavingsAccountById,
} from "@/lib/savings/savings-account-status"

describe("savings-account-status", () => {
  const activeAccount = {
    id: "sav-1",
    institution_id: "inst-1",
    branch_id: "branch-1",
    member_id: "member-1",
    account_number: "SAV-001",
    status: "Active" as const,
  }

  const mockClient = (row: unknown) => ({
    query: jest.fn().mockResolvedValue({ rows: row ? [row] : [] }),
  })

  it("getSavingsAccountById returns not found when missing", async () => {
    const client = mockClient(null) as any
    const res = await getSavingsAccountById(client, "sav-1")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("savings_account_not_found")
  })

  it("getSavingsAccountById scopes by institution when provided", async () => {
    const client = mockClient({ ...activeAccount, institution_id: "other-inst" }) as any
    const res = await getSavingsAccountById(client, "sav-1", "inst-1")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("savings_account_not_found")
  })

  it("assertSavingsAccountActiveRow rejects inactive account", () => {
    const res = assertSavingsAccountActiveRow({ ...activeAccount, status: "Closed" })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe("savings_account_inactive")
      expect(res.status).toBe("Closed")
    }
  })

  it("assertSavingsAccountActiveRow accepts Active account", () => {
    const res = assertSavingsAccountActiveRow(activeAccount)
    expect(res.ok).toBe(true)
  })

  it("assertSavingsAccountActive rejects inactive account from database", async () => {
    const client = mockClient({ ...activeAccount, status: "Suspended" }) as any
    const res = await assertSavingsAccountActive(client, "sav-1")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("savings_account_inactive")
  })

  it("assertSavingsAccountAndBranchActive rejects inactive branch", async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [activeAccount] })
        .mockResolvedValueOnce({
          rows: [{ id: "branch-1", institution_id: "inst-1", name: "HQ", status: "Inactive" }],
        }),
    } as any

    const res = await assertSavingsAccountAndBranchActive(client, "sav-1")
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe("branch_inactive")
      expect(res.branchStatus).toBe("Inactive")
    }
  })

  it("assertSavingsAccountAndBranchActive accepts active account and branch", async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [activeAccount] })
        .mockResolvedValueOnce({
          rows: [{ id: "branch-1", institution_id: "inst-1", name: "HQ", status: "Active" }],
        }),
    } as any

    const res = await assertSavingsAccountAndBranchActive(client, "sav-1")
    expect(res.ok).toBe(true)
  })
})
