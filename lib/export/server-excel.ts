export function formatIsoDateForExcel(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toISOString().slice(0, 10)
}

export function toSafeExcelSheetName(name: string): string {
  return (name || "Sheet1").replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Sheet1"
}

export function addExcelTitleAndHeaders(
  worksheet: any,
  title: string,
  headers: string[],
  mergeRange: string
) {
  worksheet.addRow([title])
  worksheet.mergeCells(mergeRange)
  worksheet.getRow(1).font = { bold: true }
  worksheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" }
  worksheet.addRow(headers)
  worksheet.getRow(2).font = { bold: true }
}

export async function createExcelWorkbook(): Promise<any> {
  const ExcelJS = await import("exceljs")
  return new ExcelJS.Workbook()
}

