"use client"

import { ReeveModal } from "@/components/modals/ReeveModal"
import KycForm, { type KycDocsState } from "../forms/kycForm"

interface AddKycDocumentsModalProps {
  isOpen: boolean
  onClose: () => void
  memberId: string
  initialDocs?: Partial<KycDocsState>
  onSuccess?: () => void
  title?: string
}

export default function AddKycDocumentsModal({
  isOpen,
  onClose,
  memberId,
  initialDocs,
  onSuccess,
  title = "Add KYC Documents",
}: AddKycDocumentsModalProps) {
  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title={title} className="z-50 w-[32rem]">
      <KycForm memberId={memberId} initialDocs={initialDocs} onUploadSuccess={onSuccess} onClose={onClose} />
    </ReeveModal>
  )
}
