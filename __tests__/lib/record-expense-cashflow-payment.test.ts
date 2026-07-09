import {
  isEditableExpenseCashflowStatus,
  isExpenseCashflowPaymentRecordable,
  isExpenseCashflowUnpaidStatus,
  isSettledExpenseCashflowStatus,
  mapExpensePaymentSettlementFailure,
  normalizeExpenseCashflowPaymentStatus,
} from "@/lib/expenses/record-expense-cashflow-payment"
import { PaymentSettlementFailure } from "@/lib/finances/settle-payment-mode"

describe("normalizeExpenseCashflowPaymentStatus", () => {
  it("defaults empty to unpaid", () => {
    expect(normalizeExpenseCashflowPaymentStatus(undefined)).toBe("unpaid")
    expect(normalizeExpenseCashflowPaymentStatus("")).toBe("unpaid")
  })

  it("accepts fully paid variants", () => {
    expect(normalizeExpenseCashflowPaymentStatus("fully_paid")).toBe("fully_paid")
    expect(normalizeExpenseCashflowPaymentStatus("fully paid")).toBe("fully_paid")
    expect(normalizeExpenseCashflowPaymentStatus("paid")).toBe("fully_paid")
  })

  it("rejects unknown values", () => {
    expect(normalizeExpenseCashflowPaymentStatus("partial")).toBeNull()
  })
})

describe("isExpenseCashflowUnpaidStatus", () => {
  it("recognizes unpaid only", () => {
    expect(isExpenseCashflowUnpaidStatus("Unpaid")).toBe(true)
    expect(isExpenseCashflowUnpaidStatus("unpaid")).toBe(true)
    expect(isExpenseCashflowUnpaidStatus("Partially Paid")).toBe(false)
    expect(isExpenseCashflowUnpaidStatus("Fully Paid")).toBe(false)
  })
})

describe("isExpenseCashflowPaymentRecordable", () => {
  it("allows unpaid and partially paid statuses", () => {
    expect(isExpenseCashflowPaymentRecordable("Unpaid")).toBe(true)
    expect(isExpenseCashflowPaymentRecordable("Partially Paid")).toBe(true)
    expect(isExpenseCashflowPaymentRecordable("Part Paid")).toBe(true)
    expect(isExpenseCashflowPaymentRecordable("partially_paid")).toBe(true)
    expect(isExpenseCashflowPaymentRecordable("Fully Paid")).toBe(false)
    expect(isExpenseCashflowPaymentRecordable("Completed")).toBe(false)
  })
})

describe("isEditableExpenseCashflowStatus", () => {
  it("recognizes unpaid and legacy pending as editable", () => {
    expect(isEditableExpenseCashflowStatus("Unpaid")).toBe(true)
    expect(isEditableExpenseCashflowStatus("Pending")).toBe(true)
    expect(isEditableExpenseCashflowStatus("Fully Paid")).toBe(false)
  })
})

describe("isSettledExpenseCashflowStatus", () => {
  it("recognizes completed and fully paid statuses", () => {
    expect(isSettledExpenseCashflowStatus("Completed")).toBe(true)
    expect(isSettledExpenseCashflowStatus("Fully Paid")).toBe(true)
    expect(isSettledExpenseCashflowStatus("Pending")).toBe(false)
  })
})

describe("mapExpensePaymentSettlementFailure", () => {
  it("maps insufficient bank balance", () => {
    expect(
      mapExpensePaymentSettlementFailure(
        new PaymentSettlementFailure("insufficient_bank_balance"),
      ),
    ).toBe("bank_account_insufficient_funds")
  })
})
