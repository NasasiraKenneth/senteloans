import {
  expandStatusFilter,
  formatInvoiceStatusLabel,
  canEditInvoice,
  canRecordInvoicePayment,
  getAllowedInvoiceStatusTransitions,
  getInvoiceEditBlockedReason,
  getInvoiceStatusNotificationKind,
  getInvoiceStatusTransitionBlockedReason,
  isInvoiceStatusTransitionAllowed,
  isDraftToSentTransition,
  isPaidInvoiceStatus,
  normalizeInvoiceStatus,
  normalizeTargetTypeFilter,
} from "@/lib/invoices/status"

describe("invoice status helpers", () => {
  it("maps legacy paid to fully paid", () => {
    expect(normalizeInvoiceStatus("paid")).toBe("fully paid")
    expect(normalizeInvoiceStatus("PAID")).toBe("fully paid")
  })

  it("expandStatusFilter includes both paid variants", () => {
    expect(expandStatusFilter("paid")).toEqual(["paid", "fully paid"])
    expect(expandStatusFilter("draft")).toEqual(["draft"])
  })

  it("isPaidInvoiceStatus recognizes paid and fully paid", () => {
    expect(isPaidInvoiceStatus("paid")).toBe(true)
    expect(isPaidInvoiceStatus("fully paid")).toBe(true)
    expect(isPaidInvoiceStatus("sent")).toBe(false)
  })

  it("formatInvoiceStatusLabel humanizes payment states", () => {
    expect(formatInvoiceStatusLabel("fully paid")).toBe("Fully Paid")
    expect(formatInvoiceStatusLabel("partially paid")).toBe("Partially Paid")
  })

  it("normalizeTargetTypeFilter accepts client alias", () => {
    expect(normalizeTargetTypeFilter("client")).toBe("third_party_agent")
    expect(normalizeTargetTypeFilter("member")).toBe("member")
  })

  it("canEditInvoice allows only draft", () => {
    expect(canEditInvoice("draft")).toBe(true)
    expect(canEditInvoice("sent")).toBe(false)
    expect(canEditInvoice("fully paid")).toBe(false)
  })

  it("getInvoiceEditBlockedReason explains non-draft edit blocks", () => {
    expect(getInvoiceEditBlockedReason("draft")).toBeNull()
    expect(getInvoiceEditBlockedReason("sent")).toContain("sent")
  })

  it("enforces status transition rules", () => {
    expect(getAllowedInvoiceStatusTransitions("sent")).toEqual([
      "overdue",
      "cancelled",
    ])
    expect(getAllowedInvoiceStatusTransitions("cancelled")).toEqual([])
    expect(getAllowedInvoiceStatusTransitions("fully paid")).toEqual([])
    expect(getAllowedInvoiceStatusTransitions("partially paid")).toEqual([
      "overdue",
      "cancelled",
    ])

    expect(isInvoiceStatusTransitionAllowed("sent", "draft")).toBe(false)
    expect(isInvoiceStatusTransitionAllowed("overdue", "sent")).toBe(false)
    expect(isInvoiceStatusTransitionAllowed("partially paid", "cancelled")).toBe(
      true,
    )
    expect(isInvoiceStatusTransitionAllowed("partially paid", "overdue")).toBe(true)
    expect(isInvoiceStatusTransitionAllowed("partially paid", "sent")).toBe(false)

    expect(getInvoiceStatusTransitionBlockedReason("sent", "draft")).toContain(
      "draft",
    )
    expect(getInvoiceStatusTransitionBlockedReason("cancelled", "sent")).toContain(
      "Cancelled",
    )
  })

  it("isDraftToSentTransition detects draft to sent only", () => {
    expect(isDraftToSentTransition("draft", "sent")).toBe(true)
    expect(isDraftToSentTransition("sent", "overdue")).toBe(false)
    expect(isDraftToSentTransition("draft", "cancelled")).toBe(false)
  })

  it("getInvoiceStatusNotificationKind maps transitions to side effects", () => {
    expect(getInvoiceStatusNotificationKind("draft", "sent")).toBe("sent")
    expect(getInvoiceStatusNotificationKind("sent", "cancelled")).toBe("cancelled")
    expect(getInvoiceStatusNotificationKind("partially paid", "overdue")).toBe(
      "overdue",
    )
    expect(getInvoiceStatusNotificationKind("sent", "overdue")).toBe("overdue")
    expect(getInvoiceStatusNotificationKind("sent", "sent")).toBeNull()
  })

  it("canRecordInvoicePayment allows open sent/overdue/partial invoices", () => {
    expect(
      canRecordInvoicePayment({
        status: "sent",
        total_amount: 100000,
        paid_amount: 20000,
      }),
    ).toBe(true)
    expect(
      canRecordInvoicePayment({
        status: "draft",
        total_amount: 100000,
        outstanding: 100000,
      }),
    ).toBe(false)
    expect(
      canRecordInvoicePayment({
        status: "fully paid",
        total_amount: 100000,
        outstanding: 0,
      }),
    ).toBe(false)
  })
})
