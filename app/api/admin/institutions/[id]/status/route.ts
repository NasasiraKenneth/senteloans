import { NextResponse } from "next/server"
import { runWithoutAuth } from "@/lib/db"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: "Institution ID is required" }, { status: 400 })
    }

    const body = await request.json()
    const { status } = body

    if (status !== "Active" && status !== "Inactive") {
      return NextResponse.json(
        { error: "Status must be either 'Active' or 'Inactive'" },
        { status: 400 }
      )
    }

    const updatedInstitution = await runWithoutAuth(async (client) => {
      // 1. Update institution status
      const instRes = await client.query(
        `UPDATE institutions
         SET status = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [status, id]
      )

      if (instRes.rows.length === 0) {
        throw new Error("Institution not found")
      }

      // 2. If deactivating, cascade status update to all branches under this institution
      if (status === "Inactive") {
        await client.query(
          `UPDATE branches
           SET status = 'Inactive',
               updated_at = NOW()
           WHERE institution_id = $1`,
          [id]
        )
      }

      return instRes.rows[0]
    })

    return NextResponse.json({
      success: true,
      status: updatedInstitution.status,
      institution: updatedInstitution,
    })
  } catch (error: any) {
    console.error("Error updating institution status:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update institution status" },
      { status: 500 }
    )
  }
}
