"use client"

import React, { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { AdminForm } from "../forms/adminForm"

interface EditAdminModalProps {
  admin: any
  institutionId: string
  institutionName?: string
  branches?: Array<{ id: string; name: string; branch_type?: string }>
  isOpen?: boolean
  onClose?: () => void
  onSuccess?: (updatedAdmin?: any) => void
  trigger?: React.ReactNode
}

export function EditAdminModal({
  admin,
  institutionId,
  institutionName,
  branches,
  isOpen: externalIsOpen,
  onClose: externalOnClose,
  onSuccess,
  trigger,
}: EditAdminModalProps) {
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
      {trigger && (
        <div onClick={handleOpen} className="inline-block cursor-pointer">
          {trigger}
        </div>
      )}

      <ReeveModal
        isOpen={open}
        onClose={handleClose}
        title={institutionName ? `Edit Admin - ${institutionName}` : "Edit Admin Account"}
        className="w-[34rem] max-w-[95vw] border-slate-200 shadow-2xl"
      >
        {admin && (
          <AdminForm
            institutionId={institutionId}
            adminId={admin.id}
            initialData={admin}
            isEditMode={true}
            initialBranches={branches}
            onSuccess={(updated) => {
              handleClose()
              if (onSuccess) onSuccess(updated)
            }}
            onCancel={handleClose}
          />
        )}
      </ReeveModal>
    </>
  )
}
