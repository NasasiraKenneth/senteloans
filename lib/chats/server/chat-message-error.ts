export type ChatMessageErrorCode =
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "invalid_reply"
  | "empty_body"

export class ChatMessageError extends Error {
  code: ChatMessageErrorCode

  constructor(message: string, code: ChatMessageErrorCode) {
    super(message)
    this.name = "ChatMessageError"
    this.code = code
  }
}

export function mapChatMessageError(error: ChatMessageError) {
  switch (error.code) {
    case "not_found":
      return { status: 404, error: error.code, message: error.message }
    case "forbidden":
      return { status: 403, error: error.code, message: error.message }
    case "invalid_reply":
    case "empty_body":
    case "invalid_request":
    default:
      return { status: 400, error: error.code, message: error.message }
  }
}
