"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { InstitutionForm } from "../forms/institutionForm"

interface AddNewInstitutionModalProps {
  buttonText?: string
  buttonVariant?: "default" | "outline" | "secondary" | "ghost"
}

export default function AddNewInstitutionModal({
  buttonText = "Add Institution",
  buttonVariant = "default",
}: AddNewInstitutionModalProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button
        variant={buttonVariant}
        onClick={() => setIsOpen(true)}
        className="bg-orange-500 hover:bg-orange-600 text-white font-medium shadow-xs"
      >
        <Plus className="mr-2 h-4 w-4" />
        {buttonText}
      </Button>

      <ReeveModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Add New Institution"
        className="w-[34rem] max-w-[95vw] border-slate-200 shadow-2xl"
      >
        <InstitutionForm
          onSuccess={() => setIsOpen(false)}
          onCancel={() => setIsOpen(false)}
        />
      </ReeveModal>
    </>
  )
}
