"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { BranchForm } from "../forms/branchForm"

interface AddNewBranchModalProps {
  institutionId: string
  institutionName?: string
  buttonText?: string
  buttonVariant?: "default" | "outline" | "secondary" | "ghost"
  buttonClassName?: string
  onSuccess?: (createdBranch?: any) => void
}

export function AddNewBranchModal({
  institutionId,
  institutionName,
  buttonText = "Add Branch",
  buttonVariant = "default",
  buttonClassName,
  onSuccess,
}: AddNewBranchModalProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button
        variant={buttonVariant}
        onClick={() => setIsOpen(true)}
        className={
          buttonClassName ||
          "bg-[#f08c2b] hover:bg-[#e07b1a] text-white font-semibold text-xs rounded-2xl shadow-xs flex items-center justify-center gap-1.5 px-4 py-2.5 h-[42px] flex-shrink-0"
        }
      >
        <Plus className="h-4 w-4" />
        {buttonText}
      </Button>

      <ReeveModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={institutionName ? `Add Branch - ${institutionName}` : "Add New Branch"}
        className="w-[34rem] max-w-[95vw] border-slate-200 shadow-2xl"
      >
        <BranchForm
          institutionId={institutionId}
          onSuccess={(branch) => {
            setIsOpen(false)
            if (onSuccess) onSuccess(branch)
          }}
          onCancel={() => setIsOpen(false)}
        />
      </ReeveModal>
    </>
  )
}

export default AddNewBranchModal
