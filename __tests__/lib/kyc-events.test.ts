jest.mock("@/lib/notifications/notification-service", () => ({
  notificationService: { create: jest.fn(), createBulk: jest.fn() },
}))
jest.mock("@/lib/notifications/admin-recipients", () => ({
  getInstitutionRecipientsWithPermission: jest.fn(),
}))

import {
  notifyKycSubmitted,
  notifyKycApproved,
  notifyKycRejected,
} from "@/lib/notifications/kyc-events"
import { notificationService } from "@/lib/notifications/notification-service"
import { getInstitutionRecipientsWithPermission } from "@/lib/notifications/admin-recipients"

const create = notificationService.create as jest.Mock
const createBulk = notificationService.createBulk as jest.Mock
const getRecipients = getInstitutionRecipientsWithPermission as jest.Mock

describe("notifyKycSubmitted", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    create.mockResolvedValue({ ok: true })
    createBulk.mockImplementation((messages: unknown[]) =>
      Promise.resolve({ ok: true, count: messages.length }),
    )
    getRecipients.mockResolvedValue([{ id: "staff-2", branch_id: "branch-1" }])
  })

  it("notifies member and staff with view_members", async () => {
    const res = await notifyKycSubmitted({
      client: {} as any,
      institutionId: "inst-1",
      branchId: "branch-1",
      member: { id: "member-1", full_name: "Jane Doe" },
      docType: "national_id_front",
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientType: "member",
        type: "kyc_submitted",
        recipientId: "member-1",
      }),
      expect.anything(),
    )
    expect(getRecipients).toHaveBeenCalledWith(expect.anything(), "inst-1", "view_members", {
      excludeUserId: null,
    })
    const staffMessages = createBulk.mock.calls[0][0]
    expect(staffMessages).toHaveLength(1)
    expect(staffMessages[0].type).toBe("pending_kyc_review")
    expect(res.memberNotifications).toBe(1)
    expect(res.staffNotifications).toBe(1)
  })
})

describe("notifyKycApproved", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    create.mockResolvedValue({ ok: true })
  })

  it("notifies member only", async () => {
    const res = await notifyKycApproved({
      actor: { id: "staff-1", institution_id: "inst-1", branch_id: "branch-1" },
      member: { id: "member-1", full_name: "Jane Doe" },
      docType: "passport_photo",
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "kyc_approved", recipientType: "member" }),
      undefined,
    )
    expect(res.memberNotifications).toBe(1)
    expect(res.staffNotifications).toBe(0)
  })
})

describe("notifyKycRejected", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    create.mockResolvedValue({ ok: true })
  })

  it("notifies member with rejection reason", async () => {
    const res = await notifyKycRejected({
      actor: { id: "staff-1", institution_id: "inst-1", branch_id: "branch-1" },
      member: { id: "member-1", full_name: "Jane Doe" },
      docType: "national_id_back",
      reason: "Image is blurry",
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "kyc_rejected",
        metadata: expect.objectContaining({ reason: "Image is blurry" }),
      }),
      undefined,
    )
    expect(res.memberNotifications).toBe(1)
  })
})
