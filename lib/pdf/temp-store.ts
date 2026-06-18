import { mkdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { PdfTempCategory, PdfTempFile, SavePdfToTempInput } from "./types"

const DEFAULT_ROOT = path.join(process.cwd(), "tmp", "pdfs")

/** Root directory for short-lived PDF files (email attachments, etc.). */
export function getPdfTempRoot(): string {
  const configured = String(process.env.PDF_TEMP_DIR || "").trim()
  return configured || DEFAULT_ROOT
}

export function sanitizePdfFilename(name: string): string {
  const base = String(name || "document")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
  const withExt = base.toLowerCase().endsWith(".pdf") ? base : `${base || "document"}.pdf`
  return withExt.slice(0, 180)
}

export async function ensurePdfTempDir(category: PdfTempCategory = "misc"): Promise<string> {
  const dir = path.join(getPdfTempRoot(), category)
  await mkdir(dir, { recursive: true })
  return dir
}

/**
 * Write a PDF buffer to the temp folder. Returns paths for attachment use.
 * Files are not auto-deleted — callers must call `deletePdfTempFile` when done.
 */
export async function savePdfToTemp(input: SavePdfToTempInput): Promise<PdfTempFile> {
  const category = input.category || "misc"
  const dir = await ensurePdfTempDir(category)
  const safeName = sanitizePdfFilename(input.filename)
  const uniqueName = `${randomUUID()}-${safeName}`
  const absolutePath = path.join(dir, uniqueName)
  await writeFile(absolutePath, input.buffer)
  return { absolutePath, filename: safeName, category }
}

export async function deletePdfTempFile(file: Pick<PdfTempFile, "absolutePath">): Promise<void> {
  try {
    await unlink(file.absolutePath)
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err?.code !== "ENOENT") throw e
  }
}

export async function deletePdfTempFiles(files: Array<Pick<PdfTempFile, "absolutePath">>): Promise<void> {
  await Promise.all(files.map((f) => deletePdfTempFile(f)))
}
