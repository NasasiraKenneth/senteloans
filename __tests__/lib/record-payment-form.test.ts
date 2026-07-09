import {
  getPartialPaymentAmountError,
  validateRecordPaymentForm,
} from "@/app/(dashboard)/expenses/components/forms/recordpaymentForm"

describe("getPartialPaymentAmountError", () => {
  it("rejects amounts above outstanding", () => {
    expect(getPartialPaymentAmountError("1500", 1000, (n) => `UGX ${n}`)).toBe(
      "Amount cannot exceed the outstanding balance of UGX 1000",
    )
  })

  it("allows amounts within outstanding", () => {
    expect(getPartialPaymentAmountError("500", 1000)).toBeNull()
  })

  it("ignores empty input", () => {
    expect(getPartialPaymentAmountError("", 1000)).toBeNull()
  })
})

describe("validateRecordPaymentForm", () => {
  const base = {
    paymentType: "partial" as const,
    amountInput: "1500",
    outstanding: 1000,
    mode: "Cash",
    paymentDate: "2026-07-03",
    bankAccountId: "",
    referenceNumber: "",
    transactionChargesInput: "",
  }

  it("blocks partial payments above outstanding", () => {
    expect(validateRecordPaymentForm(base)).toBe(
      "Amount cannot exceed the outstanding balance of 1000",
    )
  })
})
