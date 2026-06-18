import { savePdfToTemp } from "./temp-store"
import type { PdfTempCategory, PdfTempFile } from "./types"

/**
 * Generic helper: save any rendered PDF buffer to the temp folder.
 * Use category to organize files (invoices, transactions, loans, reports, misc).
 */
export async function savePdfBufferToTemp(params: {
  buffer: Buffer
  filename: string
  category?: PdfTempCategory
}): Promise<PdfTempFile> {
  return savePdfToTemp({
    buffer: params.buffer,
    filename: params.filename,
    category: params.category || "misc",
  })
}
