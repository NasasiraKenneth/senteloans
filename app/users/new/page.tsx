"use client"

import AppLayout from "@/components/layout/app-layout"
import { MemberRegistrationForm } from "@/components/member-registration-form"
import { Button } from "@/components/ui/button"
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
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
            {/* Header with Back Button */}
            <div className="flex items-center gap-4">
              <Link href="/users">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h2 className="text-3xl font-bold text-balance">Register New {clientTerminology}</h2>
                <p className="text-muted-foreground text-pretty">
                  Add a new {clientTerminology.toLowerCase()} with their complete information and documentation.
                </p>
              </div>
            </div>

            {/* Registration Form */}
            <div className="bg-card rounded-lg border p-6">
              <MemberRegistrationForm />
            </div>
      </div>
    </AppLayout>
  )
}
