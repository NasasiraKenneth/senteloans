"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReceiptText } from "lucide-react";

export default function ExpensesPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
        <p className="text-muted-foreground mt-1">
          Record and approve operational expenses by branch and category.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-primary" />
            Expenses
          </CardTitle>
          <CardDescription>
            Backed by{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              senteloans_expenses
            </code>{" "}
            (institution, branch, category, amount, payment method, status,
            approval workflow, optional member/client links).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Expense listing and forms will be wired here. Ensure category seed data
          exists for{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            senteloans_expense_categories
          </code>{" "}
          before creating rows.
        </CardContent>
      </Card>
    </div>
  );
}
