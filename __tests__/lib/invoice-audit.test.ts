import {
  auditInvoiceInsert,
  auditInvoiceUpdate,
  invoiceAuditMeta,
  invoiceSnapshot,
} from "@/lib/audit/invoice-audit"
import { auditLogger } from "@/lib/audit/audit-logger"

jest.mock("@/lib/audit/audit-logger", () => ({
  auditLogger: {
    logInsert: jest.fn(),
    logUpdate: jest.fn(),
  },
}))

describe("invoice-audit", () => {
  const actor = {
    id: "staff-1",
    institution_id: "inst-1",
    branch_id: "branch-1",
  }
  const client = {} as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("invoiceAuditMeta prefers invoice branch over actor branch", () => {
    expect(invoiceAuditMeta(actor, "branch-2")).toEqual({ branch_id: "branch-2" })
    expect(invoiceAuditMeta(actor)).toEqual({ branch_id: "branch-1" })
  })

  it("invoiceSnapshot normalizes invoice fields", () => {
    expect(
      invoiceSnapshot({
        invoice_number: "INV-001",
        status: "sent",
        total_amount: 1000,
      }),
    ).toEqual({
      member_id: null,
      third_party_agent_id: null,
      invoice_number: "INV-001",
      invoice_date: null,
      invoice_due: null,
      subtotal: null,
      vat: null,
      total_amount: 1000,
      inwords: null,
      invoice_type: null,
      status: "sent",
      item_count: null,
    })
  })

  it("auditInvoiceInsert delegates to auditLogger", async () => {
    await auditInvoiceInsert(client, actor, "inv-1", { status: "draft" }, "branch-2")
    expect(auditLogger.logInsert).toHaveBeenCalledWith(
      "invoices",
      "inv-1",
      { status: "draft" },
      "inst-1",
      "staff-1",
      { branch_id: "branch-2" },
      client,
    )
  })

  it("auditInvoiceUpdate delegates to auditLogger", async () => {
    await auditInvoiceUpdate(
      client,
      actor,
      "inv-1",
      { status: "sent" },
      { status: "fully paid" },
      "branch-2",
    )
    expect(auditLogger.logUpdate).toHaveBeenCalledWith(
      "invoices",
      "inv-1",
      { status: "sent" },
      { status: "fully paid" },
      "inst-1",
      "staff-1",
      { branch_id: "branch-2" },
      client,
    )
  })
})
