import { NextResponse } from "next/server"
import { runWithoutAuth } from "@/lib/db"

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  try {
    const { id: institutionId, branchId } = await params
    if (!institutionId || !branchId) {
      return NextResponse.json(
        { error: "Institution ID and Branch ID are required" },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      name,
      branch_type_id,
      phone_number,
      email,
      address,
      status = "Active",
    } = body

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Branch name is required" }, { status: 400 })
    }

    const updatedBranch = await runWithoutAuth(async (client) => {
      const res = await client.query(
        `UPDATE branches
         SET name = $1,
             branch_type_id = $2,
             phone_number = $3,
             email = $4,
             address = $5,
             status = $6,
             updated_at = NOW()
         WHERE id = $7 AND institution_id = $8
         RETURNING *`,
        [
          name.trim(),
          branch_type_id || null,
          phone_number?.trim() || null,
          email?.trim() || null,
          address?.trim() || null,
          status || "Active",
          branchId,
          institutionId,
        ]
      )

      if (res.rows.length === 0) {
        throw new Error("Branch not found or does not belong to this institution.")
      }

      return res.rows[0]
    })

    return NextResponse.json({ success: true, branch: updatedBranch })
  } catch (error: any) {
    console.error("Error updating branch:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update branch" },
      { status: 500 }
    )
  }
}
