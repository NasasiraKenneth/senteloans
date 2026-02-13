import { NextResponse } from "next/server"

// Login is handled by NextAuth Credentials (signIn from client). This route is kept for compatibility.
export async function POST() {
  return NextResponse.json(
    { error: "Use the login form; authentication is handled by NextAuth." },
    { status: 400 }
  )
}
