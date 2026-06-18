import type { PoolClient } from "pg"
import { savePdfToTemp } from "@/lib/pdf/temp-store"
import type { PdfTempFile } from "@/lib/pdf/types"
import { generateTransactionPdfBuffer } from "./generate-transaction-pdf-buffer"

export type SaveTransactionReceiptToTempInput = {
  transactionId: string
  institutionId: string
  branchId?: string | null
}

export type SaveTransactionReceiptToTempResult =
  | { ok: true; file: PdfTempFile; transactionNumber: string }
  | { ok: false; error: string }

/**
 * Generate a transaction receipt PDF and persist it under tmp/pdfs/transactions.
 */
export async function saveTransactionReceiptToTemp(
  client: PoolClient,
  input: SaveTransactionReceiptToTempInput,
): Promise<SaveTransactionReceiptToTempResult> {
  const generated = await generateTransactionPdfBuffer(client, input)
  if (!generated.ok) return generated

  const safeNumber = generated.transactionNumber.replace(/[^a-zA-Z0-9._-]/g, "_")
  const file = await savePdfToTemp({
    buffer: generated.buffer,
    filename: `receipt-${safeNumber}.pdf`,
    category: "transactions",
  })

  return { ok: true, file, transactionNumber: generated.transactionNumber }
}
