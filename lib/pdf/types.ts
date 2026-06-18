export type PdfTempCategory = "invoices" | "transactions" | "loans" | "reports" | "misc"

export type PdfTempFile = {
  /** Absolute path on disk */
  absolutePath: string
  /** Filename only (safe for Content-Disposition) */
  filename: string
  /** Category subfolder under the PDF temp root */
  category: PdfTempCategory
}

export type SavePdfToTempInput = {
  buffer: Buffer
  filename: string
  category?: PdfTempCategory
}
