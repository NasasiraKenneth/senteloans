"use client"

import { useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import NewClientForm, { ClientFormData } from "../forms/NewClientForm"

interface AddNewClientProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddNewClient({ isOpen, onClose, onSuccess }: AddNewClientProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleCreateClient = async (data: ClientFormData) => {
    setLoading(true)
    try {
      const res = await fetch("/api/institution/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 403 && body?.error === "missing_permission:create_client") {
          throw new Error("missing_permission:create_client")
        }
        throw new Error(body.error || "Failed to create client")
      }

      toast({
        title: "Client created",
        description: "Client record added successfully.",
        variant: "success",
      })
      onSuccess()
      onClose()
    } catch (e: any) {
      const message = e?.message || "Failed to create client"
      if (message === "missing_permission:create_client") {
        toast({
          title: "Access denied",
          description: "You do not have permission to create clients.",
          variant: "warning",
        })
        return
      }
      toast({
        title: "Failed to create client",
        description: message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ReeveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Client"
      className="z-10"
    >
      <NewClientForm
        onSubmit={handleCreateClient}
        onCancel={onClose}
        loading={loading}
        submitLabel="Create Client"
      />
    </ReeveModal>
  )
}
