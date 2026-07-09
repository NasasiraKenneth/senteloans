export type LoanReportExportFormat = "excel" | "pdf"

const POLL_INTERVAL_MS = 1500
const MAX_POLL_ATTEMPTS = 120

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function pollReportJob(jobId: string): Promise<{ filename: string; rowCount?: number }> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const res = await fetch(`/api/institution/reports/jobs/${encodeURIComponent(jobId)}`, {
      cache: "no-store",
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.error || `Job status failed (${res.status})`)
    }

    if (data.status === "completed") {
      return {
        filename: String(data.filename || "loan-portfolio-report"),
        rowCount: typeof data.rowCount === "number" ? data.rowCount : undefined,
      }
    }
    if (data.status === "failed") {
      throw new Error(data.failedReason || "Report export failed")
    }

    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error("Report export timed out. Ensure workers are running (`npm run workers`).")
}

async function downloadReportArtifact(jobId: string, fallbackFilename: string): Promise<void> {
  const res = await fetch(
    `/api/institution/reports/jobs/${encodeURIComponent(jobId)}?download=true`,
    { cache: "no-store" },
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || `Download failed (${res.status})`)
  }
  const blob = await res.blob()
  const disposition = res.headers.get("content-disposition") || ""
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match?.[1] || fallbackFilename
  triggerBrowserDownload(blob, filename)
}

export async function downloadLoanReportExport(
  query: URLSearchParams,
  format: LoanReportExportFormat,
): Promise<number> {
  const q = new URLSearchParams(query)
  q.set("format", format)

  const res = await fetch(`/api/institution/reports/loans/export?${q.toString()}`, {
    method: "GET",
    cache: "no-store",
  })

  if (res.status === 202) {
    const body = await res.json().catch(() => ({}))
    const jobId = String(body.jobId || "")
    if (!jobId) throw new Error("Export queue did not return a job id")
    const { filename, rowCount } = await pollReportJob(jobId)
    await downloadReportArtifact(jobId, filename)
    return rowCount ?? 0
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || `Failed to queue ${format.toUpperCase()} export`)
  }

  const blob = await res.blob()
  const disposition = res.headers.get("content-disposition") || ""
  const match = disposition.match(/filename="?([^"]+)"?/)
  const stamp = new Date().toISOString().slice(0, 10)
  const filename =
    match?.[1] ||
    `loan-portfolio-report-${stamp}.${format === "excel" ? "xlsx" : "pdf"}`
  triggerBrowserDownload(blob, filename)
  return 0
}
