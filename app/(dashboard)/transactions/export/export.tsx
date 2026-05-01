export type TransactionsExportFormat = "excel" | "pdf"

function buildExportQuery(activeFilters: Record<string, string>, format: TransactionsExportFormat): URLSearchParams {
  const q = new URLSearchParams()
  Object.entries(activeFilters).forEach(([k, v]) => {
    if (!v) return
    q.set(k, v)
  })
  q.set("format", format)
  return q
}

export async function downloadTransactionsExport(activeFilters: Record<string, string>, format: TransactionsExportFormat): Promise<void> {
  const q = buildExportQuery(activeFilters, format)
  const res = await fetch(`/api/institution/transactions/export?${q.toString()}`, { method: "GET" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || `Failed to download ${format.toUpperCase()}`)
  }
  const blob = await res.blob()
  const disposition = res.headers.get("content-disposition") || ""
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match?.[1] || `transaction-report-${new Date().toISOString().slice(0, 10)}.${format === "excel" ? "xlsx" : "pdf"}`
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
