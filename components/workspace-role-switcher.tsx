"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Users, Briefcase, ArrowLeftRight, Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { seedStaffSessionFromAuthUser } from "@/lib/staff-session-hydration"

export function WorkspaceRoleSwitcher({ className }: { className?: string }) {
  const { data: session, update } = useSession()
  const [isSwitching, setIsSwitching] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const availableRoles = session?.user?.availableRoles || []
  if (availableRoles.length <= 1) return null

  const activeRole = session?.user?.activeRole || session?.user?.type || "staff"
  const isCurrentlyStaff = activeRole === "staff"
  const targetRole = isCurrentlyStaff ? "client" : "staff"
  const targetLabel = isCurrentlyStaff ? "Member Portal" : "Staff Dashboard"
  const TargetIcon = isCurrentlyStaff ? Users : Briefcase

  const handleSwitch = async () => {
    setIsSwitching(true)
    try {
      await update({ activeRole: targetRole })

      toast({
        title: "Workspace Switched",
        description: `Now viewing your ${targetLabel}.`,
      })

      if (targetRole === "staff") {
        if (session?.user) {
          seedStaffSessionFromAuthUser(session.user)
        }
        router.push("/dashboard")
      } else {
        router.push("/client-portal")
      }
      router.refresh()
    } catch {
      toast({
        title: "Switch Failed",
        description: "Could not switch workspace. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSwitching(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleSwitch}
      disabled={isSwitching}
      className={`h-9 gap-2 rounded-xl border-[#f08c2b]/30 bg-[#f08c2b]/10 text-xs font-semibold text-[#f08c2b] hover:bg-[#f08c2b]/20 hover:text-[#d97b1e] transition-all shadow-sm ${className || ""}`}
      title={`Switch to ${targetLabel}`}
    >
      {isSwitching ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <TargetIcon className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">Switch to {targetLabel}</span>
      <ArrowLeftRight className="h-3 w-3 opacity-60" />
    </Button>
  )
}
