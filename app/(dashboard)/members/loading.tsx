export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-muted/50 rounded animate-pulse" />
          <div className="h-4 w-96 bg-muted/50 rounded animate-pulse" />
        </div>
        <div className="h-10 w-32 bg-muted/50 rounded animate-pulse" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted/50 rounded animate-pulse" />
        ))}
      </div>

      <div className="h-96 bg-muted/50 rounded animate-pulse" />
    </div>
  )
}
