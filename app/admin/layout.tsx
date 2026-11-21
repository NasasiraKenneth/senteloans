import type React from "react"
import { redirect } from "next/navigation"
import { AdminHeaderNav } from "@/components/admin-header-nav"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) {
    return redirect(`/login?portal=admin&redirect=${encodeURIComponent("/admin")}`)
  }
  const isSystemAdmin = session.user.activeRole === "system_admin" || session.user.role === "system_admin"
  if (!isSystemAdmin) {
    if (session.user.availableRoles?.includes("system_admin")) {
      return redirect("/login-select?portal=admin")
    }
    return redirect("/login?portal=admin&reason=forbidden")
  }

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-900 flex flex-col font-sans">
      <AdminHeaderNav />
      <main className="flex-1 w-full px-6 lg:px-10 py-6 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
