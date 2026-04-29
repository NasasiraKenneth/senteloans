import { StyleSheet, pdf } from "@react-pdf/renderer"

export const serverPdfStyles = StyleSheet.create({
  page: { padding: 20, fontSize: 8, fontFamily: "Helvetica" },
  title: { fontSize: 10, textAlign: "center", marginBottom: 8, fontWeight: 700 },
  sectionName: { fontSize: 9, marginBottom: 6, fontWeight: 700 },
  table: { display: "flex", width: "100%", borderWidth: 1, borderColor: "#d1d5db" },
  row: { flexDirection: "row" },
  headerCell: {
    flex: 1,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#d1d5db",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    backgroundColor: "#f3f4f6",
    fontWeight: 700,
  },
  cell: {
    flex: 1,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
})

export function formatIsoDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toISOString().slice(0, 10)
}

export async function toServerPdfBuffer(documentNode: React.ReactElement): Promise<Buffer> {
  const out = await pdf(documentNode).toBuffer()
  if (Buffer.isBuffer(out)) return out
  if (out instanceof Uint8Array) return Buffer.from(out)
  if (out instanceof ArrayBuffer) return Buffer.from(new Uint8Array(out))

  if (out && typeof (out as any).on === "function") {
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      ;(out as any)
        .on("data", (chunk: Buffer | Uint8Array | ArrayBuffer | string) => {
          if (typeof chunk === "string") chunks.push(Buffer.from(chunk))
          else if (chunk instanceof ArrayBuffer) chunks.push(Buffer.from(new Uint8Array(chunk)))
          else chunks.push(Buffer.from(chunk))
        })
        .on("end", () => resolve())
        .on("error", (err: unknown) => reject(err))
    })
    return Buffer.concat(chunks)
  }

  throw new Error("Failed to render PDF buffer")
}

