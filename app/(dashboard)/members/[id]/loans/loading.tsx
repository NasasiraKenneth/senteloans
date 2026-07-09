export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto animate-pulse space-y-6">
      <div className="h-4 w-32 rounded bg-muted" />
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <div className="h-6 w-48 rounded bg-muted" />
        <div className="h-4 w-72 rounded bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl border bg-muted/40" />
        ))}
      </div>
      <div className="h-64 rounded-xl border bg-muted/40" />
    </div>
  )
}
