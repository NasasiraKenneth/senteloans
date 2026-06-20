import {
  isMemberKycOnboardingComplete,
  kycUploadHint,
  type KycDocType,
} from "@/lib/members/kyc-docs"

export type OnboardingChecklistMember = {
  id: string
  kycStatus?: string | null
  kycDocType?: KycDocType | null
  kycDocStatus?: string | null
  kycDocComplete?: boolean
  mobileMoneyProvider?: string | null
  mobileMoneyNumber?: string | null
  bankName?: string | null
  bankAccountNumber?: string | null
  bankAccountName?: string | null
  bankBranch?: string | null
  notes?: string | null
  nextOfKinName?: string | null
  nextOfKinRelationship?: string | null
  nextOfKinPhone?: string | null
}

export type OnboardingChecklistItem = {
  key: "kyc" | "payout" | "notes"
  label: string
  hint: string
  done: boolean
  href?: string
  action?: "documents-tab"
}

export function isPayoutOnboardingComplete(member: OnboardingChecklistMember): boolean {
  const mobileComplete = Boolean(member.mobileMoneyProvider?.trim() && member.mobileMoneyNumber?.trim())
  const bankComplete = Boolean(
    member.bankName?.trim() &&
      member.bankAccountNumber?.trim() &&
      member.bankAccountName?.trim() &&
      member.bankBranch?.trim(),
  )
  return mobileComplete || bankComplete
}

export function isNotesNokOnboardingComplete(member: OnboardingChecklistMember): boolean {
  return Boolean(
    member.notes?.trim() &&
      member.nextOfKinName?.trim() &&
      member.nextOfKinRelationship?.trim() &&
      member.nextOfKinPhone?.trim(),
  )
}

export function buildOnboardingChecklistItems(member: OnboardingChecklistMember): OnboardingChecklistItem[] {
  const kycDone = isMemberKycOnboardingComplete(
    {
      docComplete: Boolean(member.kycDocComplete),
      docStatus: member.kycDocStatus ?? null,
    },
    member.kycStatus,
  )
  const kycHint = kycUploadHint(member.kycDocType ?? null)
  const kycPendingReview =
    member.kycDocComplete && member.kycDocStatus === "pending_review" && member.kycStatus !== "Verified"

  return [
    {
      key: "kyc",
      label: "Upload KYC documents",
      hint: kycPendingReview ? `${kycHint} — awaiting verification` : kycHint,
      done: kycDone,
      action: "documents-tab",
    },
    {
      key: "payout",
      label: "Add payout account",
      hint: "Mobile Money or Bank Account",
      done: isPayoutOnboardingComplete(member),
      href: `/members/${member.id}/edit#payout`,
    },
    {
      key: "notes",
      label: "Add notes & next of kin",
      hint: "Notes, next-of-kin name, relationship, and phone",
      done: isNotesNokOnboardingComplete(member),
      href: `/members/${member.id}/edit#nok`,
    },
  ]
}
