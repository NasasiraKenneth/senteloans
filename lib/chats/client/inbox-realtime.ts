import { getChatSocket } from "./socket"

export function subscribeInboxUpdates(
  chatIdentityId: string,
  onUpdate: () => void,
): () => void {
  const socket = getChatSocket()
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
