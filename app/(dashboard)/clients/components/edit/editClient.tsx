"use client"

import { useEffect, useState } from "react"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { useToast } from "@/components/ui/toast"
import NewClientForm, { ClientFormData } from "../forms/NewClientForm"

interface EditClientProps {
  isOpen: boolean
  clientId: string | null
  onClose: () => void
  onSuccess: () => void
}

export default function EditClient({ isOpen, clientId, onClose, onSuccess }: EditClientProps) {
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [initialValues, setInitialValues] = useState<Partial<ClientFormData> | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!isOpen || !clientId) {
      setInitialValues(null)
      setFetchError(null)
      return
    }

    const fetchClient = async () => {
      setFetching(true)
      setFetchError(null)
      try {
        const res = await fetch(`/api/institution/clients/${clientId}`)
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (res.status === 403 && body?.error === "missing_permission:view_clients") {
            throw new Error("missing_permission:view_clients")
          }
          if (res.status === 404 && body?.error === "client_not_found") {
            throw new Error("client_not_found")
          }
          throw new Error(body.error || "Failed to load client")
        }

        const client = body?.client
        setInitialValues({
          name: client?.name || "",
          status: client?.status || "Active",
          email: client?.email || "",
          phone: client?.phone || "",
          address: client?.address || "",
        })
      } catch (e: any) {
        const message = e?.message || "Failed to load client"
        setFetchError(message)
        if (message === "missing_permission:view_clients") {
          toast({
            title: "Access denied",
            description: "You do not have permission to view clients.",
            variant: "warning",
          })
          return
        }
        if (message === "client_not_found") {
          toast({
            title: "Client not found",
            description: "The selected client record no longer exists.",
            variant: "warning",
          })
          return
        }
        toast({
          title: "Failed to load client",
          description: message,
          variant: "destructive",
        })
      } finally {
        setFetching(false)
      }
    }

    fetchClient()
  }, [isOpen, clientId, toast])

  const handleEditClient = async (data: ClientFormData) => {
    if (!clientId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/institution/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 403 && body?.error === "missing_permission:edit_client") {
          throw new Error("missing_permission:edit_client")
        }
        if (res.status === 404 && body?.error === "client_not_found") {
          throw new Error("client_not_found")
        }
        throw new Error(body.error || "Failed to update client")
      }

      toast({
        title: "Client updated",
        description: "Client record updated successfully.",
        variant: "success",
      })
      onSuccess()
      handleClose()
    } catch (e: any) {
      const message = e?.message || "Failed to update client"
      if (message === "missing_permission:edit_client") {
        toast({
          title: "Access denied",
          description: "You do not have permission to edit clients.",
          variant: "warning",
        })
        return
      }
      if (message === "client_not_found") {
        toast({
          title: "Client not found",
          description: "The selected client record no longer exists.",
          variant: "warning",
        })
        return
      }
      toast({
        title: "Failed to update client",
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
      title="Edit Client"
      className="z-10"
    >
      {fetching ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#f08c2b]" />
        </div>
      ) : initialValues ? (
        <NewClientForm
          key={clientId}
          initialValues={initialValues}
          onSubmit={handleEditClient}
          onCancel={handleClose}
          loading={loading}
          submitLabel="Save Changes"
        />
      ) : fetchError ? (
        <div className="text-center py-12">
          <p className="text-sm text-red-600">{fetchError}</p>
        </div>
      ) : null}
    </ReeveModal>
  )
}
