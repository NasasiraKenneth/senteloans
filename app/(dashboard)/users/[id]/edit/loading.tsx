import { Card, CardContent, CardHeader } from "@/components/ui/card"


export default function Loading() {
  return (
    <>
      <div className="animate-pulse space-y-6">
            {/* Header skeleton */}
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 bg-muted rounded"></div>
              <div className="space-y-2">
                <div className="h-8 bg-muted rounded w-48"></div>
                <div className="h-4 bg-muted rounded w-64"></div>
              </div>
            </div>

            {/* Form cards skeleton */}
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="h-6 bg-muted rounded w-40"></div>
                  <div className="h-4 bg-muted rounded w-64"></div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    {[1, 2, 3, 4].map((j) => (
                      <div key={j} className="space-y-2">
                        <div className="h-4 bg-muted rounded w-24"></div>
                        <div className="h-10 bg-muted rounded"></div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Action buttons skeleton */}
            <div className="flex justify-end space-x-4">
              <div className="h-10 w-20 bg-muted rounded"></div>
              <div className="h-10 w-32 bg-muted rounded"></div>
            </div>
      </div>
    </>
  )
}
