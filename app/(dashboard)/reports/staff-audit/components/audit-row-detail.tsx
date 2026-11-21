"use client"

type AuditRowDetailProps = {
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
}

function JsonBlock({
  title,
  data,
  accent = false,
}: {
  title: string
  data?: Record<string, unknown> | null
  accent?: boolean
}) {
  const hasData = Boolean(data && Object.keys(data).length > 0)
  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${accent ? "bg-brand" : "bg-muted-foreground/50"}`} />
        {title}
      </h4>
      {hasData ? (
        <pre
          className={`max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground ${
            accent ? "border-brand/30" : "border-border"
          }`}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/25 p-3 text-xs text-muted-foreground">
          No values
        </div>
      )}
    </div>
  )
}

export default function AuditRowDetail({ oldValues, newValues }: AuditRowDetailProps) {
  return (
    <div className="grid gap-4 p-4 md:grid-cols-2">
      <JsonBlock title="Old values" data={oldValues} />
      <JsonBlock title="New values" data={newValues} accent />
    </div>
  )
}
