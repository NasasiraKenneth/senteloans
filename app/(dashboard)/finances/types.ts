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

export type LinkedTransactionSummary = {
  id: string
  transaction_number: string
  type: string
  amount: number
  mode: string
  date: string
  reference_number: string
  description: string
}

export type UnclaimedDepositRow = {
  id: string
  unclaimed_deposit_number: string
  transaction_number: string
  amount: number
  mode: string
  date: string
  status: string
  assigned_to: string
  assigned_type: "Member" | "Third Party Agent" | "—"
  notes: string
  branch_name: string
  created_at: string
  updated_at: string
  created_by_name: string
  modified_by_name: string
  linked_transaction: LinkedTransactionSummary | null
}

export type GrantRow = {
  id: string
  third_party_agent_name: string
  total_amount: number
  available_balance: number
  remaining_amount: number
  percentage_received: number
  branch_name: string
  created_at: string
  updated_at: string
}
