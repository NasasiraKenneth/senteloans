import { NextResponse } from "next/server"
import { runWithoutAuth } from "@/lib/db"

export async function GET() {
  try {
    const branchTypes = await runWithoutAuth(async (client) => {
      const res = await client.query(
        `SELECT id, name, description FROM branch_types ORDER BY name ASC`
      )
      if (res.rows.length === 0) {
        return [
          { id: "1", name: "Head Office", description: "Main institution headquarters" },
          { id: "2", name: "Regional Office", description: "Regional management office" },
          { id: "3", name: "Branch", description: "Standard service branch" },
          { id: "4", name: "Agent", description: "Agent outlet or partner" },
        ]
      }
      return res.rows
    })

    return NextResponse.json(branchTypes)
  } catch (error: any) {
    return NextResponse.json([
      { id: "1", name: "Head Office", description: "Main institution headquarters" },
      { id: "2", name: "Regional Office", description: "Regional management office" },
      { id: "3", name: "Branch", description: "Standard service branch" },
      { id: "4", name: "Agent", description: "Agent outlet or partner" },
    ])
  }
}
