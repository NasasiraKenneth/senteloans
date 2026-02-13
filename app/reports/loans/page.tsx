"use client"

import { useEffect, useState } from "react"
import AppLayout from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Download, Filter } from "lucide-react"

interface LoanRow {
  id: string
  application_id: string
  memberName: string
  principal_amount: number
  outstanding_balance: number
  status: string
  application_date?: string
}

export default function LoanReportsPage() {
  const [items, setItems] = useState<LoanRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/institution/loans?pageSize=500", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { items: [] })
      .then((d) => { setItems(d.items || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const totalLoans = items.length
  const activeLoans = items.filter((l) => l.status === "Disbursed").length
  const overdueLoans = items.filter((l) => l.status === "Defaulted").length
  const totalOutstanding = items.reduce((sum, l) => sum + Number(l.outstanding_balance || 0), 0)

  if (loading) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading loan reports...</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Loan Reports</h1>
          <p className="text-muted-foreground">Comprehensive loan portfolio analysis and reporting</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Loans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalLoans}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Active Loans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{activeLoans}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Overdue Loans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{overdueLoans}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">UGX {(totalOutstanding || 0).toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Export */}
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
                <Label htmlFor="status">Loan Status</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="officer">Loan Officer</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="All Officers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Officers</SelectItem>
                    <SelectItem value="john">John Doe</SelectItem>
                    <SelectItem value="jane">Jane Smith</SelectItem>
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
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export to PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Loan Reports Table */}
        <Card>
          <CardHeader>
            <CardTitle>Loan Portfolio Details</CardTitle>
            <CardDescription>Detailed view of all loans with key metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loan ID</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Officer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((loan) => (
                  <TableRow key={loan.id}>
                    <TableCell className="font-medium">{loan.application_id}</TableCell>
                    <TableCell>{loan.memberName}</TableCell>
                    <TableCell>UGX {(loan.principal_amount || 0).toLocaleString()}</TableCell>
                    <TableCell>UGX {(loan.outstanding_balance || 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          loan.status === "Disbursed"
                            ? "default"
                            : loan.status === "Defaulted"
                              ? "destructive"
                              : loan.status === "Applied"
                                ? "secondary"
                                : "outline"
                        }
                      >
                        {loan.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{loan.application_date || "N/A"}</TableCell>
                    <TableCell>—</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
    </AppLayout>
  )
}
