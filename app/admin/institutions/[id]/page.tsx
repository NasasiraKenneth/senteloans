import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, Building2, Mail, Phone, MapPin, Calendar, Users, DollarSign, Settings, Edit } from "lucide-react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithoutAuth } from "@/lib/db"
import { AdminInstitutionAdminsSection } from "@/components/admin-institution-admins-section"

interface InstitutionDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function InstitutionDetailPage({ params }: InstitutionDetailPageProps) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return redirect("/admin-login")
  if (session.user.role !== "system_admin") return redirect("/admin-login")

  const institution = await runWithoutAuth(async (client) => {
    const res = await client.query(
      "SELECT id, name, type, status, registration_number, license_number, address, phone_number, email, website, established_date, settings, created_at, updated_at FROM senteloans_institutions WHERE id = $1",
      [id]
    )
    return res.rows[0] ?? null
  })

  if (!institution) notFound()

  const settings = (institution.settings as Record<string, unknown>) || {}
  const modules = (settings.modules as Record<string, unknown>) || {}
  const clientTerminology = (settings.clientTerminology as string) || "Client"

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/admin/institutions">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Institutions
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-primary">{institution.name}</h1>
            <p className="text-muted-foreground">Institution Details</p>
          </div>
        </div>
        <div className="flex space-x-2">
          <Link href={`/admin/institutions/${institution.id}/edit`}>
            <Button>
              <Edit className="mr-2 h-4 w-4" />
              Edit Institution
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Information */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Building2 className="mr-2 h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Institution Name</label>
                  <p className="text-lg font-semibold">{institution.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Institution Type</label>
                  <div className="mt-1">
                    <Badge variant="outline" className="text-sm">
                      {String(institution.type).toUpperCase()}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div className="mt-1">
                    <Badge variant={institution.status === "Active" ? "default" : "secondary"}>{institution.status}</Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Registration Number</label>
                  <p className="font-medium">{institution.registration_number || "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Mail className="mr-2 h-5 w-5" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Website</label>
                  <p className="font-medium">{institution.website || "—"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email Address</label>
                  <div className="flex items-center">
                    <Mail className="mr-2 h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{institution.email || "—"}</p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Phone Number</label>
                  <div className="flex items-center">
                    <Phone className="mr-2 h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{institution.phone_number || "—"}</p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Physical Address</label>
                  <div className="flex items-center">
                    <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{institution.address || "—"}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="mr-2 h-5 w-5" />
                System Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Enabled Modules</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {Object.entries(modules)
                    .filter(([_, enabled]) => enabled)
                    .map(([module, _]) => (
                      <Badge key={module} variant="secondary">
                        {module.charAt(0).toUpperCase() + module.slice(1)}
                      </Badge>
                    ))}
                </div>
              </div>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Client Terminology</label>
                  <p className="font-medium">{clientTerminology}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Institution Type</label>
                  <p className="font-medium">{String(institution.type).toUpperCase()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Institution Admins (moved from sidebar) */}
          <AdminInstitutionAdminsSection institutionId={institution.id} />
        </div>
        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <DollarSign className="mr-2 h-5 w-5" />
                Quick Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">0</div>
                <p className="text-sm text-muted-foreground">Total {clientTerminology}s</p>
              </div>
              <Separator />
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">UGX 0</div>
                <p className="text-sm text-muted-foreground">Total Loans</p>
              </div>
              {modules.savings && (
                <>
                  <Separator />
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">UGX 0</div>
                    <p className="text-sm text-muted-foreground">Total Savings</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* System Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="mr-2 h-5 w-5" />
                System Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Created Date</label>
                <p className="font-medium">{new Date(institution.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
                <p className="font-medium">{new Date(institution.updated_at).toLocaleDateString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Institution ID</label>
                <p className="font-mono text-sm bg-muted px-2 py-1 rounded">{institution.id}</p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start bg-transparent">
                <Users className="mr-2 h-4 w-4" />
                View {clientTerminology}s
              </Button>
              <Button variant="outline" className="w-full justify-start bg-transparent">
                <DollarSign className="mr-2 h-4 w-4" />
                View Loans
              </Button>
              {modules.savings && (
                <Button variant="outline" className="w-full justify-start bg-transparent">
                  <Building2 className="mr-2 h-4 w-4" />
                  View Savings
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Admin Users moved to main content */}
        </div>
      </div>
    </div>
  )
}
