import {
  getInvoicePaidAmount,
  getInvoicePaymentSummary,
  syncInvoiceStatusFromPayments,
} from "@/lib/invoices/invoice-payments"

describe("invoice-payments", () => {
  it("getInvoicePaidAmount sums payment rows", async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [{ total: "25000" }] }),
    } as any
    const paid = await getInvoicePaidAmount(client, "inv-1")
    expect(paid).toBe(25000)
  })

  it("getInvoicePaymentSummary computes outstanding", async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [{ total: "10000" }] }),
    } as any
    const summary = await getInvoicePaymentSummary(client, "inv-1", 50000)
    expect(summary.paid_amount).toBe(10000)
    expect(summary.outstanding).toBe(40000)
    expect(summary.is_fully_paid).toBe(false)
  })

  it("syncInvoiceStatusFromPayments sets paid when fully settled", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{ total_amount: "100", invoice_due: null, status: "sent" }],
      })
      .mockResolvedValueOnce({ rows: [{ total: "100" }] })
      .mockResolvedValueOnce({ rows: [] })
    const client = { query } as any
    const synced = await syncInvoiceStatusFromPayments(client, "inv-1")
    expect(synced.status).toBe("paid")
    expect(synced.outstanding).toBe(0)
    expect(query).toHaveBeenCalledTimes(3)
  })
})
