"use client"

type AuditRowDetailProps = {
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
}

function JsonBlock({ title, data }: { title: string; data?: Record<string, unknown> | null }) {
  const hasData = Boolean(data && Object.keys(data).length > 0)
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
      {hasData ? (
        <pre className="max-h-64 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-800">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">No values</div>
      )}
    </div>
  )
}

export default function AuditRowDetail({ oldValues, newValues }: AuditRowDetailProps) {
  return (
    <div className="grid gap-4 p-4 md:grid-cols-2">
      <JsonBlock title="Old values" data={oldValues} />
      <JsonBlock title="New values" data={newValues} />
    </div>
  )
}
