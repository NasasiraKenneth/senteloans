"use client"

import { ReeveModal } from "@/components/modals/ReeveModal"
import ReviewKycForm from "../forms/reviewKycForm"
import type { PendingKycItem } from "@/lib/members/kyc-docs"

interface ReviewKycDocumentsModalProps {
  isOpen: boolean
  onClose: () => void
  memberId: string
  pending: PendingKycItem[]
  loading?: boolean
  onSuccess?: () => void
  title?: string
}

export default function ReviewKycDocumentsModal({
  isOpen,
  onClose,
  memberId,
  pending,
  loading = false,
  onSuccess,
  title = "Verify KYC Documents",
}: ReviewKycDocumentsModalProps) {
  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title={title} className="z-50 w-[32rem]">
      <ReviewKycForm
        memberId={memberId}
        pending={pending}
        loading={loading}
        onReviewComplete={onSuccess}
        onClose={onClose}
      />
    </ReeveModal>
  )
}
