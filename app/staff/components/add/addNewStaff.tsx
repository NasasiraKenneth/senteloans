"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import UserForm, { UserFormData } from "../forms/NewUserForm"

interface AddNewStaffProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddNewStaff({ isOpen, onClose, onSuccess }: AddNewStaffProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleCreateStaff = async (data: UserFormData) => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch("/api/institution/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error || "Failed to create staff member")
      }
      setSuccess(`${data.firstName} ${data.lastName} has been added successfully.`)
      onSuccess()
      // Close modal after a short delay so user sees the success message
      setTimeout(() => {
        handleClose()
      }, 1500)
    } catch (e: any) {
      setError(e?.message || "Failed to create staff member")
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setError(null)
    setSuccess(null)
    onClose()
  }

  return (
    <ReeveModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add New Staff Member"
      className="z-10"
    >
      <UserForm
        onSubmit={handleCreateStaff}
        loading={loading}
        error={error}
        successMessage={success}
      />
    </ReeveModal>
  )
}
