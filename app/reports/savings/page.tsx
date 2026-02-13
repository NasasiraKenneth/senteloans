"use client"
import { useState, useEffect } from "react"
import AppLayout from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Download, Filter } from "lucide-react"

interface SavingsItem {
  id: string
  account_number: string
  client_name: string
  account_type: string
  available_balance?: number
  total_balance?: number
  status: string
  open_date: string
}

export default function SavingsReportsPage() {
  const [items, setItems] = useState<SavingsItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/institution/savings?limit=500")
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? [])
        setTotal(data.total ?? 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const totalAccounts = items.length
  const activeAccounts = items.filter((a) => a.status === "Active").length
  const totalBalance = items.reduce((sum, a) => sum + Number(a.total_balance || a.available_balance || 0), 0)
  const avgBalance = totalAccounts > 0 ? totalBalance / totalAccounts : 0

  return (
    <AppLayout>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Savings Reports</h1>
          <p className="text-muted-foreground">Comprehensive savings portfolio analysis and reporting</p>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Total Accounts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalAccounts}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Active Accounts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{activeAccounts}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">UGX {(totalBalance || 0).toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Average Balance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">UGX {Math.round(avgBalance || 0).toLocaleString()}</div>
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
                    <Label htmlFor="accountType">Account Type</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="voluntary">Voluntary Savings</SelectItem>
                        <SelectItem value="fixed">Fixed Deposit</SelectItem>
                        <SelectItem value="shares">Shares</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="All Statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="dormant">Dormant</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
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

            <Card>
              <CardHeader>
                <CardTitle>Savings Portfolio Details</CardTitle>
                <CardDescription>Detailed view of all savings accounts</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account Number</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead>Account Type</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Open Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.account_number}</TableCell>
                        <TableCell>{account.client_name}</TableCell>
                        <TableCell>{account.account_type}</TableCell>
                        <TableCell>UGX {(Number(account.total_balance ?? account.available_balance ?? 0)).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              account.status === "Active"
                                ? "default"
                                : account.status === "Dormant"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {account.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{account.open_date}</TableCell>
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
