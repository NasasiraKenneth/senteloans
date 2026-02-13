import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex h-screen bg-background">
      <div className="w-64 border-r bg-card">
        <Skeleton className="h-full w-full" />
      </div>
      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b bg-card">
          <Skeleton className="h-full w-full" />
        </div>
        <div className="flex-1 p-6 space-y-6">
          <div className="flex items-center space-x-4">
            <Skeleton className="h-10 w-10" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
          <div className="grid md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
