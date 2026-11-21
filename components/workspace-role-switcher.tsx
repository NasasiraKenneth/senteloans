"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Users, Briefcase, ShieldCheck, ChevronDown, Check, Loader2, LayoutGrid } from "lucide-react"
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

  const roleConfig = {
    system_admin: {
      label: "System Admin",
      path: "/admin",
      icon: ShieldCheck,
      color: "text-purple-600 dark:text-purple-400",
    },
    staff: {
      label: "Staff Dashboard",
      path: "/dashboard",
      icon: Briefcase,
      color: "text-[#F08C2B]",
    },
    client: {
      label: "Member Portal",
      path: "/client-portal",
      icon: Users,
      color: "text-emerald-600 dark:text-emerald-400",
    },
  }

  const currentInfo = roleConfig[activeRole as keyof typeof roleConfig] || roleConfig.staff
  const CurrentIcon = currentInfo.icon

  const handleSwitch = async (targetRole: "staff" | "client" | "system_admin") => {
    if (targetRole === activeRole || isSwitching) return
    setIsSwitching(true)

    try {
      await update({ activeRole: targetRole })

      const targetInfo = roleConfig[targetRole]
      toast({
        variant: "success",
        title: "Workspace Switched",
        description: `Now viewing ${targetInfo.label}.`,
      })

      if (targetRole === "staff") {
        if (session?.user) {
          seedStaffSessionFromAuthUser(session.user)
        }
        router.push("/dashboard")
      } else if (targetRole === "system_admin") {
        router.push("/admin")
      } else {
        router.push("/client-portal")
      }
      router.refresh()
    } catch {
      toast({
        variant: "destructive",
        title: "Switch Failed",
        description: "Could not switch workspace. Please try again.",
      })
    } finally {
      setIsSwitching(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isSwitching}
          className={`h-9 gap-2 rounded-xl border-[#F08C2B]/30 bg-[#F08C2B]/10 text-xs font-semibold text-[#F08C2B] hover:bg-[#F08C2B]/20 hover:text-[#d97b1e] transition-all shadow-xs cursor-pointer ${className || ""}`}
          title="Switch Workspace / Role"
        >
          {isSwitching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CurrentIcon className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">{currentInfo.label}</span>
          <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56 rounded-xl border border-zinc-200 dark:border-zinc-800 p-1.5 shadow-lg bg-white dark:bg-zinc-950">
        <DropdownMenuLabel className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 px-2 py-1">
          Available Workspaces
        </DropdownMenuLabel>

        {availableRoles.includes("system_admin") && (
          <DropdownMenuItem
            onClick={() => handleSwitch("system_admin")}
            className="flex items-center justify-between text-xs font-medium cursor-pointer rounded-lg px-2.5 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span>System Admin</span>
            </div>
            {activeRole === "system_admin" && <Check className="h-4 w-4 text-purple-600" />}
          </DropdownMenuItem>
        )}

        {availableRoles.includes("staff") && (
          <DropdownMenuItem
            onClick={() => handleSwitch("staff")}
            className="flex items-center justify-between text-xs font-medium cursor-pointer rounded-lg px-2.5 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <div className="flex items-center gap-2.5">
              <Briefcase className="h-4 w-4 text-[#F08C2B]" />
              <span>Staff Dashboard</span>
            </div>
            {activeRole === "staff" && <Check className="h-4 w-4 text-[#F08C2B]" />}
          </DropdownMenuItem>
        )}

        {availableRoles.includes("client") && (
          <DropdownMenuItem
            onClick={() => handleSwitch("client")}
            className="flex items-center justify-between text-xs font-medium cursor-pointer rounded-lg px-2.5 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <div className="flex items-center gap-2.5">
              <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Member Portal</span>
            </div>
            {activeRole === "client" && <Check className="h-4 w-4 text-emerald-600" />}
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator className="my-1 border-zinc-100 dark:border-zinc-800" />

        <DropdownMenuItem asChild>
          <Link
            href="/login-select"
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer rounded-lg px-2.5 py-2"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>Workspace Overview Screen</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
