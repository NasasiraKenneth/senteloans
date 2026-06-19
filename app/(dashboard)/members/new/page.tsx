"use client"

import { MemberRegistrationForm } from "@/components/member-registration-form"
import { MemberRequirementsCard } from "@/components/member-requirements-card"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useStaffSession } from "@/components/staff-session-provider"

export default function NewMemberPage() {
  const { session } = useStaffSession()

  const clientTerminology = session?.institution?.config?.clientTerminology || "Member"

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/members"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to {clientTerminology}s
        </Link>
      </div>

      <MemberRequirementsCard />

      <MemberRegistrationForm />
    </div>
  )
}
