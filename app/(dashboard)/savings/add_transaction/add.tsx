"use client"

import AddTransactionModal from "../../transactions/components/add/new"
import type { TransactionFormData } from "../../transactions/components/forms/transactionForm"

interface SavingsAddTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  memberId?: string
  accountId?: string
}

export default function SavingsAddTransactionModal({
  isOpen,
  onClose,
  onSuccess,
  memberId,
  accountId,
}: SavingsAddTransactionModalProps) {
  const initialValues: Partial<TransactionFormData> = {
    member: memberId || "",
    account: accountId || "",
  }

  return (
    <AddTransactionModal
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onSuccess}
      initialValues={initialValues}
      title="New Transaction"
    />
  )
}
