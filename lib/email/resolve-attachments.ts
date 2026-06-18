import { readFile } from "node:fs/promises"
import type { PoolClient } from "pg"
import type { EmailJobData } from "@/queues/email.queue"
import { saveInvoicePdfToTemp } from "@/lib/invoices/save-invoice-pdf-to-temp"
import { saveTransactionReceiptToTemp } from "@/lib/transactions/save-transaction-receipt-to-temp"
import { deletePdfTempFiles } from "@/lib/pdf/temp-store"
import type { PdfTempFile } from "@/lib/pdf/types"

export type ResolvedEmailAttachment = {
  filename: string
  content: Buffer
}

export type ResolveEmailAttachmentsResult = {
  attachments: ResolvedEmailAttachment[]
  tempFiles: PdfTempFile[]
}

/**
 * Build PDF attachments for an email job.
 *
 * Writes each PDF to tmp/pdfs first, loads the bytes into memory for providers,
 * and returns temp file handles. The sender must call cleanupEmailAttachmentFiles
 * only after the email has been sent (see sender.ts finally block).
 */
export async function resolveEmailAttachments(
  client: PoolClient,
  job: EmailJobData,
): Promise<ResolveEmailAttachmentsResult> {
  const specs = job.attachmentSpecs || []
  if (specs.length === 0) return { attachments: [], tempFiles: [] }

  const attachments: ResolvedEmailAttachment[] = []
  const tempFiles: PdfTempFile[] = []
  const institutionId = String(job.context?.institutionId || "").trim()
  const branchId = String(job.context?.branchId || "").trim() || null

  for (const spec of specs) {
    if (spec.kind === "invoice") {
      const invoiceId = String(spec.invoiceId || "").trim()
      if (!invoiceId || !institutionId) continue

      try {
        const saved = await saveInvoicePdfToTemp(client, {
          invoiceId,
          institutionId,
          branchId,
        })
        if (!saved.ok) continue

        tempFiles.push(saved.file)
        const content = await readFile(saved.file.absolutePath)
        attachments.push({
          filename: saved.file.filename,
          content,
        })
      } catch {
        // PDF attachment is best-effort — still send the email body.
        continue
      }
    }

    if (spec.kind === "receipt") {
      const transactionId = String(spec.transactionId || "").trim()
      if (!transactionId || !institutionId) continue

      try {
        const saved = await saveTransactionReceiptToTemp(client, {
          transactionId,
          institutionId,
          branchId,
        })
        if (!saved.ok) continue

        tempFiles.push(saved.file)
        const content = await readFile(saved.file.absolutePath)
        attachments.push({
          filename: saved.file.filename,
          content,
        })
      } catch {
        // PDF attachment is best-effort — still send the email body.
        continue
      }
    }
  }

  return { attachments, tempFiles }
}

export async function cleanupEmailAttachmentFiles(
  tempFiles: Array<Pick<PdfTempFile, "absolutePath">>,
): Promise<void> {
  if (tempFiles.length === 0) return
  await deletePdfTempFiles(tempFiles)
}
