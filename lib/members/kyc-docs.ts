import type { PoolClient } from "pg"

export const KYC_DOC_TYPES = ["national_id", "passport", "driving_license"] as const
export type KycDocType = (typeof KYC_DOC_TYPES)[number]

/** Legacy per-file upload keys still used by dashboard and client portal UIs. */
export const LEGACY_KYC_FIELDS = ["passport_photo", "national_id_front", "national_id_back"] as const
export type LegacyKycField = (typeof LEGACY_KYC_FIELDS)[number]

/** All upload keys accepted by staff/client KYC upload APIs. */
export const KYC_UPLOAD_FIELDS = [
  ...LEGACY_KYC_FIELDS,
  "passport_document_front",
  "driving_license_front",
  "driving_license_back",
] as const
export type KycUploadField = (typeof KYC_UPLOAD_FIELDS)[number]

export type KycDocColumn = "passport_photo" | "document_front" | "document_back"

export type MemberKycFlatUrls = {
  passport_photo: string | null
  national_id_front: string | null
  national_id_back: string | null
}

export type MemberKycFormDocs = {
  passportPhoto: string | null
  passportBiodataPage: string | null
  nationalIdFront: string | null
  nationalIdBack: string | null
  drivingLicenseFront: string | null
  drivingLicenseBack: string | null
}

