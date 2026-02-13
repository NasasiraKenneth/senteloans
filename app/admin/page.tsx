import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, Users, TrendingUp, AlertTriangle } from "lucide-react"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { authOptions } from "@/lib/auth"

const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3000}`

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return redirect("/admin-login")
  if (session.user.role !== "system_admin") return redirect("/admin-login")

  const headersList = await headers()
  const res = await fetch(`${baseUrl}/api/admin/dashboard-stats`, {
    cache: "no-store",
    headers: { Cookie: headersList.get("cookie") ?? "" },
  })
  if (res.status === 401 || res.status === 403) return redirect("/admin-login")
  if (!res.ok) throw new Error("Failed to load dashboard stats")
  const stats = await res.json()
  const {
    institutionsCount,
    recentInstitutions,
    totalUsers,
    pendingInstitutions,
    saccoCount,
    moneyLenderCount,
    mfiCount,
    activeInstitutions,
  } = stats

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">System Dashboard</h1>
        <p className="text-muted-foreground">Manage institutions and monitor system-wide performance</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Institutions</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{institutionsCount}</div>
            <p className="text-xs text-muted-foreground">{activeInstitutions} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Institution Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Number(totalUsers)}</div>
            <p className="text-xs text-muted-foreground">Across all institutions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">Healthy</div>
            <p className="text-xs text-muted-foreground">All systems operational</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingInstitutions}</div>
            <p className="text-xs text-muted-foreground">Require attention</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Institutions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentInstitutions.map((institution: { id: string; name: string; type: string; status: string }) => (
                <div key={institution.id} className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{institution.name}</p>
                    <p className="text-sm text-muted-foreground">{String(institution.type)} • {institution.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Institution Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">SACCOs</span>
                <span className="font-medium">{saccoCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Money Lenders</span>
                <span className="font-medium">{moneyLenderCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">MFIs</span>
                <span className="font-medium">{mfiCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
