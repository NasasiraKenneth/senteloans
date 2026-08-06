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
    return redirect(`/admin-login?redirect=${encodeURIComponent("/admin")}`)
  }
  if (session.user.role !== "system_admin") {
    return redirect("/admin-login?reason=forbidden")
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



