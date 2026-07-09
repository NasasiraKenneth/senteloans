import { io, type Socket } from "socket.io-client"

let sharedSocket: Socket | null = null

function getSocket(): Socket | null {
  const url = process.env.NEXT_PUBLIC_SOCKET_URL
  if (!url) return null

  if (!sharedSocket) {
    sharedSocket = io(url, {
      path: "/socket.io",
      withCredentials: true,
      autoConnect: true,
    })
  }

  return sharedSocket
}

export function subscribeInboxUpdates(
  chatIdentityId: string,
  onUpdate: () => void,
): () => void {
  const socket = getSocket()
  if (!socket || !chatIdentityId) return () => undefined

  const handleConnect = () => {
    socket.emit("inbox:subscribe", { chatIdentityId })
  }

  const handleUpdate = (payload: { chatIdentityId?: string }) => {
    if (payload?.chatIdentityId === chatIdentityId) onUpdate()
  }

  socket.on("connect", handleConnect)
  socket.on("inbox:updated", handleUpdate)
  if (socket.connected) handleConnect()

  return () => {
    socket.emit("inbox:unsubscribe", { chatIdentityId })
    socket.off("connect", handleConnect)
    socket.off("inbox:updated", handleUpdate)
  }
}
