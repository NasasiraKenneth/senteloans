import { NextResponse } from "next/server"

// Logout: client should call signOut() from next-auth/react. This route is kept for compatibility.
export async function POST() {
  return NextResponse.json({ ok: true })
}

export const GET = POST
