import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings } from "lucide-react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export default async function AdminSettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return redirect("/admin-login")
  if (session.user.role !== "system_admin") return redirect("/admin-login")

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">System Settings</h1>
        <p className="text-muted-foreground">Configure system-wide options</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="mr-2 h-5 w-5" />
            General
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">System-wide settings can be added here (e.g. default policies, feature flags, maintenance mode).</p>
        </CardContent>
      </Card>
    </div>
  )
}
