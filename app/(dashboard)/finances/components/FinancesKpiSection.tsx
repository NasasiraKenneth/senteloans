"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type FinancesKpiStats = {
  bankTotal: number
  bankAccountCount: number
  unclaimedOpenAmount: number
  unclaimedOpenCount: number
  unclaimedTotalCount: number
  grantsAvailable: number
  grantsTotalAllocated: number
  grantsUnclaimed: number
  grantCount: number
  float: {
    cash: number
    mobileMoney: number
    bank: number
    available: number
  }
}

type FinancesKpiSectionProps = {
  stats: FinancesKpiStats
  formatCurrency: (amount: number) => string
}

export default function FinancesKpiSection({ stats, formatCurrency }: FinancesKpiSectionProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-balance">Finances</h2>
        <p className="text-muted-foreground text-pretty">
          Treasury bank accounts, unclaimed deposits, client grants, and branch float.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Bank total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.bankTotal)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Unclaimed deposits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.unclaimedOpenAmount)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Grants available</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.grantsAvailable)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Grants unclaimed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.grantsUnclaimed)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Total allocated − available balance</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