export type KycFieldUpload = {
  field: KycUploadField
  url: string
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

export function isKycUploadField(value: string): value is KycUploadField {
  return (KYC_UPLOAD_FIELDS as readonly string[]).includes(value)
}

export function uploadFieldToTarget(field: KycUploadField): { docType: KycDocType; column: KycDocColumn } {
  switch (field) {
    case "passport_photo":
      return { docType: "passport", column: "passport_photo" }
    case "passport_document_front":
      return { docType: "passport", column: "document_front" }
    case "national_id_front":
      return { docType: "national_id", column: "document_front" }
    case "national_id_back":
      return { docType: "national_id", column: "document_back" }
    case "driving_license_front":
      return { docType: "driving_license", column: "document_front" }
    case "driving_license_back":
      return { docType: "driving_license", column: "document_back" }
  }
}

export function legacyFieldToTarget(field: LegacyKycField): { docType: KycDocType; column: KycDocColumn } {
  return uploadFieldToTarget(field)
}

export function inferDocTypeFromUploads(uploads: KycFieldUpload[]): KycDocType {
  for (const upload of uploads) {
    if (upload.field !== "passport_photo") {
      return uploadFieldToTarget(upload.field).docType
    }
  }
  return "passport"
}

export function pickKycDisplayUrl(row: Pick<MemberKycDocRow, "passport_photo" | "document_front" | "document_back">): string | null {
  return row.passport_photo || row.document_front || row.document_back || null
}

type KycDocSetRow = Pick<MemberKycDocRow, "doc_type" | "passport_photo" | "document_front" | "document_back">

/** True when every required file for the member's selected doc type is present. */
export function isMemberKycDocSetComplete(row: KycDocSetRow): boolean {
  if (!row.passport_photo?.trim()) return false
  switch (row.doc_type) {
    case "passport":
      return Boolean(row.document_front?.trim())
    case "national_id":
    case "driving_license":
      return Boolean(row.document_front?.trim() && row.document_back?.trim())
    default:
      return Boolean(row.document_front?.trim() && row.document_back?.trim())
  }
}

function verifiedKycRow(rows: MemberKycDocRow[]): MemberKycDocRow | null {
  return rows.find((row) => row.status === "verified") || null
}

/** Staff UI: show verified or in-review docs (not rejected-only rows). */
function staffDisplayKycRow(rows: MemberKycDocRow[]): MemberKycDocRow | null {
  return rows.find((row) => row.status === "verified" || row.status === "pending_review") || null
}

function flattenFormDocsFromRow(row: MemberKycDocRow | null): MemberKycFormDocs {
  const flat: MemberKycFormDocs = {
    passportPhoto: null,
    passportBiodataPage: null,
    nationalIdFront: null,
    nationalIdBack: null,
    drivingLicenseFront: null,
    drivingLicenseBack: null,
  }
  if (!row) return flat

  if (row.passport_photo) flat.passportPhoto = row.passport_photo
  if (row.doc_type === "passport" && row.document_front) {
    flat.passportBiodataPage = row.document_front
  }
  if (row.doc_type === "national_id") {
    if (row.document_front) flat.nationalIdFront = row.document_front
    if (row.document_back) flat.nationalIdBack = row.document_back
  }
  if (row.doc_type === "driving_license") {
    if (row.document_front) flat.drivingLicenseFront = row.document_front
    if (row.document_back) flat.drivingLicenseBack = row.document_back
  }
  return flat
}

function flattenFlatUrlsFromRow(row: MemberKycDocRow | null): MemberKycFlatUrls {
  const flat: MemberKycFlatUrls = {
    passport_photo: null,
    national_id_front: null,
    national_id_back: null,
  }
  if (!row) return flat

  if (row.passport_photo) flat.passport_photo = row.passport_photo
  if (row.doc_type === "national_id") {
    if (row.document_front) flat.national_id_front = row.document_front
    if (row.document_back) flat.national_id_back = row.document_back
  }
  return flat
}

export type MemberKycSnapshot = {
  docType: KycDocType | null
  docStatus: string | null
  docComplete: boolean
  formDocs: MemberKycFormDocs
  flatUrls: MemberKycFlatUrls
}

export function buildMemberKycSnapshot(rows: MemberKycDocRow[], mode: "verified" | "staff"): MemberKycSnapshot {
  const row = mode === "staff" ? staffDisplayKycRow(rows) : verifiedKycRow(rows)
  const docType = row?.doc_type && (KYC_DOC_TYPES as readonly string[]).includes(row.doc_type)
    ? (row.doc_type as KycDocType)
    : null
  return {
    docType,
    docStatus: row?.status ?? null,
    docComplete: row ? isMemberKycDocSetComplete(row) : false,
    formDocs: flattenFormDocsFromRow(row),
    flatUrls: flattenFlatUrlsFromRow(row),
  }
}

/** Hint text for onboarding / upload UI based on selected doc type. */
export function kycUploadHint(docType: KycDocType | null): string {
  switch (docType) {
    case "passport":
      return "Passport photo and biodata page"
    case "driving_license":
      return "Passport photo, driving license front & back"
    case "national_id":
      return "Passport photo, National ID front & back"
    default:
      return "Passport photo plus ID documents for the selected type"
  }
}

/** Onboarding checklist: uploaded complete set or member KYC already verified. */
export function isMemberKycOnboardingComplete(
  snapshot: Pick<MemberKycSnapshot, "docComplete" | "docStatus">,
  memberKycStatus?: string | null,
): boolean {
  if (memberKycStatus === "Verified") return true
  if (snapshot.docStatus === "rejected") return false
  return snapshot.docComplete
}

export type KycDocumentSlot = {
  key: string
  label: string
  src: string | null
  width: number
  height: number
  wide?: boolean
}

/** Document slots for the member detail Documents tab. */
export function buildMemberKycDocumentSlots(
  formDocs: MemberKycFormDocs,
  docType: KycDocType | null,
): KycDocumentSlot[] {
  const slots: KycDocumentSlot[] = [
    {
      key: "passport_photo",
      label: "Passport Photo",
      src: formDocs.passportPhoto,
      width: 300,
      height: 375,
      wide: true,
    },
  ]

  const effectiveType = docType ?? "national_id"
  switch (effectiveType) {
    case "passport":
      slots.push({
        key: "passport_biodata",
        label: "Passport (Biodata)",
        src: formDocs.passportBiodataPage,
        width: 400,
        height: 240,
        wide: true,
      })
      break
    case "driving_license":
      slots.push(
        {
          key: "dl_front",
          label: "Driving License (Front)",
          src: formDocs.drivingLicenseFront,
          width: 400,
          height: 240,
          wide: true,
        },
        {
          key: "dl_back",
          label: "Driving License (Back)",
          src: formDocs.drivingLicenseBack,
          width: 400,
          height: 240,
          wide: true,
        },
      )
      break
    case "national_id":
    default:
      slots.push(
        {
          key: "nid_front",
          label: "National ID (Front)",
          src: formDocs.nationalIdFront,
          width: 400,
          height: 240,
          wide: true,
        },
        {
          key: "nid_back",
          label: "National ID (Back)",
          src: formDocs.nationalIdBack,
          width: 400,
          height: 240,
          wide: true,
        },
      )
  }

  return slots
}

export function flattenVerifiedKycDocs(rows: MemberKycDocRow[]): MemberKycFlatUrls {
  return buildMemberKycSnapshot(rows, "verified").flatUrls
}

export function flattenMemberKycFormDocs(rows: MemberKycDocRow[]): MemberKycFormDocs {
  return buildMemberKycSnapshot(rows, "verified").formDocs
}

export function flattenStaffMemberKycFormDocs(rows: MemberKycDocRow[]): MemberKycFormDocs {
  return buildMemberKycSnapshot(rows, "staff").formDocs
}

export function parseKycUploadPayload(body: unknown): KycFieldUpload[] | null {
  if (!body || typeof body !== "object") return null
  const payload = body as Record<string, unknown>

  if (Array.isArray(payload.uploads)) {
    const uploads: KycFieldUpload[] = []
    for (const item of payload.uploads) {
      if (!item || typeof item !== "object") return null
      const row = item as Record<string, unknown>
      const field = String(row.field ?? row.docType ?? "")
      const url = typeof row.url === "string" ? row.url.trim() : ""
      if (!isKycUploadField(field) || !url) return null
      uploads.push({ field, url })
    }
    return uploads.length > 0 ? uploads : null
  }

  const field = String(payload.docType ?? "")
  const url = typeof payload.url === "string" ? payload.url.trim() : ""
  if (!isKycUploadField(field) || !url) return null
  return [{ field, url }]
}

export async function fetchMemberKycFlatUrls(client: PoolClient, memberId: string): Promise<MemberKycFlatUrls> {
  const snapshot = await fetchMemberKycSnapshot(client, memberId, "verified")
  return snapshot.flatUrls
}

export async function fetchStaffMemberKycSnapshot(client: PoolClient, memberId: string): Promise<MemberKycSnapshot> {
  return fetchMemberKycSnapshot(client, memberId, "staff")
}

async function fetchMemberKycSnapshot(
  client: PoolClient,
  memberId: string,
  mode: "verified" | "staff",
): Promise<MemberKycSnapshot> {
  const res = await client.query<MemberKycDocRow>(
    `SELECT doc_type, passport_photo, document_front, document_back, status
     FROM member_kyc_docs
     WHERE member_id = $1`,
    [memberId],
  )
  return buildMemberKycSnapshot(res.rows, mode)
}

export async function fetchMemberKycFormDocs(client: PoolClient, memberId: string): Promise<MemberKycFormDocs> {
  const snapshot = await fetchMemberKycSnapshot(client, memberId, "verified")
  return snapshot.formDocs
}

export async function fetchStaffMemberKycFormDocs(client: PoolClient, memberId: string): Promise<MemberKycFormDocs> {
  const snapshot = await fetchMemberKycSnapshot(client, memberId, "staff")
  return snapshot.formDocs
}

async function findMemberKycDocRow(
  client: PoolClient,
  memberId: string,
): Promise<{ id: string; doc_type: string } | null> {
  const res = await client.query<{ id: string; doc_type: string }>(
    `SELECT id, doc_type
     FROM member_kyc_docs
     WHERE member_id = $1
     LIMIT 1`,
    [memberId],
  )
  return res.rows[0] || null
}

export async function upsertKycDocField(
  client: PoolClient,
  params: {
    memberId: string
    institutionId: string
    branchId: string
    field: KycUploadField
    url: string
    status: "pending_review" | "verified"
    reviewedBy?: string | null
  },
): Promise<{ docType: KycDocType; legacyField: KycUploadField; docId: string }> {
  return upsertKycDocFields(client, {
    memberId: params.memberId,
    institutionId: params.institutionId,
    branchId: params.branchId,
    uploads: [{ field: params.field, url: params.url }],
    status: params.status,
    reviewedBy: params.reviewedBy,
  }).then((result) => ({
    docType: result.docTypes[0] || inferDocTypeFromUploads([{ field: params.field, url: params.url }]),
    legacyField: params.field,
    docId: result.saved[0]?.docId || "",
  }))
}

export async function upsertKycDocFields(
  client: PoolClient,
  params: {
    memberId: string
    institutionId: string
    branchId: string
    uploads: KycFieldUpload[]
    status: "pending_review" | "verified"
    reviewedBy?: string | null
  },
): Promise<{
  saved: Array<{ docType: KycDocType; field: KycUploadField; docId: string }>
  docTypes: KycDocType[]
}> {
  const docType = inferDocTypeFromUploads(params.uploads)
  const reviewedAt = params.status === "verified" ? new Date().toISOString() : null
  const columnPatch: Partial<Record<KycDocColumn, string>> = {}

  for (const upload of params.uploads) {
    const { column } = uploadFieldToTarget(upload.field)
    columnPatch[column] = upload.url
  }

  const existing = await findMemberKycDocRow(client, params.memberId)
  const docTypeChanged = existing ? existing.doc_type !== docType : false
  let docId: string

  if (existing) {
    const sets: string[] = []
    const values: unknown[] = []
    let index = 1

    if (docTypeChanged) {
      sets.push(`doc_type = $${index++}`)
      values.push(docType)
      sets.push("document_front = NULL", "document_back = NULL")
    }

    for (const column of ["passport_photo", "document_front", "document_back"] as const) {
      const url = columnPatch[column]
      if (url) {
        sets.push(`${column} = $${index++}`)
        values.push(url)
      }
    }

    sets.push(
      `status = $${index++}`,
      `reviewed_by = $${index++}`,
      `reviewed_at = $${index++}`,
      "rejection_reason = NULL",
      "updated_at = NOW()",
    )
    values.push(params.status, params.reviewedBy || null, reviewedAt, existing.id)

    const updateRes = await client.query<{ id: string }>(
      `UPDATE member_kyc_docs
       SET ${sets.join(", ")}
       WHERE id = $${index}
       RETURNING id`,
      values,
    )
    docId = updateRes.rows[0].id
  } else {
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
        columnPatch.passport_photo || null,
        columnPatch.document_front || null,
        columnPatch.document_back || null,
        params.status,
        params.reviewedBy || null,
        reviewedAt,
      ],
    )
    docId = insertRes.rows[0].id
  }

  const saved = params.uploads.map((upload) => ({
    docType,
    field: upload.field,
    docId,
  }))

  return { saved, docTypes: [docType] }
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

