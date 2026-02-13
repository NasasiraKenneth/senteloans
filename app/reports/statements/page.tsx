"use client"
import { useState, useEffect } from "react"
import AppLayout from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, Search, User } from "lucide-react"

interface ClientRow {
  id: string
  client_number: string
  full_name: string
  phone_number?: string
}

export default function StatementsPage() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")

  const loadClients = (q?: string) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set("search", q)
    params.set("limit", "50")
    fetch(`/api/institution/clients?${params}`)
      .then((r) => r.json())
      .then((data) => setClients(data.clients ?? []))
      .catch(() => setClients([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadClients()
  }, [])

  return (
    <AppLayout>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Member Statements</h1>
          <p className="text-muted-foreground">Generate and download member account statements</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Member
            </CardTitle>
            <CardDescription>Search for a member to generate their statement</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <Label htmlFor="memberSearch">Member Name or ID</Label>
                <Input
                  id="memberSearch"
                  placeholder="Enter member name or ID..."
                  className="w-full"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="statementType">Statement Type</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select statement type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Account Statement</SelectItem>
                    <SelectItem value="savings">Savings Statement</SelectItem>
                    <SelectItem value="loans">Loan Statement</SelectItem>
                    <SelectItem value="shares">Share Statement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="period">Period</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1month">Last 1 Month</SelectItem>
                    <SelectItem value="3months">Last 3 Months</SelectItem>
                    <SelectItem value="6months">Last 6 Months</SelectItem>
                    <SelectItem value="1year">Last 1 Year</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => loadClients(search || undefined)}>
                <Search className="h-4 w-4 mr-2" />
                Search Member
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Search Results
            </CardTitle>
            <CardDescription>Select a member to generate their statement</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : (
              <div className="space-y-4">
                {clients.slice(0, 10).map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{member.full_name}</div>
                      <div className="text-sm text-muted-foreground">
                        ID: {member.client_number} • Phone: {member.phone_number || "—"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        PDF Statement
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Excel Statement
                      </Button>
                    </div>
                  </div>
                ))}
                {clients.length === 0 && !loading && (
                  <p className="text-muted-foreground">No members found.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
    </AppLayout>
  )
}
