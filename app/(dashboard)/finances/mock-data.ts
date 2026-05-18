import type { BankAccountRow, GrantRow, UnclaimedDepositRow } from "./types"

export const MOCK_BANK_ACCOUNTS: BankAccountRow[] = [
  {
    id: "ba-1",
    bank_name: "Stanbic Bank",
    bank_account_number: "9030012345678",
    total_amount: 48_500_000,
    branch_name: "Kampala Main",
    updated_at: "2026-05-10T14:22:00Z",
  },
  {
    id: "ba-2",
    bank_name: "Centenary Bank",
    bank_account_number: "3100123456",
    total_amount: 12_750_000,
    branch_name: "Entebbe",
    updated_at: "2026-05-08T09:15:00Z",
  },
]

export const MOCK_UNCLAIMED: UnclaimedDepositRow[] = [
  {
    id: "ud-1",
    transaction_number: "UD-2026-0042",
    amount: 250_000,
    mode: "Mobile Money",
    date: "2026-05-12",
    status: "unclaimed",
    assigned_to: "—",
    assigned_type: "Member",
    notes: "Reference mismatch on MTN deposit",
  },
  {
    id: "ud-2",
    transaction_number: "UD-2026-0038",
    amount: 1_200_000,
    mode: "Bank Transfer",
    date: "2026-05-09",
    status: "unclaimed",
    assigned_to: "Acme Supplies Ltd",
    assigned_type: "Client",
    notes: "Awaiting client confirmation",
  },
  {
    id: "ud-3",
    transaction_number: "UD-2026-0031",
    amount: 85_000,
    mode: "Cash",
    date: "2026-05-05",
    status: "claimed",
    assigned_to: "Jane Nakato",
    assigned_type: "Member",
    notes: "Matched to savings account",
  },
]

export const MOCK_GRANTS: GrantRow[] = [
  {
    id: "gr-1",
    client_name: "Greenfield NGO",
    total_amount: 50_000_000,
    available_balance: 32_400_000,
    branch_name: "Kampala Main",
    updated_at: "2026-05-11T11:00:00Z",
  },
  {
    id: "gr-2",
    client_name: "Rural Health Partners",
    total_amount: 18_000_000,
    available_balance: 18_000_000,
    branch_name: "Mbarara",
    updated_at: "2026-05-01T08:30:00Z",
  },
]

export const MOCK_FLOAT = {
  cash: 4_200_000,
  mobileMoney: 1_850_000,
  bank: 9_400_000,
  available: 14_100_000,
}
