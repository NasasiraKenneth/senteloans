import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import VoidSharesModal from "@/app/(dashboard)/members/components/shares/void"
import type { ShareTransaction } from "@/app/(dashboard)/members/[id]/shares/page"

const toastMock = jest.fn()
jest.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}))

jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

const mockShare: ShareTransaction = {
  id: "77777777-7777-7777-7777-777777777777",
  transaction_id: "88888888-8888-8888-8888-888888888888",
  transaction_number: "TXN-SHARES-001",
  acquisition_type: "purchase",
  number_of_shares: 10,
  share_value: 50000,
  total_value: 500000,
  remaining_shares: 10,
  date: "2026-02-01",
  created_at: "2026-02-01T10:00:00Z",
  mode: "Cash",
  status: "active",
}

describe("VoidSharesModal", () => {
  const onClose = jest.fn()
  const onSuccess = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  it("renders null when share is null", () => {
    const { container } = render(
      <VoidSharesModal
        isOpen={true}
        onClose={onClose}
        share={null}
        memberId="member-1"
        onSuccess={onSuccess}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders share details and warning when open", () => {
    render(
      <VoidSharesModal
        isOpen={true}
        onClose={onClose}
        share={mockShare}
        memberId="member-1"
        onSuccess={onSuccess}
      />,
    )

    expect(screen.getByText("Void Share Record")).toBeInTheDocument()
    expect(screen.getByText("Void & Financial Reversal Warning")).toBeInTheDocument()
    expect(screen.getByText("TXN-SHARES-001")).toBeInTheDocument()
    expect(screen.getByText("10 shares")).toBeInTheDocument()
    expect(screen.getByText("Cash")).toBeInTheDocument()
    expect(screen.getByText("Confirm & Void Share Record")).toBeInTheDocument()
  })

  it("calls DELETE API on confirm and triggers toast and onSuccess on success", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, message: "Share record voided successfully" }),
    })

    render(
      <VoidSharesModal
        isOpen={true}
        onClose={onClose}
        share={mockShare}
        memberId="member-1"
        onSuccess={onSuccess}
      />,
    )

    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, { target: { value: "Duplicate entry error" } })

    const confirmBtn = screen.getByText("Confirm & Void Share Record")
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/institution/members/member-1/shares/77777777-7777-7777-7777-777777777777",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ reason: "Duplicate entry error" }),
        }),
      )
    })

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "success",
          title: "Share record voided",
        }),
      )
      expect(onSuccess).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it("displays destructive toast on API failure", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        code: "shares_already_transferred_or_sold",
        error: "shares_already_transferred_or_sold",
      }),
    })

    render(
      <VoidSharesModal
        isOpen={true}
        onClose={onClose}
        share={mockShare}
        memberId="member-1"
        onSuccess={onSuccess}
      />,
    )

    const confirmBtn = screen.getByText("Confirm & Void Share Record")
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: "Failed to void share record",
          description: expect.stringContaining("shares have already been transferred or sold"),
        }),
      )
      expect(onSuccess).not.toHaveBeenCalled()
    })
  })
})
