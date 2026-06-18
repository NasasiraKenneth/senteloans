jest.mock("@/lib/db", () => ({
  runWithoutAuth: jest.fn(),
}))

jest.mock("@/queues/email.queue", () => ({
  enqueueEmail: jest.fn(),
}))

import { runWithoutAuth } from "@/lib/db"
import { enqueueEmail } from "@/queues/email.queue"
import { isMemberEmailEnabled, isOpeningBalanceEmailEnabled } from "@/lib/email/preference-gate"
import { enqueueMemberEmail } from "@/lib/email/enqueue-member-email"
import { notificationTypeForEmailTemplate } from "@/lib/email/template-notification-map"

describe("notificationTypeForEmailTemplate", () => {
  it("maps known templates", () => {
    expect(notificationTypeForEmailTemplate("member.welcome")).toBe("member_welcome")
    expect(notificationTypeForEmailTemplate("email.test")).toBeNull()
  })
})

describe("isMemberEmailEnabled", () => {
  const mockQuery = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(runWithoutAuth as jest.Mock).mockImplementation(async (fn: (c: { query: typeof mockQuery }) => unknown) =>
      fn({ query: mockQuery }),
    )
  })

  it("allows email when no preference row exists", async () => {
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] })
    await expect(isMemberEmailEnabled("m1", "member_welcome")).resolves.toBe(true)
  })

  it("blocks email when preference row has email_enabled false", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1, rows: [{ email_enabled: false }] })
    await expect(isMemberEmailEnabled("m1", "member_welcome")).resolves.toBe(false)
  })
})

describe("isOpeningBalanceEmailEnabled", () => {
  const mockQuery = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(runWithoutAuth as jest.Mock).mockImplementation(async (fn: (c: { query: typeof mockQuery }) => unknown) =>
      fn({ query: mockQuery }),
    )
  })

  it("allows when savings pref is enabled", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1, rows: [{ email_enabled: true }] })
    await expect(isOpeningBalanceEmailEnabled("m1", true, false)).resolves.toBe(true)
  })
})

describe("enqueueMemberEmail", () => {
  const mockQuery = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(runWithoutAuth as jest.Mock).mockImplementation(async (fn: (c: { query: typeof mockQuery }) => unknown) =>
      fn({ query: mockQuery }),
    )
    ;(enqueueEmail as jest.Mock).mockResolvedValue(undefined)
  })

  it("skips enqueue when email preference is disabled", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1, rows: [{ email_enabled: false }] })
    const out = { enqueued: [] as string[], skipped: [] as string[], errors: [] as string[] }

    await enqueueMemberEmail(
      "m1",
      {
        to: "a@b.com",
        subject: "Hi",
        template: "member.welcome",
        kind: "template",
        data: {},
      },
      "welcome",
      out,
    )

    expect(out.skipped).toContain("welcome:email_pref_disabled")
    expect(enqueueEmail).not.toHaveBeenCalled()
  })

  it("enqueues when preference allows", async () => {
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] })
    const out = { enqueued: [] as string[], skipped: [] as string[], errors: [] as string[] }

    await enqueueMemberEmail(
      "m1",
      {
        to: "a@b.com",
        subject: "Hi",
        template: "member.welcome",
        kind: "template",
        data: {},
      },
      "welcome",
      out,
    )

    expect(out.enqueued).toContain("welcome")
    expect(enqueueEmail).toHaveBeenCalled()
  })
})
