import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import InstitutionsView from "./components/institutions-view"

export default async function InstitutionsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) {
    return redirect(`/login?portal=admin&redirect=${encodeURIComponent("/admin/institutions")}`)
  }
  const isSysAdmin = session.user.activeRole === "system_admin" || session.user.role === "system_admin"
  if (!isSysAdmin) return redirect("/login-select?portal=admin")

  return <InstitutionsView />
}
