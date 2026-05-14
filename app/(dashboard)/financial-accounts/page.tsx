"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Landmark } from "lucide-react";

export default function FinancialAccountsPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Financial Accounts</h1>
        <p className="text-muted-foreground mt-1">
          Treasury cash and bank accounts for your institution.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            Financial Accounts
          </CardTitle>
          <CardDescription>
            This section will list institution financial accounts, balances, and
            reconciliation. Connect APIs and UI here when ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No accounts loaded yet.
        </CardContent>
      </Card>
    </div>
  );
}
