import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  deletePdfTempFile,
  ensurePdfTempDir,
  getPdfTempRoot,
  sanitizePdfFilename,
  savePdfToTemp,
} from "@/lib/pdf/temp-store"

describe("pdf temp-store", () => {
  let previousDir: string | undefined

  beforeEach(async () => {
    previousDir = process.env.PDF_TEMP_DIR
    const dir = await mkdtemp(path.join(os.tmpdir(), "senteloans-pdf-test-"))
    process.env.PDF_TEMP_DIR = dir
  })

  afterEach(async () => {
    const dir = process.env.PDF_TEMP_DIR
    if (dir) await rm(dir, { recursive: true, force: true })
    if (previousDir === undefined) delete process.env.PDF_TEMP_DIR
    else process.env.PDF_TEMP_DIR = previousDir
  })

  it("sanitizes filenames", () => {
    expect(sanitizePdfFilename("INV 001.pdf")).toBe("INV_001.pdf")
    expect(sanitizePdfFilename("")).toBe("document.pdf")
  })

  it("writes and deletes a PDF in the temp folder", async () => {
    const buffer = Buffer.from("%PDF-1.4 test")
    const file = await savePdfToTemp({
      buffer,
      filename: "invoice-123.pdf",
      category: "invoices",
    })

    expect(file.filename).toBe("invoice-123.pdf")
    expect(file.absolutePath).toContain(path.join("invoices"))
    expect(getPdfTempRoot()).toBe(process.env.PDF_TEMP_DIR)

    const onDisk = await readFile(file.absolutePath)
    expect(onDisk.equals(buffer)).toBe(true)

    await deletePdfTempFile(file)
    await expect(readFile(file.absolutePath)).rejects.toThrow()
  })

  it("creates category subdirectories", async () => {
    const dir = await ensurePdfTempDir("reports")
    expect(dir).toContain(path.join("reports"))
  })
})
