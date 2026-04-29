"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, Users, CreditCard, PiggyBank, AlertTriangle, FileText, ScrollText, UserCog, Receipt } from "lucide-react"

const performanceMetrics = [
  { label: "Portfolio Growth", value: "+12.5%", description: "vs previous period" },
  { label: "Member Retention", value: "94.2%", description: "Active member rate" },
  { label: "Loan Recovery", value: "91.5%", description: "Collection efficiency" },
  { label: "Savings Growth", value: "+8.3%", description: "Monthly increase" },
]

export default function ReportsPage() {
  return (
    <>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Reports & Analytics</h1>
          <p className="text-muted-foreground">
            Comprehensive financial insights and detailed reporting for better decision making
          </p>
        </div>

        {/* Key Performance Indicators */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Portfolio Growth</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+12.5%</div>
              <p className="text-xs text-muted-foreground">vs previous period</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Member Retention</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">94.2%</div>
              <p className="text-xs text-muted-foreground">Active member rate</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Loan Recovery</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">91.5%</div>
              <p className="text-xs text-muted-foreground">Collection efficiency</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Savings Growth</CardTitle>
              <PiggyBank className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+8.3%</div>
              <p className="text-xs text-muted-foreground">Monthly increase</p>
            </CardContent>
          </Card>
        </div>

        {/* Performance Summary */}
        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Performance Summary</CardTitle>
              <CardDescription>Key metrics and alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Active Loans</span>
                <Badge variant="secondary">105 loans</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Overdue Loans</span>
                <Badge variant="destructive">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  12 loans
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Average Loan Size</span>
                <span className="text-sm font-medium">UGX 1.2M</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Member Satisfaction</span>
                <Badge variant="default">4.2/5.0</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Operational Efficiency</span>
                <Badge variant="secondary">87%</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Risk Assessment</CardTitle>
              <CardDescription>Portfolio risk distribution</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Low Risk</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-green-200 rounded-full">
                    <div className="w-[65%] h-full bg-green-500 rounded-full"></div>
                  </div>
                  <span className="text-sm font-medium">65%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Medium Risk</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-yellow-200 rounded-full">
                    <div className="w-[25%] h-full bg-yellow-500 rounded-full"></div>
                  </div>
                  <span className="text-sm font-medium">25%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">High Risk</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-red-200 rounded-full">
                    <div className="w-[10%] h-full bg-red-500 rounded-full"></div>
                  </div>
                  <span className="text-sm font-medium">10%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Access to Report Types */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Quick Access to Reports
            </CardTitle>
            <CardDescription>Navigate to specific report sections using the sidebar menu</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
              <Button variant="outline" className="h-20 flex-col bg-transparent">
                <CreditCard className="h-6 w-6 mb-2" />
                <span className="text-sm">Loan Reports</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col bg-transparent">
                <PiggyBank className="h-6 w-6 mb-2" />
                <span className="text-sm">Savings Reports</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col bg-transparent">
                <TrendingUp className="h-6 w-6 mb-2" />
                <span className="text-sm">Share Reports</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col bg-transparent">
                <FileText className="h-6 w-6 mb-2" />
                <span className="text-sm">Statements</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col bg-transparent">
                <ScrollText className="h-6 w-6 mb-2" />
                <span className="text-sm">Sacco Loan Reports</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col bg-transparent">
                <Receipt className="h-6 w-6 mb-2" />
                <span className="text-sm">Invoice Reports</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col bg-transparent">
                <UserCog className="h-6 w-6 mb-2" />
                <span className="text-sm">Staff Audit Reports</span>
              </Button>
            </div>
          </CardContent>
        </Card>
    </>
  )
}
