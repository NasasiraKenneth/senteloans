import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings } from "lucide-react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export default async function AdminSettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) {
    return redirect(`/login?portal=admin&redirect=${encodeURIComponent("/admin/settings")}`)
  }
  const isSysAdmin = session.user.activeRole === "system_admin" || session.user.role === "system_admin"
  if (!isSysAdmin) return redirect("/login-select?portal=admin")

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">System Settings</h1>
        <p className="text-muted-foreground">Configure system-wide options</p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="mr-2 h-5 w-5 text-brand" />
            General
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">System-wide settings will be available here.</p>
        </CardContent>
      </Card>
    </div>
  )
}
