export type RepaymentScheduleExportFormat = "excel" | "pdf"

export async function downloadRepaymentScheduleExport(
  loanId: string,
  format: RepaymentScheduleExportFormat,
): Promise<void> {
  const q = new URLSearchParams()
  q.set("format", format)
  const res = await fetch(
    `/api/institution/loans/${encodeURIComponent(loanId)}/repayments/export?${q.toString()}`,
    { method: "GET" },
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string })?.error || `Failed to download ${format.toUpperCase()}`)
  }
  const blob = await res.blob()
  const disposition = res.headers.get("content-disposition") || ""
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename =
    match?.[1]?.trim() ||
    `repayment-schedule-${new Date().toISOString().replace(/[:.]/g, "-")}.${format === "excel" ? "xlsx" : "pdf"}`
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
