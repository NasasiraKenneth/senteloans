"use client"

import { useEffect, useState } from "react"
import { useToast } from "@/components/ui/toast"
import SaccoLoanForm, { SaccoLoanFormData } from "../forms/saccoloanForm"
import { SlideModal } from "@/components/modals/SlideModal"

interface AddSaccoLoanProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: () => void
}

type ClientOption = {
  id: string
  name: string
}

export default function AddSaccoLoan({ isOpen, onClose, onCreated }: AddSaccoLoanProps) {
  const { toast } = useToast()
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loadingClients, setLoadingClients] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const loadClients = async () => {
      try {
        setLoadingClients(true)
        const res = await fetch("/api/institution/clients?limit=300", { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Failed to load clients")
        const list = Array.isArray(body?.clients) ? body.clients : Array.isArray(body) ? body : []
        if (cancelled) return
        setClients(
          list.map((c: any) => ({
            id: String(c.id || ""),
            name: String(c.name || c.full_name || ""),
          })),
        )
      } catch (e: any) {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "Failed to load clients",
            description: e?.message || "Please try again.",
          })
        }
      } finally {
        if (!cancelled) setLoadingClients(false)
      }
    }
    void loadClients()
    return () => {
      cancelled = true
    }
  }, [isOpen, toast])

  const handleSubmit = async (data: SaccoLoanFormData) => {
    try {
      setSaving(true)
      const res = await fetch("/api/institution/sacco-loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "Failed to create Sacco loan")
      toast({
        title: "Sacco loan created",
        description: "The loan was saved successfully.",
      })
      onCreated?.()
      onClose()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Please try again."
      toast({
        variant: "destructive",
        title: "Could not save loan",
        description: message,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SlideModal isOpen={isOpen} onClose={onClose} title="Add Sacco Loan" className="z-20">
      <SaccoLoanForm onSubmit={handleSubmit} onClose={onClose} loading={saving || loadingClients} clients={clients} />
    </SlideModal>
  )
}
