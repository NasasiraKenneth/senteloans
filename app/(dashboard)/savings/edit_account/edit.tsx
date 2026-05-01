"use client"

import AccountForm, { type SavingsAccountFormValues } from "../forms/accountForm"
import { LowModal } from "@/components/modals/LowModal"

type SavingsEditAccountProps = {
  isOpen: boolean
  loading?: boolean
  initialValues?: Partial<SavingsAccountFormValues>
  onClose: () => void
  onSubmit: (values: SavingsAccountFormValues) => Promise<void> | void
}

export default function EditAccount({
  isOpen,
  loading = false,
  initialValues,
  onClose,
  onSubmit,
}: SavingsEditAccountProps) {
  return (
    <LowModal isOpen={isOpen} onClose={onClose} title="Edit Savings Account">
      <AccountForm
        loading={loading}
        initialValues={initialValues}
        onCancel={onClose}
        onSubmit={onSubmit}
      />
    </LowModal>
  )
}