export type PendingKycItem = ReturnType<typeof mapPendingKycRows>[number]

export function formatKycDocTypeLabel(docType: string): string {
  switch (docType) {
    case "national_id":
      return "National ID"
    case "passport":
      return "Passport"
    case "driving_license":
      return "Driving License"
    default:
      return docType.replaceAll("_", " ")
  }
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

  const row = rows[0]
  if (!row) return result

  for (const field of LEGACY_KYC_FIELDS) {
    const { docType, column } = legacyFieldToTarget(field)
    if (row.doc_type !== docType && field !== "passport_photo") continue

    const urlFrom = () => {
      if (column === "passport_photo") return row.passport_photo
      if (column === "document_front") return row.document_front
      return row.document_back
    }
    const url = urlFrom()
    if (!url) continue

    if (row.status === "verified") {
      result[field].current_verified = {
        url,
        verified_at: row.reviewed_at || row.created_at || new Date().toISOString(),
      }
    } else if (row.status === "pending_review") {
      result[field].pending = {
        id: row.id,
        url,
        submitted_at: row.created_at || new Date().toISOString(),
      }
    } else if (row.status === "rejected") {
      result[field].last_rejection = {
        reason: row.rejection_reason ?? null,
        date: row.reviewed_at || row.created_at || new Date().toISOString(),
      }
    }
  }

  return result
}
