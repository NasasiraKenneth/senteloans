import type { PoolClient } from "pg"

export const KYC_DOC_TYPES = ["national_id", "passport", "driving_license"] as const
export type KycDocType = (typeof KYC_DOC_TYPES)[number]

/** Legacy per-file upload keys still used by dashboard and client portal UIs. */
export const LEGACY_KYC_FIELDS = ["passport_photo", "national_id_front", "national_id_back"] as const
export type LegacyKycField = (typeof LEGACY_KYC_FIELDS)[number]

export type KycDocColumn = "passport_photo" | "document_front" | "document_back"

export type MemberKycFlatUrls = {
  passport_photo: string | null
  national_id_front: string | null
  national_id_back: string | null
}

export type MemberKycDocRow = {
  id: string
  doc_type: string
  passport_photo: string | null
  document_front: string | null
  document_back: string | null
  status: string
  rejection_reason?: string | null
  created_at?: string
  reviewed_at?: string | null
}

export function isLegacyKycField(value: string): value is LegacyKycField {
  return (LEGACY_KYC_FIELDS as readonly string[]).includes(value)
}

export function legacyFieldToTarget(field: LegacyKycField): { docType: KycDocType; column: KycDocColumn } {
  switch (field) {
    case "passport_photo":
      return { docType: "passport", column: "passport_photo" }
    case "national_id_front":
      return { docType: "national_id", column: "document_front" }
    case "national_id_back":
      return { docType: "national_id", column: "document_back" }
  }
}

export function pickKycDisplayUrl(row: Pick<MemberKycDocRow, "passport_photo" | "document_front" | "document_back">): string | null {
  return row.passport_photo || row.document_front || row.document_back || null
}

export function flattenVerifiedKycDocs(rows: MemberKycDocRow[]): MemberKycFlatUrls {
  const flat: MemberKycFlatUrls = {
    passport_photo: null,
    national_id_front: null,
    national_id_back: null,
  }

  for (const row of rows) {
    if (row.status !== "verified") continue
    if (row.doc_type === "passport" && row.passport_photo && !flat.passport_photo) {
      flat.passport_photo = row.passport_photo
    }
    if (row.doc_type === "national_id") {
      if (row.document_front && !flat.national_id_front) flat.national_id_front = row.document_front
      if (row.document_back && !flat.national_id_back) flat.national_id_back = row.document_back
    }
  }

  return flat
}

export async function fetchMemberKycFlatUrls(client: PoolClient, memberId: string): Promise<MemberKycFlatUrls> {
  const res = await client.query<MemberKycDocRow>(
    `SELECT doc_type, passport_photo, document_front, document_back, status
     FROM member_kyc_docs
     WHERE member_id = $1 AND status = 'verified'
     ORDER BY reviewed_at DESC NULLS LAST, created_at DESC`,
    [memberId],
  )
  return flattenVerifiedKycDocs(res.rows)
}

async function findOpenKycDocRow(
  client: PoolClient,
  memberId: string,
  docType: KycDocType,
  status: "pending_review" | "verified",
): Promise<{ id: string } | null> {
  const res = await client.query<{ id: string }>(
    `SELECT id
     FROM member_kyc_docs
     WHERE member_id = $1 AND doc_type = $2 AND status = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [memberId, docType, status],
  )
  return res.rows[0] || null
}

export async function upsertKycDocField(
  client: PoolClient,
  params: {
    memberId: string
    institutionId: string
    branchId: string
    field: LegacyKycField
    url: string
    status: "pending_review" | "verified"
    reviewedBy?: string | null
  },
): Promise<{ docType: KycDocType; legacyField: LegacyKycField; docId: string }> {
  const { docType, column } = legacyFieldToTarget(params.field)
  const reviewedAt = params.status === "verified" ? new Date().toISOString() : null

  const existing =
    params.status === "verified"
      ? await findOpenKycDocRow(client, params.memberId, docType, "verified")
      : await findOpenKycDocRow(client, params.memberId, docType, "pending_review")

  if (existing) {
    const updateRes = await client.query<{ id: string }>(
      `UPDATE member_kyc_docs
       SET ${column} = $1,
           status = $2,
           reviewed_by = $3,
           reviewed_at = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING id`,
      [params.url, params.status, params.reviewedBy || null, reviewedAt, existing.id],
    )
    return { docType, legacyField: params.field, docId: updateRes.rows[0].id }
  }

  if (params.status === "verified") {
    await client.query(
      `UPDATE member_kyc_docs
       SET status = 'superseded', updated_at = NOW()
       WHERE member_id = $1 AND doc_type = $2 AND status = 'verified'`,
      [params.memberId, docType],
    )
  }

  const insertRes = await client.query<{ id: string }>(
    `INSERT INTO member_kyc_docs (
       institution_id, branch_id, member_id, doc_type,
       passport_photo, document_front, document_back,
       status, reviewed_by, reviewed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      params.institutionId,
      params.branchId,
      params.memberId,
      docType,
      column === "passport_photo" ? params.url : null,
      column === "document_front" ? params.url : null,
      column === "document_back" ? params.url : null,
      params.status,
      params.reviewedBy || null,
      reviewedAt,
    ],
  )

  return { docType, legacyField: params.field, docId: insertRes.rows[0].id }
}

export function mapPendingKycRows(rows: MemberKycDocRow[]) {
  return rows.map((row) => ({
    pendingId: row.id,
    docType: row.doc_type,
    url: pickKycDisplayUrl(row),
    passportPhoto: row.passport_photo,
    documentFront: row.document_front,
    documentBack: row.document_back,
    submittedAt: row.created_at,
    rejectionReason: row.rejection_reason ?? null,
  }))
}

type LegacyDocState = {
  current_verified: { url: string; verified_at: string } | null
  pending: { id: string; url: string; submitted_at: string } | null
  last_rejection: { reason: string | null; date: string } | null
}

export function buildLegacyClientKycDocs(rows: MemberKycDocRow[]): Record<LegacyKycField, LegacyDocState> {
  const result: Record<LegacyKycField, LegacyDocState> = {
    passport_photo: { current_verified: null, pending: null, last_rejection: null },
    national_id_front: { current_verified: null, pending: null, last_rejection: null },
    national_id_back: { current_verified: null, pending: null, last_rejection: null },
  }

  for (const field of LEGACY_KYC_FIELDS) {
    const { docType, column } = legacyFieldToTarget(field)
    const byType = rows.filter((row) => row.doc_type === docType)
    const urlFrom = (row: MemberKycDocRow) => {
      if (column === "passport_photo") return row.passport_photo
      if (column === "document_front") return row.document_front
      return row.document_back
    }

    const verified = byType.find((row) => row.status === "verified" && urlFrom(row))
    if (verified) {
      const url = urlFrom(verified)!
      result[field].current_verified = {
        url,
        verified_at: verified.reviewed_at || verified.created_at || new Date().toISOString(),
      }
    }

    const pending = byType.find((row) => row.status === "pending_review" && urlFrom(row))
    if (pending) {
      result[field].pending = {
        id: pending.id,
        url: urlFrom(pending)!,
        submitted_at: pending.created_at || new Date().toISOString(),
      }
    }

    const rejected = byType.find((row) => row.status === "rejected" && urlFrom(row))
    if (rejected) {
      result[field].last_rejection = {
        reason: rejected.rejection_reason ?? null,
        date: rejected.reviewed_at || rejected.created_at || new Date().toISOString(),
      }
    }
  }

  return result
}
