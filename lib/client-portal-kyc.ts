import {
  isMemberKycDocSetComplete,
  kycUploadHint,
  type KycDocType,
  type KycUploadField,
  type MemberKycDocRow,
  uploadFieldToTarget,
} from "@/lib/members/kyc-docs"

export type ClientKycDocStatus = "missing" | "pending" | "verified" | "rejected"

export type ClientKycDocState = {
  status: ClientKycDocStatus
  currentUrl: string
  pendingUrl: string
  reason: string
  pendingId: string | null
}

export type ClientKycUploadSlot = {
  field: KycUploadField
  label: string
  description: string
}

const PASSPORT_PHOTO_SLOT: ClientKycUploadSlot = {
  field: "passport_photo",
  label: "Passport Photo",
  description: "Upload a clear passport-style photo (JPG, PNG, or PDF)",
}

const UPLOAD_SLOTS_BY_DOC_TYPE: Record<KycDocType, ClientKycUploadSlot[]> = {
  national_id: [
    {
      field: "national_id_front",
      label: "National ID (Front)",
      description: "Upload the front side of your national ID card",
    },
    {
      field: "national_id_back",
      label: "National ID (Back)",
      description: "Upload the back side of your national ID card",
    },
  ],
  passport: [
    {
      field: "passport_document_front",
      label: "Passport (Biodata Page)",
      description: "Upload the biodata page of your passport (JPG, PNG, or PDF)",
    },
  ],
  driving_license: [
    {
      field: "driving_license_front",
      label: "Driving License (Front)",
      description: "Upload the front side of your driving license",
    },
    {
      field: "driving_license_back",
      label: "Driving License (Back)",
      description: "Upload the back side of your driving license",
    },
  ],
}

export const CLIENT_KYC_DOC_TYPE_OPTIONS: { value: KycDocType; label: string }[] = [
  { value: "national_id", label: "National ID" },
  { value: "passport", label: "Passport" },
  { value: "driving_license", label: "Driving License" },
]

export function getClientKycUploadSlots(docType: KycDocType): ClientKycUploadSlot[] {
  return [PASSPORT_PHOTO_SLOT, ...UPLOAD_SLOTS_BY_DOC_TYPE[docType]]
}

export function buildClientKycFieldState(
  row: MemberKycDocRow | null,
  field: KycUploadField,
): ClientKycDocState {
  const empty: ClientKycDocState = {
    status: "missing",
    currentUrl: "",
    pendingUrl: "",
    reason: "",
    pendingId: null,
  }
  if (!row) return empty

  const { docType: fieldDocType, column } = uploadFieldToTarget(field)
  if (field !== "passport_photo" && row.doc_type !== fieldDocType) return empty

  const url = (() => {
    if (column === "passport_photo") return row.passport_photo
    if (column === "document_front") return row.document_front
    return row.document_back
  })()

  const reason = row.rejection_reason || ""

  if (!url?.trim()) {
    if (row.status === "rejected") {
      return { status: "rejected", currentUrl: "", pendingUrl: "", reason, pendingId: null }
    }
    return empty
  }

  if (row.status === "verified") {
    return { status: "verified", currentUrl: url, pendingUrl: "", reason, pendingId: null }
  }

  if (row.status === "pending_review") {
    return { status: "pending", currentUrl: "", pendingUrl: url, reason, pendingId: row.id }
  }

  if (row.status === "rejected") {
    return { status: "rejected", currentUrl: "", pendingUrl: url, reason, pendingId: row.id }
  }

  return { status: "missing", currentUrl: url, pendingUrl: "", reason, pendingId: null }
}

export function clientKycPreviewUrl(state: ClientKycDocState): string {
  return state.pendingUrl || state.currentUrl
}

export function computeClientKycProgress(
  docType: KycDocType,
  row: MemberKycDocRow | null,
): { percent: number; uploaded: number; total: number; complete: boolean } {
  const slots = getClientKycUploadSlots(docType)
  const uploaded = slots.filter((slot) => {
    const state = buildClientKycFieldState(row, slot.field)
    return Boolean(state.currentUrl || state.pendingUrl)
  }).length
  const total = slots.length
  const percent = total === 0 ? 0 : Math.round((uploaded / total) * 100)
  const complete = row ? isMemberKycDocSetComplete(row) : false
  return { percent, uploaded, total, complete }
}

export function clientKycUploadHint(docType: KycDocType | null): string {
  return kycUploadHint(docType)
}

export const PROFILE_TABS = ["personal", "kyc", "payment", "security"] as const
export type ProfileTab = (typeof PROFILE_TABS)[number]

export function parseProfileTab(value: string | null): ProfileTab {
  if (value && (PROFILE_TABS as readonly string[]).includes(value)) {
    return value as ProfileTab
  }
  return "personal"
}
