export default function MemberSharesLoading() {
  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
      {/* Back Link Skeleton */}
      <div className="h-4 w-28 rounded bg-muted/60" />

      {/* Hero Header Banner Skeleton */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-card">
        <div className="h-14 bg-muted/40" />
        <div className="px-6 pb-5 -mt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-muted/70" />
                <div className="h-7 w-44 rounded bg-muted/70" />
              </div>
              <div className="h-4 w-60 rounded bg-muted/50" />
            </div>
            <div className="flex gap-2">
              <div className="h-9 w-24 rounded-md bg-muted/60" />
              <div className="h-9 w-28 rounded-md bg-muted/60" />
              <div className="h-9 w-28 rounded-md bg-muted/60" />
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards Grid Skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-card p-4 space-y-2">
            <div className="h-3 w-20 rounded bg-muted/60" />
            <div className="h-6 w-32 rounded bg-muted/80" />
          </div>
        ))}
      </div>

      {/* Info Card Skeleton */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="h-5 w-48 rounded bg-muted/70" />
        <div className="h-4 w-3/4 rounded bg-muted/50" />
        <div className="grid gap-3 sm:grid-cols-3 pt-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg border border-border bg-muted/20 p-3" />
          ))}
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-44 rounded bg-muted/70" />
          <div className="h-8 w-32 rounded bg-muted/50" />
        </div>
        <div className="h-64 rounded-lg border border-border bg-muted/10" />
      </div>
    </div>
  )
}
