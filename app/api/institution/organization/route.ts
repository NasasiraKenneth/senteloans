import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const row = await runWithAuth(session.user.authUserId, async (client) => {
      const userRes = await client.query(
        `SELECT u.institution_id, i.id AS inst_id, i.name, i.type, i.address, i.phone_number, i.email,
                i.license_number, i.registration_number, i.website, i.established_date
         FROM senteloans_users u
         JOIN senteloans_institutions i ON i.id = u.institution_id
         WHERE u.supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      return userRes.rows[0]
    })

    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 })

    return NextResponse.json({
      id: row.inst_id,
      name: row.name,
      type: row.type,
      address: row.address || "",
      phone_number: row.phone_number || "",
      email: row.email || "",
      license_number: row.license_number || "",
      registration_number: row.registration_number || "",
      website: row.website || "",
      established_date: row.established_date || null,
    })
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
function isValidPhone(phone: string) {
  return /^[+\d][\d\s-]{6,19}$/.test(phone)
}
function isValidUrl(url: string) {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    if (session.user.type !== "staff") return NextResponse.json({ error: "not_staff" }, { status: 403 })

    const body = (await req.json()) as Record<string, unknown>
    const {
      address,
      phone_number,
      email,
      license_number,
      registration_number,
      website,
      established_date,
    } = body || {}

    if (typeof email === "string" && email && !isValidEmail(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 })
    }
    if (typeof phone_number === "string" && phone_number && !isValidPhone(phone_number)) {
      return NextResponse.json({ error: "invalid_phone" }, { status: 400 })
    }
    if (typeof website === "string" && website && !isValidUrl(website)) {
      return NextResponse.json({ error: "invalid_website" }, { status: 400 })
    }
    if (typeof established_date === "string" && established_date) {
      const d = new Date(established_date)
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "invalid_date" }, { status: 400 })
    }

    const updates: string[] = []
    const values: unknown[] = []
    let i = 1
    if (address !== undefined) {
      updates.push(`address = $${i++}`)
      values.push(address)
    }
    if (phone_number !== undefined) {
      updates.push(`phone_number = $${i++}`)
      values.push(phone_number)
    }
    if (email !== undefined) {
      updates.push(`email = $${i++}`)
      values.push(email)
    }
    if (license_number !== undefined) {
      updates.push(`license_number = $${i++}`)
      values.push(license_number)
    }
    if (registration_number !== undefined) {
      updates.push(`registration_number = $${i++}`)
      values.push(registration_number)
    }
    if (website !== undefined) {
      updates.push(`website = $${i++}`)
      values.push(website)
    }
    if (established_date !== undefined) {
      updates.push(`established_date = $${i++}`)
      values.push(established_date)
    }
    if (updates.length === 0) return NextResponse.json({ error: "no_changes" }, { status: 400 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const meRes = await client.query(
        `SELECT institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const me = meRes.rows[0]
      if (!me) return null
      values.push(me.institution_id)
      await client.query(
        `UPDATE senteloans_institutions SET ${updates.join(", ")} WHERE id = $${i}`,
        values
      )
      const instRes = await client.query(
        `SELECT id, name, type, address, phone_number, email, license_number, registration_number, website, established_date
         FROM senteloans_institutions WHERE id = $1`,
        [me.institution_id]
      )
      return instRes.rows[0]
    })

    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
