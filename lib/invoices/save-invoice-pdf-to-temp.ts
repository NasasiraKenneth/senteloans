import type { PoolClient } from "pg"
import { savePdfToTemp } from "@/lib/pdf/temp-store"
import type { PdfTempFile } from "@/lib/pdf/types"
import { generateInvoicePdfBuffer } from "./generate-invoice-pdf-buffer"

export type SaveInvoicePdfToTempInput = {
  invoiceId: string
  institutionId: string
  branchId?: string | null
}

export type SaveInvoicePdfToTempResult =
  | { ok: true; file: PdfTempFile; invoiceNumber: string }
  | { ok: false; error: string }

/**
 * Generate an invoice PDF and persist it under tmp/pdfs/invoices for attachment use.
 */
export async function saveInvoicePdfToTemp(
  client: PoolClient,
  input: SaveInvoicePdfToTempInput,
): Promise<SaveInvoicePdfToTempResult> {
  const generated = await generateInvoicePdfBuffer(client, input)
  if (!generated.ok) return generated

  const file = await savePdfToTemp({
    buffer: generated.buffer,
    filename: `${generated.invoiceNumber.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`,
    category: "invoices",
  })

  return { ok: true, file, invoiceNumber: generated.invoiceNumber }
}
