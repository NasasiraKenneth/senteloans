"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Edit } from "lucide-react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { InstitutionForm } from "../forms/institutionForm"

interface EditInstitutionModalProps {
  institution: any
  buttonText?: string
  buttonVariant?: "default" | "outline" | "secondary" | "ghost"
  buttonSize?: "default" | "sm" | "lg" | "icon"
  isOpen?: boolean
  onClose?: () => void
}

export function EditInstitutionModal({
  institution,
  buttonText = "Edit",
  buttonVariant = "default",
  buttonSize = "sm",
  isOpen: externalIsOpen,
  onClose: externalOnClose,
}: EditInstitutionModalProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false)

  const isControlled = typeof externalIsOpen === "boolean"
  const isOpen = isControlled ? externalIsOpen : internalIsOpen

  const handleClose = () => {
    if (isControlled && externalOnClose) {
      externalOnClose()
    } else {
      setInternalIsOpen(false)
    }
  }

  const handleOpen = () => {
    if (!isControlled) {
      setInternalIsOpen(true)
    }
  }

  return (
    <>
      {!isControlled && (
        <Button
          variant={buttonVariant}
          size={buttonSize}
          onClick={handleOpen}
          className="font-medium"
        >
          <Edit className="mr-2 h-4 w-4" />
          {buttonText}
        </Button>
      )}

      <ReeveModal
        isOpen={isOpen}
        onClose={handleClose}
        title={`Edit Institution: ${institution?.name || ""}`}
        className="w-[34rem] max-w-[95vw] border-slate-200 shadow-2xl"
      >
        <InstitutionForm
          initialData={institution}
          institutionId={institution?.id}
          isEditMode={true}
          onSuccess={handleClose}
          onCancel={handleClose}
        />
      </ReeveModal>
    </>
  )
}

export default EditInstitutionModal
