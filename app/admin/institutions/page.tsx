import Link from "next/link"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Building2, Mail, Phone } from "lucide-react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3000}`

export default async function InstitutionsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return redirect("/admin-login")
  if (session.user.role !== "system_admin") return redirect("/admin-login")

  const headersList = await headers()
  const res = await fetch(`${baseUrl}/api/admin/institutions/list`, {
    cache: "no-store",
    headers: { Cookie: headersList.get("cookie") ?? "" },
  })
  if (res.status === 401 || res.status === 403) return redirect("/admin-login")
  if (!res.ok) throw new Error("Failed to load institutions")
  const institutions = await res.json()

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-primary">Institutions</h1>
          <p className="text-muted-foreground">Manage SACCOs, MFIs, and Money Lenders</p>
        </div>
        <Link href="/admin/institutions/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Institution
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {institutions?.map((institution: { id: string; name: string; type: string; status: string; email?: string; phone_number?: string; created_at: string }) => (
          <Card key={institution.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">{institution.name}</CardTitle>
                </div>
                <Badge variant={institution.status === "Active" ? "default" : "secondary"}>{institution.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Badge variant="outline" className="mb-2">
                  {String(institution.type).toUpperCase()}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Mail className="mr-2 h-4 w-4" />
                  {institution.email || "—"}
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Phone className="mr-2 h-4 w-4" />
                  {institution.phone_number || "—"}
                </div>
              </div>
              <div className="pt-4 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Created:</span>
                  <span>{new Date(institution.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex space-x-2">
                <Link href={`/admin/institutions/${institution.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full bg-transparent">
                    View Details
                  </Button>
                </Link>
                <Link href={`/admin/institutions/${institution.id}/edit`} className="flex-1">
                  <Button size="sm" className="w-full">
                    Edit
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
