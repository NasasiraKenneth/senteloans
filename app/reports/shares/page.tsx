"use client"
import { useState, useEffect } from "react"
import AppLayout from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Download, Filter } from "lucide-react"

interface ShareMember {
  id: string
  full_name: string
  client_number: string
  phone_number?: string
  numberOfShares: number
  share_value: number
  totalShareValue: number
}

export default function ShareReportsPage() {
  const [members, setMembers] = useState<ShareMember[]>([])
  const [totalMembers, setTotalMembers] = useState(0)
  const [totalShares, setTotalShares] = useState(0)
  const [totalShareValue, setTotalShareValue] = useState(0)
  const [avgSharesPerMember, setAvgSharesPerMember] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/institution/shares-report")
      .then((r) => r.json())
      .then((data) => {
        setMembers(data.members ?? [])
        setTotalMembers(data.totalMembers ?? 0)
        setTotalShares(data.totalShares ?? 0)
        setTotalShareValue(data.totalShareValue ?? 0)
        setAvgSharesPerMember(data.avgSharesPerMember ?? 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <AppLayout>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Share Reports</h1>
          <p className="text-muted-foreground">Member shareholding analysis and equity distribution</p>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Total Shareholders</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalMembers}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Total Shares</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{totalShares}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Total Share Value</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">UGX {(totalShareValue || 0).toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Avg Shares/Member</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{avgSharesPerMember || 0}</div>
                </CardContent>
              </Card>
            </div>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filters & Export
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <Label htmlFor="memberType">Member Type</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="individual">Individual</SelectItem>
                        <SelectItem value="group">Group</SelectItem>
                        <SelectItem value="corporate">Corporate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="dateFrom">Date From</Label>
                    <Input type="date" />
                  </div>
                  <div>
                    <Label htmlFor="dateTo">Date To</Label>
                    <Input type="date" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button>Apply Filters</Button>
                  <Button variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Export to Excel
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Shareholding Details</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member #</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Number of Shares</TableHead>
                      <TableHead>Share Value</TableHead>
                      <TableHead>Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.client_number}</TableCell>
                        <TableCell>{member.full_name}</TableCell>
                        <TableCell>{member.phone_number || "—"}</TableCell>
                        <TableCell>{member.numberOfShares}</TableCell>
                        <TableCell>UGX {(member.share_value || 0).toLocaleString()}</TableCell>
                        <TableCell>UGX {(member.totalShareValue || 0).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
    </AppLayout>
  )
}
