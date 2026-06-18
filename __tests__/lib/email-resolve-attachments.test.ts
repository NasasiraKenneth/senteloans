jest.mock("@/lib/invoices/save-invoice-pdf-to-temp", () => ({
  saveInvoicePdfToTemp: jest.fn(),
}))

jest.mock("@/lib/transactions/save-transaction-receipt-to-temp", () => ({
  saveTransactionReceiptToTemp: jest.fn(),
}))

import { readFile, writeFile, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { saveInvoicePdfToTemp } from "@/lib/invoices/save-invoice-pdf-to-temp"
import { saveTransactionReceiptToTemp } from "@/lib/transactions/save-transaction-receipt-to-temp"
import { resolveEmailAttachments } from "@/lib/email/resolve-attachments"

const saveInvoicePdfToTempMock = saveInvoicePdfToTemp as jest.Mock
const saveTransactionReceiptToTempMock = saveTransactionReceiptToTemp as jest.Mock

describe("resolveEmailAttachments", () => {
  const client = {} as import("pg").PoolClient
  const tmpDir = path.join(process.cwd(), "tmp", "pdfs", "test-attachments")

  beforeEach(async () => {
    jest.clearAllMocks()
    await mkdir(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("returns empty when no attachment specs", async () => {
    const result = await resolveEmailAttachments(client, {
      to: "a@b.com",
      subject: "Hi",
      template: "email.test",
      context: { institutionId: "inst-1", branchId: "branch-1" },
    })
    expect(result.attachments).toEqual([])
    expect(result.tempFiles).toEqual([])
  })

  it("resolves invoice attachments from temp files", async () => {
    const absolutePath = path.join(tmpDir, "invoice.pdf")
    const pdfBytes = Buffer.from("%PDF-invoice")
    await writeFile(absolutePath, pdfBytes)

    saveInvoicePdfToTempMock.mockResolvedValue({
      ok: true,
      file: { absolutePath, filename: "INV-001.pdf", category: "invoices" },
      invoiceNumber: "INV-001",
    })

    const result = await resolveEmailAttachments(client, {
      to: "a@b.com",
      subject: "Invoice",
      template: "member.invoice",
      attachmentSpecs: [{ kind: "invoice", invoiceId: "inv-1" }],
      context: { institutionId: "inst-1", branchId: "branch-1" },
    })

    expect(saveInvoicePdfToTempMock).toHaveBeenCalledWith(client, {
      invoiceId: "inv-1",
      institutionId: "inst-1",
      branchId: "branch-1",
    })
    expect(result.attachments).toHaveLength(1)
    expect(result.attachments[0].filename).toBe("INV-001.pdf")
    expect(result.attachments[0].content.equals(pdfBytes)).toBe(true)
    expect(result.tempFiles).toHaveLength(1)
  })

  it("resolves receipt attachments from temp files", async () => {
    const absolutePath = path.join(tmpDir, "receipt.pdf")
    const pdfBytes = Buffer.from("%PDF-receipt")
    await writeFile(absolutePath, pdfBytes)

    saveTransactionReceiptToTempMock.mockResolvedValue({
      ok: true,
      file: { absolutePath, filename: "receipt-TXN-001.pdf", category: "transactions" },
      transactionNumber: "TXN-001",
    })

    const result = await resolveEmailAttachments(client, {
      to: "a@b.com",
      subject: "Payment received",
      template: "membership_fee.paid",
      attachmentSpecs: [{ kind: "receipt", transactionId: "tx-1" }],
      context: { institutionId: "inst-1", branchId: "branch-1" },
    })

    expect(saveTransactionReceiptToTempMock).toHaveBeenCalledWith(client, {
      transactionId: "tx-1",
      institutionId: "inst-1",
      branchId: "branch-1",
    })
    expect(result.attachments).toHaveLength(1)
    expect(result.attachments[0].filename).toBe("receipt-TXN-001.pdf")
    expect(result.attachments[0].content.equals(await readFile(absolutePath))).toBe(true)
  })

  it("skips failed receipt generation without throwing", async () => {
    saveTransactionReceiptToTempMock.mockResolvedValue({ ok: false, error: "transaction_not_found" })

    const result = await resolveEmailAttachments(client, {
      to: "a@b.com",
      subject: "Payment received",
      template: "membership_fee.paid",
      attachmentSpecs: [{ kind: "receipt", transactionId: "missing" }],
      context: { institutionId: "inst-1", branchId: "branch-1" },
    })

    expect(result.attachments).toEqual([])
    expect(result.tempFiles).toEqual([])
  })
})
