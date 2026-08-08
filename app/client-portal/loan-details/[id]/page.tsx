"use client"

import { use, useEffect } from "react"
import { useRouter } from "next/navigation"

export default function LoanDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  useEffect(() => {
    if (id) {
      router.replace(`/client-portal/loans/${id}`)
    }
  }, [id, router])

  return (
    <div className="flex items-center justify-center py-16">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[#f08c2b] border-t-transparent" />
        <p className="text-muted-foreground text-xs">Redirecting to loan details...</p>
      </div>
    </div>
  )
}
