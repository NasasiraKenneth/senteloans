export default function Loading() {
  return (
    <div className="flex h-screen bg-background">
      <div className="w-64 border-r bg-sidebar animate-pulse">
        <div className="h-16 border-b bg-muted/50" />
        <div className="p-2 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted/50 rounded" />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b bg-muted/50 animate-pulse" />

        <main className="flex-1 p-6">
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
        </main>
      </div>
    </div>
  )
}
