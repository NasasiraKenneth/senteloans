"use client"

import { useState, useEffect } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import UserForm, { UserFormData } from "../forms/NewUserForm"

interface EditStaffProps {
  isOpen: boolean
  staffId: string | null
  onClose: () => void
  onSuccess: () => void
}

export default function EditStaff({ isOpen, staffId, onClose, onSuccess }: EditStaffProps) {
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [initialValues, setInitialValues] = useState<Partial<UserFormData> | null>(null)

  // Fetch staff data when modal opens
  useEffect(() => {
    if (!isOpen || !staffId) {
      setInitialValues(null)
      return
    }

    const fetchStaff = async () => {
      setFetching(true)
      setError(null)
      try {
        const res = await fetch(`/api/institution/staff/${staffId}`)
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || "Failed to load staff member")

        const s = body.staff
        const nameParts = (s.full_name || "").trim().split(/\s+/)
        const firstName = nameParts[0] || ""
        const lastName = nameParts.slice(1).join(" ") || ""

        setInitialValues({
          firstName,
          lastName,
          email: s.email || "",
          phoneNumber: s.phone_number || "",
          status: s.status || "Active",
          joinDate: s.joined_at ? s.joined_at.slice(0, 10) : "",
          username: s.username || "",
          isAdministrator: s.is_admin || false,
          roles: s.role ? [s.role] : [],
          password: "",
          confirmPassword: "",
        })
      } catch (e: any) {
        setError(e?.message || "Failed to load staff member")
      } finally {
        setFetching(false)
      }
    }

    fetchStaff()
  }, [isOpen, staffId])

  const handleEditStaff = async (data: UserFormData) => {
    if (!staffId) return
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/institution/staff/${staffId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error || "Failed to update staff member")
      }
      setSuccess(`${data.firstName} ${data.lastName} has been updated successfully.`)
      onSuccess()
      setTimeout(() => {
        handleClose()
      }, 1500)
    } catch (e: any) {
      setError(e?.message || "Failed to update staff member")
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setError(null)
    setSuccess(null)
    setInitialValues(null)
    onClose()
  }

  return (
    <ReeveModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Edit Staff Member"
      className="z-10"
    >
      {fetching ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#f08c2b]" />
        </div>
      ) : initialValues ? (
        <UserForm
          key={staffId}
          initialValues={initialValues}
          onSubmit={handleEditStaff}
          loading={loading}
          error={error}
          editMode
          successMessage={success}
        />
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : null}
    </ReeveModal>
  )
}
