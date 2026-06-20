import type { PoolClient } from "pg"
import { auditLogger } from "@/lib/audit/audit-logger"
import type { resolveActorContext } from "@/lib/api/rbac"

export const KYC_REVIEW_DECISIONS = ["approved", "rejected"] as const
export type KycReviewDecision = (typeof KYC_REVIEW_DECISIONS)[number]

export function isKycReviewDecision(value: string): value is KycReviewDecision {
  return (KYC_REVIEW_DECISIONS as readonly string[]).includes(value)
}

export type KycReviewPostCommit = {
  decision: KycReviewDecision
  actorId: string
  institutionId: string
  branchId: string
  institutionName: string
  member: {
    id: string
    full_name: string
    member_number: string
    email: string
  }
  docType: string
  rejectionReason?: string
}

type Actor = NonNullable<Awaited<ReturnType<typeof resolveActorContext>>>

export type KycReviewResult =
  | { ok: true; postCommit: KycReviewPostCommit }
  | { ok: false; error: string; memberStatus?: string; branchStatus?: string }

export async function submitMemberKycReview(
  client: PoolClient,
  params: {
    actor: Actor
    memberId: string
    pendingId: string
    decision: KycReviewDecision
    rejectionReason?: string
    isSystemAdmin: boolean
  },
): Promise<KycReviewResult> {
  const { actor, memberId, pendingId, decision, isSystemAdmin } = params
  const rejectionReason = params.rejectionReason?.trim().slice(0, 500) || ""
  const reviewedAt = new Date().toISOString()
  const docStatus = decision === "approved" ? "verified" : "rejected"
  const memberKycStatus = decision === "approved" ? "Verified" : "Rejected"

  if (decision === "rejected" && !rejectionReason) {
    return { ok: false, error: "rejection_reason_required" }
  }

  const targetMember = await client.query<{
    id: string
    institution_id: string
    branch_id: string
    full_name: string
    member_number: string
    email: string | null
    kyc_status: string
    kyc_approved_by: string | null
    kyc_approved_at: string | null
    modified_by: string | null
  }>(
    `SELECT id, institution_id, branch_id, full_name, member_number, email,
            kyc_status, kyc_approved_by, kyc_approved_at, modified_by
     FROM members WHERE id = $1`,
    [memberId],
  )
  const targetRow = targetMember.rows[0]
  if (!targetRow) return { ok: false, error: "member_not_found" }
  if (!isSystemAdmin && targetRow.institution_id !== actor.institution_id) {
    return { ok: false, error: "forbidden" }
  }

  const pendingRes = await client.query<{
    id: string
    institution_id: string
    member_id: string
    doc_type: string
    status: string
    rejection_reason: string | null
    passport_photo: string | null
    document_front: string | null
    document_back: string | null
  }>(
    `SELECT id, institution_id, member_id, doc_type, status, rejection_reason,
            passport_photo, document_front, document_back
     FROM member_kyc_docs WHERE id = $1`,
    [pendingId],
  )
  const pending = pendingRes.rows[0]
  if (!pending) return { ok: false, error: "pending_not_found" }
  if (pending.member_id !== memberId || (!isSystemAdmin && pending.institution_id !== actor.institution_id)) {
    return { ok: false, error: "forbidden" }
  }
  if (pending.status !== "pending_review") return { ok: false, error: "not_pending" }

  const oldDocValues = {
    status: pending.status,
    rejection_reason: pending.rejection_reason,
    reviewed_by: null as string | null,
    reviewed_at: null as string | null,
  }

  await client.query(
    `UPDATE member_kyc_docs
     SET status = $1,
         rejection_reason = $2,
         reviewed_by = $3,
         reviewed_at = $4,
         updated_at = NOW()
     WHERE id = $5`,
    [
      docStatus,
      decision === "rejected" ? rejectionReason : null,
      actor.id,
      reviewedAt,
      pendingId,
    ],
  )

  await auditLogger.logUpdate(
    "member_kyc_docs",
    pendingId,
    oldDocValues,
    {
      status: docStatus,
      rejection_reason: decision === "rejected" ? rejectionReason : null,
      reviewed_by: actor.id,
      reviewed_at: reviewedAt,
    },
    actor.institution_id,
    actor.id,
    { branch_id: String(actor.branch_id || "") },
    client,
  )

  const oldMemberValues = {
    kyc_status: targetRow.kyc_status,
    kyc_approved_by: targetRow.kyc_approved_by,
    kyc_approved_at: targetRow.kyc_approved_at,
    modified_by: targetRow.modified_by,
  }

  if (decision === "approved") {
    await client.query(
      `UPDATE members
       SET kyc_status = $1,
           kyc_approved_by = $2,
           kyc_approved_at = $3,
           modified_by = $2,
           updated_at = NOW()
       WHERE id = $4`,
      [memberKycStatus, actor.id, reviewedAt, memberId],
    )
  } else {
    await client.query(
      `UPDATE members
       SET kyc_status = $1,
           modified_by = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [memberKycStatus, actor.id, memberId],
    )
  }

  await auditLogger.logUpdate(
    "members",
    memberId,
    oldMemberValues,
    decision === "approved"
      ? {
          kyc_status: memberKycStatus,
          kyc_approved_by: actor.id,
          kyc_approved_at: reviewedAt,
          modified_by: actor.id,
        }
      : {
          kyc_status: memberKycStatus,
          modified_by: actor.id,
        },
    actor.institution_id,
    actor.id,
    { branch_id: String(actor.branch_id || "") },
    client,
  )

  const instRes = await client.query<{ name: string }>(
    `SELECT name FROM institutions WHERE id = $1`,
    [actor.institution_id],
  )

  return {
    ok: true,
    postCommit: {
      decision,
      actorId: actor.id,
      institutionId: actor.institution_id,
      branchId: String(targetRow.branch_id || actor.branch_id || ""),
      institutionName: instRes.rows[0]?.name || "",
      member: {
        id: String(targetRow.id),
        full_name: String(targetRow.full_name || ""),
        member_number: String(targetRow.member_number || ""),
        email: targetRow.email ? String(targetRow.email) : "",
      },
      docType: String(pending.doc_type),
      ...(decision === "rejected" ? { rejectionReason: rejectionReason || "Document did not meet requirements" } : {}),
    },
  }
}
