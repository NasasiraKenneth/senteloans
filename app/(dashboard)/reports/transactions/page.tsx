
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, Calendar } from "lucide-react"

export default function TransactionReportsPage() {
  return (
    <>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Transaction Reports</h1>
          <p className="text-muted-foreground">Download daily transaction reports for all members</p>
        </div>

        {/* Daily Transaction Reports */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Daily Transaction Reports
            </CardTitle>
            <CardDescription>Generate transaction reports for specific dates or periods</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <Label htmlFor="reportDate">Report Date</Label>
                <Input id="reportDate" type="date" defaultValue={new Date().toISOString().split("T")[0]} />
              </div>
              <div>
                <Label htmlFor="reportType">Report Type</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select report type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Transactions</SelectItem>
                    <SelectItem value="deposits">Deposits Only</SelectItem>
                    <SelectItem value="withdrawals">Withdrawals Only</SelectItem>
                    <SelectItem value="transfers">Transfers Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="format">Export Format</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button>
                <Download className="h-4 w-4 mr-2" />
                Generate Daily Report
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Member-Specific Reports */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Member-Specific Transaction Reports</CardTitle>
            <CardDescription>Generate transaction reports for individual members</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <Label htmlFor="memberSelect">Select Member</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sarah">Sarah Nakamya</SelectItem>
                    <SelectItem value="david">David Ssemakula</SelectItem>
                    <SelectItem value="grace">Grace Namugga</SelectItem>
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
              <div>
                <Label htmlFor="memberFormat">Format</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button>
                <Download className="h-4 w-4 mr-2" />
                Generate Member Report
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Reports */}
        <Card>
          <CardHeader>
            <CardTitle>Bulk Transaction Reports</CardTitle>
            <CardDescription>Generate comprehensive reports for multiple members or date ranges</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <Label htmlFor="bulkPeriod">Report Period</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="quarter">This Quarter</SelectItem>
                    <SelectItem value="year">This Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="bulkType">Transaction Type</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Transactions</SelectItem>
                    <SelectItem value="savings">Savings Transactions</SelectItem>
                    <SelectItem value="loans">Loan Transactions</SelectItem>
                    <SelectItem value="shares">Share Transactions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="bulkFormat">Export Format</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button>
                <Download className="h-4 w-4 mr-2" />
                Generate Bulk Report
              </Button>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Schedule Automated Report
              </Button>
            </div>
          </CardContent>
        </Card>
    </>
  )
}
