"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { AdminForm } from "../forms/adminForm"

interface AddNewAdminModalProps {
  institutionId: string
  institutionName?: string
  branches?: Array<{ id: string; name: string; branch_type?: string }>
  buttonText?: string
  buttonVariant?: "default" | "outline" | "secondary" | "ghost"
  buttonClassName?: string
  onSuccess?: (createdAdmin?: any) => void
}

export function AddNewAdminModal({
  institutionId,
  institutionName,
  branches,
  buttonText = "Add Admin Account",
  buttonVariant = "default",
  buttonClassName,
  onSuccess,
}: AddNewAdminModalProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant={buttonVariant}
        onClick={() => setIsOpen(true)}
        className={
          buttonClassName ||
          "bg-[#f08c2b] hover:bg-[#e07b1a] text-white font-semibold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-1.5 px-3.5 py-2 cursor-pointer"
        }
      >
        <Plus className="h-4 w-4" />
        {buttonText}
      </Button>

      <ReeveModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={institutionName ? `Add Admin Account - ${institutionName}` : "Add Admin Account"}
        className="w-[34rem] max-w-[95vw] border-slate-200 shadow-2xl"
      >
        <AdminForm
          institutionId={institutionId}
          initialBranches={branches}
          onSuccess={(admin) => {
            setIsOpen(false)
            if (onSuccess) onSuccess(admin)
          }}
          onCancel={() => setIsOpen(false)}
        />
      </ReeveModal>
    </>
  )
}
