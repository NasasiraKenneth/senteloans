"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import UserForm, { UserFormData } from "../forms/NewUserForm"
import { useToast } from "@/components/ui/toast"

interface AddNewStaffProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddNewStaff({ isOpen, onClose, onSuccess }: AddNewStaffProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleCreateStaff = async (data: UserFormData) => {
    setLoading(true)
    try {
      const res = await fetch("/api/institution/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) {
        if (res.status === 403 && body?.code === "super_admin_write_blocked") {
          throw new Error(body.error || "Super admins cannot create staff members")
        }
        if (res.status === 403 && body?.error === "missing_permission:create_user") {
          throw new Error("missing_permission:create_user")
        }
        throw new Error(body.error || "Failed to create staff member")
      }
      toast({
        title: "Staff member created",
        description: `${data.firstName} ${data.lastName} has been added successfully.`,
        variant: "success",
      })
      onSuccess()
      handleClose()
    } catch (e: any) {
      const message = e?.message || "Something went wrong. Please try again."
      if (message === "missing_permission:create_user") {
        toast({
          title: "Access denied",
          description: "You do not have permission to create staff users.",
          variant: "warning",
        })
        return
      }
      toast({
        title: "Failed to create staff",
        description: message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
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
      />
    </ReeveModal>
  )
}
