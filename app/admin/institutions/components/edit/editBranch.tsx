"use client"

import React, { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { BranchForm } from "../forms/branchForm"
import { Pencil } from "lucide-react"

interface EditBranchModalProps {
  branch: any
  institutionId: string
  institutionName?: string
  isOpen?: boolean
  onClose?: () => void
  onSuccess?: (updatedBranch?: any) => void
  trigger?: React.ReactNode
}

export function EditBranchModal({
  branch,
  institutionId,
  institutionName,
  isOpen: externalIsOpen,
  onClose: externalOnClose,
  onSuccess,
  trigger,
}: EditBranchModalProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false)

  const isControlled = typeof externalIsOpen === "boolean"
  const open = isControlled ? externalIsOpen : internalIsOpen

  const handleClose = () => {
    if (isControlled && externalOnClose) {
      externalOnClose()
    } else {
      setInternalIsOpen(false)
    }
  }

  const handleOpen = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!isControlled) {
      setInternalIsOpen(true)
    }
  }

  return (
    <>
      {trigger ? (
        <div onClick={handleOpen} className="inline-block cursor-pointer">
          {trigger}
        </div>
      ) : !isControlled ? (
        <button
          type="button"
          onClick={handleOpen}
          title="Edit Branch"
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 rounded-lg bg-gray-100 hover:bg-orange-100 text-gray-500 hover:text-[#f08c2b] border border-gray-200 hover:border-orange-200 shadow-2xs cursor-pointer"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : null}

      <ReeveModal
        isOpen={open}
        onClose={handleClose}
        title={branch?.name ? `Edit Branch - ${branch.name}` : "Edit Branch"}
        className="w-[34rem] max-w-[95vw] border-slate-200 shadow-2xl"
      >
        <BranchForm
          institutionId={institutionId}
          branchId={branch?.id}
          initialData={branch}
          isEditMode={true}
          onSuccess={(updatedBranch) => {
            handleClose()
            if (onSuccess) onSuccess(updatedBranch)
          }}
          onCancel={handleClose}
        />
      </ReeveModal>
    </>
  )
}

export default EditBranchModal
