import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextRequest, NextResponse } from "next/server"
import { runWithoutAuth } from "@/lib/db"

// Expected pathname formats sent from client:
// 1) Admin flow (immediate verify to senteloans_clients):
//    client-kyc/{clientId}/{docType}-{randomOrName}.{ext}
// 2) Client flow (pending review path; client APIs persist to senteloans_client_kyc_docs):
//    client-kyc-pending/{clientId}/{docType}-{randomOrName}.{ext}
// where docType in [passport_photo, national_id_front, national_id_back]
function parsePath(pathnameOrUrl: string): { prefix?: string; clientId?: string; docType?: string } {
  try {
    // Accept either a pathname like 'client-kyc/uuid/passport_photo-abc.png'
    // or a full URL like 'https://blob.vercel-storage.com/client-kyc/uuid/passport_photo-abc.png'
    let path = pathnameOrUrl
    try {
      // If it's a URL, extract the pathname
      if (/^https?:\/\//i.test(pathnameOrUrl)) {
        path = new URL(pathnameOrUrl).pathname
      }
    } catch {
      // noop
    }
    // Normalize leading slash off pathname
    const clean = path.replace(/^\/+/, "")
    const parts = clean.split("/")
    if (parts.length < 3) return {}
    const [prefix, clientId, file] = parts
    if (prefix !== "client-kyc" && prefix !== "client-kyc-pending") return {}
    const docType = file.split("-")[0] // 'passport_photo-abc.png' -> 'passport_photo'
    return { prefix, clientId, docType }
  } catch {
    return {}
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname: string) => {
        // Restrict types to images/PDF and enforce public access
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
          ],
          addRandomSuffix: true,
          // Ensure Vercel can call back this route to trigger onUploadCompleted
          callbackUrl: `${request.nextUrl.origin}/api/vercel_blob/upload`,
        }
      },
      onUploadCompleted: async ({ blob }: { blob: { url: string; pathname?: string } }) => {
        // Persist to Postgres: update senteloans_clients KYC column based on pathname
        const pathSource = blob.pathname || blob.url
        const { prefix, clientId, docType } = parsePath(pathSource || "")
        // Debug logging (visible in server logs)
        console.log("[vercel_blob] upload completed", { url: blob.url, pathname: blob.pathname, prefix, clientId, docType })
        if (!clientId || !docType || !prefix) return

        const columnMap: Record<string, string> = {
          passport_photo: "passport_photo",
          national_id_front: "national_id_front",
          national_id_back: "national_id_back",
        }
        const column = columnMap[docType]
        if (!column) return

        // Admin path: directly update verified columns on client record
        if (prefix === "client-kyc") {
          await runWithoutAuth(async (client) => {
            const res = await client.query(
              `UPDATE senteloans_clients SET ${column} = $1 WHERE id = $2`,
              [blob.url, clientId]
            )
            if (res.rowCount === 0) {
              console.warn("[vercel_blob] no client row updated", { clientId, column })
            }
          })
          console.log("[vercel_blob] updated client document (admin flow)", { clientId, column })
        } else {
          // Client path (pending): do not update client table here.
          // The client portal will call /api/client/kyc-docs to persist a pending row.
          console.log("[vercel_blob] client pending upload received (no DB update here)", { clientId, docType })
        }
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unknown error." }, { status: 400 })
  }
}
