export type FinanceSection = "bank" | "unclaimed" | "grants"

export type FinanceTabCounts = {
  bank: number
  unclaimed: number
  unclaimedOpen: number
  grants: number
}

export type BankAccountRow = {
  id: string
  bank_name: string
  bank_account_number: string
  total_amount: number
  branch_name: string
  updated_at: string
}

export type UnclaimedDepositRow = {
  id: string
  transaction_number: string
  amount: number
  mode: string
  date: string
  status: string
  assigned_to: string
  assigned_type: "Member" | "Client" | "—"
  notes: string
}

export type GrantRow = {
  id: string
  client_name: string
  total_amount: number
  available_balance: number
  branch_name: string
  updated_at: string
}
