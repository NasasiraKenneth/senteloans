import type React from "react"
import { redirect } from "next/navigation"
import { AdminSidebar } from "@/components/admin-sidebar"
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
    <div className="flex h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
