export const EXPENSE_TYPES = [
  "Fixed-expenses",
  "Variable-expenses",
  "Capital-expenses",
  "Operating-expenses",
] as const

export type ExpenseType = (typeof EXPENSE_TYPES)[number]

export const EXPENSE_TYPE_OPTIONS = EXPENSE_TYPES.map((value) => ({
  value,
  label: value,
}))

export function isValidExpenseType(value: string): value is ExpenseType {
  return (EXPENSE_TYPES as readonly string[]).includes(value)
}
