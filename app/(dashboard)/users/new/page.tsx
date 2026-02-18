"use client"

import { MemberRegistrationForm } from "@/components/member-registration-form"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useState, useEffect } from "react"
import { getSession } from "@/lib/session"

export default function NewMemberPage() {
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    const sessionData = getSession()
    setSession(sessionData)
  }, [])

  const clientTerminology = session?.institution?.config?.clientTerminology || "Member"

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/users" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to {clientTerminology}s
        </Link>
      </div>

      <MemberRegistrationForm />
    </div>
  )
}
