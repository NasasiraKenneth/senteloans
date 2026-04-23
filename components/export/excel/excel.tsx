"use client"

export type ExcelCell = string | number | boolean | null | undefined

export type ExcelSheet = {
  name: string
  title?: string
  headers: string[]
  rows: ExcelCell[][]
}

type ExportExcelWorkbookParams = {
  filename: string
  sheets: ExcelSheet[]
}

function toSafeSheetName(raw: string): string {
  const trimmed = raw.trim() || "Sheet1"
  const cleaned = trimmed.replace(/[\\/*?:[\]]/g, " ")
  return cleaned.slice(0, 31) || "Sheet1"
}

function toExcelColumnName(index: number): string {
  let n = index
  let out = ""
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out || "A"
}

export async function exportExcelWorkbook({ filename, sheets }: ExportExcelWorkbookParams): Promise<void> {
  const ExcelJS = await import("exceljs")
  const workbook = new ExcelJS.Workbook()

  sheets.forEach((sheetDef) => {
    const sheet = workbook.addWorksheet(toSafeSheetName(sheetDef.name))
    const headerRowIndex = sheetDef.title ? 2 : 1

    if (sheetDef.title) {
      sheet.addRow([sheetDef.title])
      const lastCol = toExcelColumnName(Math.max(1, sheetDef.headers.length))
      sheet.mergeCells(`A1:${lastCol}1`)
      const titleCell = sheet.getCell("A1")
      titleCell.alignment = { horizontal: "center", vertical: "middle" }
      titleCell.font = { bold: true }
    }

    sheet.addRow(sheetDef.headers)
    const headerRow = sheet.getRow(headerRowIndex)
    headerRow.font = { bold: true }
    sheetDef.rows.forEach((row) => sheet.addRow(row))
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
