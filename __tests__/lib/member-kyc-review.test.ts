import {
  isKycReviewDecision,
  submitMemberKycReview,
  type KycReviewDecision,
} from "@/lib/members/kyc-review"

describe("lib/members/kyc-review", () => {
  it("validates review decisions", () => {
    expect(isKycReviewDecision("approved")).toBe(true)
    expect(isKycReviewDecision("rejected")).toBe(true)
    expect(isKycReviewDecision("pending")).toBe(false)
  })

  it("requires rejection reason when decision is rejected", async () => {
    const client = { query: jest.fn() }
    const result = await submitMemberKycReview(client as never, {
      actor: {
        id: "staff-1",
        institution_id: "inst-1",
        branch_id: "branch-1",
        role_id: "role-1",
        role: "manager",
      },
      memberId: "member-1",
      pendingId: "doc-1",
      decision: "rejected",
      rejectionReason: "   ",
      isSystemAdmin: false,
    })
    expect(result).toEqual({ ok: false, error: "rejection_reason_required" })
    expect(client.query).not.toHaveBeenCalled()
  })

  it("updates member_kyc_docs and members when approved", async () => {
    const queries: string[] = []
    const client = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql.replace(/\s+/g, " ").trim().toLowerCase())
        if (sql.toLowerCase().includes("from members where")) {
          return {
            rows: [{
              id: "member-1",
              institution_id: "inst-1",
              branch_id: "branch-1",
              full_name: "Jane Doe",
              member_number: "M001",
              email: "jane@example.com",
              kyc_status: "Pending",
              kyc_approved_by: null,
              kyc_approved_at: null,
              modified_by: null,
            }],
          }
        }
        if (sql.toLowerCase().includes("from member_kyc_docs where")) {
          return {
            rows: [{
              id: "doc-1",
              institution_id: "inst-1",
              member_id: "member-1",
              doc_type: "national_id",
              status: "pending_review",
              rejection_reason: null,
              passport_photo: "https://example.com/photo.jpg",
              document_front: "https://example.com/front.jpg",
              document_back: "https://example.com/back.jpg",
            }],
          }
        }
        if (sql.toLowerCase().includes("from institutions")) {
          return { rows: [{ name: "Test SACCO" }] }
        }
        return { rows: [] }
      }),
    }

    const result = await submitMemberKycReview(client as never, {
      actor: {
        id: "staff-1",
        institution_id: "inst-1",
        branch_id: "branch-1",
        role_id: "role-1",
        role: "manager",
      },
      memberId: "member-1",
      pendingId: "doc-1",
      decision: "approved",
      isSystemAdmin: false,
    })

    expect(result.ok).toBe(true)
    expect(queries.some((q) => q.includes("update member_kyc_docs") && q.includes("status = $1"))).toBe(true)
    expect(queries.some((q) => q.includes("update members") && q.includes("kyc_status = $1"))).toBe(true)
    expect(queries.some((q) => q.includes("kyc_approved_by = $2"))).toBe(true)
  })

  it("updates members kyc_status to Rejected without approval fields", async () => {
    const queries: string[] = []
    const client = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql.replace(/\s+/g, " ").trim().toLowerCase())
        if (sql.toLowerCase().includes("from members where")) {
          return {
            rows: [{
              id: "member-1",
              institution_id: "inst-1",
              branch_id: "branch-1",
              full_name: "Jane Doe",
              member_number: "M001",
              email: "jane@example.com",
              kyc_status: "Pending",
              kyc_approved_by: null,
              kyc_approved_at: null,
              modified_by: null,
            }],
          }
        }
        if (sql.toLowerCase().includes("from member_kyc_docs where")) {
          return {
            rows: [{
              id: "doc-1",
              institution_id: "inst-1",
              member_id: "member-1",
              doc_type: "national_id",
              status: "pending_review",
              rejection_reason: null,
              passport_photo: null,
              document_front: "https://example.com/front.jpg",
              document_back: null,
            }],
          }
        }
        if (sql.toLowerCase().includes("from institutions")) {
          return { rows: [{ name: "Test SACCO" }] }
        }
        return { rows: [] }
      }),
    }

    const result = await submitMemberKycReview(client as never, {
      actor: {
        id: "staff-1",
        institution_id: "inst-1",
        branch_id: "branch-1",
        role_id: "role-1",
        role: "manager",
      },
      memberId: "member-1",
      pendingId: "doc-1",
      decision: "rejected",
      rejectionReason: "Blurry photo",
      isSystemAdmin: false,
    })

    expect(result.ok).toBe(true)
    expect(queries.some((q) => q.includes("update member_kyc_docs") && q.includes("rejection_reason = $2"))).toBe(true)
    const memberUpdate = queries.find((q) => q.includes("update members") && q.includes("kyc_status = $1"))
    expect(memberUpdate).toBeTruthy()
    expect(memberUpdate).not.toContain("kyc_approved_by")
  })
})
