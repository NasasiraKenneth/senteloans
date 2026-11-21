import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import SystemUsersView from "./components/system-users-view"

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) {
    return redirect(`/login?portal=admin&redirect=${encodeURIComponent("/admin/users")}`)
  }
  const isSysAdmin = session.user.activeRole === "system_admin" || session.user.role === "system_admin"
  if (!isSysAdmin) return redirect("/login-select?portal=admin")

  return <SystemUsersView />
}
