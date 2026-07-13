import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { encode } from "next-auth/jwt"
import { authOptions } from "@/lib/auth"

/**
 * Short-lived handshake token for the Socket.IO server.
 * Needed because cross-origin sockets (e.g. :3000 → :3010) often cannot
 * send NextAuth session cookies (SameSite).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) {
      return NextResponse.json({ error: "socket_auth_misconfigured" }, { status: 500 })
    }

    const token = await encode({
      token: {
        authUserId: session.user.authUserId,
        type: session.user.type,
        userId: session.user.userId ?? null,
        memberId: session.user.memberId ?? session.user.clientId ?? null,
        clientId: session.user.clientId ?? null,
      },
      secret,
      maxAge: 60 * 60,
    })

    return NextResponse.json({ token, expiresIn: 3600 })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
