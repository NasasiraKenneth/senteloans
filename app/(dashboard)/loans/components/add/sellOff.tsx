"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import SellOffForm, { SellOffFormData } from "../forms/sellOffForm"

interface SellOffProps {
  isOpen: boolean
  onClose: () => void
  outstandingBalance?: number
}

export default function SellOff({ isOpen, onClose, outstandingBalance = 0 }: SellOffProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (_data: SellOffFormData) => {
    try {
      setLoading(true)
      // Placeholder for future API implementation.
      toast({
        variant: "warning",
        title: "Coming soon",
        description: "Sell off API is not implemented yet.",
      })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title="Sell Off Loan">
      <SellOffForm
        onSubmit={handleSubmit}
        onCancel={onClose}
        loading={loading}
        outstandingBalance={outstandingBalance}
      />
    </ReeveModal>
  )
}
