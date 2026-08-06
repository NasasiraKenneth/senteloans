import Link from "next/link"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Users, Building2, Mail } from "lucide-react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3000}`

type UserRow = {
  id: string
  fullName: string
  email: string
  phoneNumber: string | null
  role: string
  status: string
  createdAt: string
  institutionName: string
  institutionId: string
}

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return redirect("/admin-login")
  if (session.user.role !== "system_admin") return redirect("/admin-login")

  const headersList = await headers()
  const res = await fetch(`${baseUrl}/api/admin/users`, {
    cache: "no-store",
    headers: { Cookie: headersList.get("cookie") ?? "" },
  })
  if (res.status === 401 || res.status === 403) return redirect("/admin-login")
  if (!res.ok) throw new Error("Failed to load system users")
  const users = (await res.json()) as UserRow[]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">System Users</h1>
        <p className="text-muted-foreground">Staff accounts across all institutions</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="mr-2 h-5 w-5" />
            All users ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.fullName}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {user.email}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/institutions/${user.institutionId}`}
                      className="text-primary hover:underline flex items-center gap-2"
                    >
                      <Building2 className="h-4 w-4" />
                      {user.institutionName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{(user.role || "staff").replace(/_/g, " ")}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.status === "Active" ? "default" : "secondary"}>{user.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {users.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No users found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
