"use client"

import { useState, useEffect } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import UserForm, { UserFormData } from "../forms/NewUserForm"
import { useToast } from "@/components/ui/toast"

interface EditStaffProps {
  isOpen: boolean
  staffId: string | null
  onClose: () => void
  onSuccess: () => void
}

export default function EditStaff({ isOpen, staffId, onClose, onSuccess }: EditStaffProps) {
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [initialValues, setInitialValues] = useState<Partial<UserFormData> | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!isOpen || !staffId) {
      setInitialValues(null)
      setFetchError(null)
      return
    }

    const fetchStaff = async () => {
      setFetching(true)
      setFetchError(null)
      try {
        const res = await fetch(`/api/institution/staff/${staffId}`)
        const body = await res.json()
        if (!res.ok) {
          if (res.status === 403 && body?.error === "missing_permission:view_users") {
            throw new Error("missing_permission:view_users")
          }
          if (res.status === 404 && body?.error === "staff_not_found") {
            throw new Error("staff_not_found")
          }
          throw new Error(body.error || "Failed to load staff member")
        }

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
          roleId: s.role_id || "",
          password: "",
          confirmPassword: "",
        })
      } catch (e: any) {
        const message = e?.message || "Failed to load staff member"
        setFetchError(message)
        if (message === "missing_permission:view_users") {
          toast({
            title: "Access denied",
            description: "You do not have permission to view staff.",
            variant: "warning",
          })
          return
        }
        if (message === "staff_not_found") {
          toast({
            title: "Staff not found",
            description: "The selected staff record no longer exists.",
            variant: "warning",
          })
          return
        }
        toast({
          title: "Failed to load staff",
          description: message || "Could not fetch staff details.",
          variant: "destructive",
        })
      } finally {
        setFetching(false)
      }
    }

    fetchStaff()
  }, [isOpen, staffId])

  const handleEditStaff = async (data: UserFormData) => {
    if (!staffId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/staff/${staffId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) {
        if (res.status === 403 && body?.code === "super_admin_write_blocked") {
          throw new Error(body.error || "Super admins cannot update staff members")
        }
        if (res.status === 403 && body?.error === "missing_permission:edit_user") {
          throw new Error("missing_permission:edit_user")
        }
        if (res.status === 404 && body?.error === "Staff member not found") {
          throw new Error("staff_not_found")
        }
        throw new Error(body.error || "Failed to update staff member")
      }
      toast({
        title: "Staff member updated",
        description: `${data.firstName} ${data.lastName} has been updated successfully.`,
        variant: "success",
      })
      onSuccess()
      handleClose()
    } catch (e: any) {
      const message = e?.message || "Something went wrong. Please try again."
      if (message === "missing_permission:edit_user") {
        toast({
          title: "Access denied",
          description: "You do not have permission to edit staff users.",
          variant: "warning",
        })
        return
      }
      if (message === "staff_not_found") {
        toast({
          title: "Staff not found",
          description: "The selected staff record no longer exists.",
          variant: "warning",
        })
        return
      }
      toast({
        title: "Failed to update staff",
        description: message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setInitialValues(null)
    setFetchError(null)
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
          editMode
        />
      ) : fetchError ? (
        <div className="text-center py-12">
          <p className="text-sm text-red-600">{fetchError}</p>
        </div>
      ) : null}
    </ReeveModal>
  )
}
