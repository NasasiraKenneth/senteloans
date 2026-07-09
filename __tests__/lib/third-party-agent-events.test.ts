jest.mock("@/lib/notifications/notification-service", () => ({
  notificationService: { createBulk: jest.fn() },
}))
jest.mock("@/lib/notifications/admin-recipients", () => ({
  getInstitutionRecipientsWithPermission: jest.fn(),
}))

import {
  notifyThirdPartyAgentCreated,
  notifyThirdPartyAgentUpdated,
} from "@/lib/notifications/third-party-agent-events"
import { notificationService } from "@/lib/notifications/notification-service"
import { getInstitutionRecipientsWithPermission } from "@/lib/notifications/admin-recipients"

const createBulk = notificationService.createBulk as jest.Mock
const getRecipients = getInstitutionRecipientsWithPermission as jest.Mock

const baseInput = () => ({
  client: {} as any,
  actor: { id: "staff-1", institution_id: "inst-1", branch_id: "branch-1" },
  agent: { id: "agent-1", name: "Acme Finance" },
})

beforeEach(() => {
  jest.clearAllMocks()
  createBulk.mockImplementation((messages: unknown[]) =>
    Promise.resolve({ ok: true, count: messages.length }),
  )
  getRecipients.mockResolvedValue([{ id: "staff-2", branch_id: "branch-1" }])
})

describe("notifyThirdPartyAgentCreated", () => {

  it("fans out to view_third_party_agents holders excluding the actor", async () => {
    const res = await notifyThirdPartyAgentCreated(baseInput())

    expect(getRecipients).toHaveBeenCalledTimes(1)
    expect(getRecipients.mock.calls[0][2]).toBe("view_third_party_agents")
    expect(getRecipients.mock.calls[0][3]).toEqual({ excludeUserId: "staff-1" })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch).toHaveLength(1)
    expect(staffBatch[0].type).toBe("third_party_agent_created")
    expect(staffBatch[0].recipientType).toBe("institution_user")
    expect(staffBatch[0].recipientId).toBe("staff-2")
    expect(staffBatch[0].metadata).toEqual({
      third_party_agent_id: "agent-1",
      third_party_agent_name: "Acme Finance",
    })
    expect(res.staffNotifications).toBe(1)
    expect(res.ok).toBe(true)
  })

  it("skips notifications when no recipients are found", async () => {
    getRecipients.mockResolvedValue([])

    const res = await notifyThirdPartyAgentCreated(baseInput())

    expect(createBulk).not.toHaveBeenCalled()
    expect(res.staffNotifications).toBe(0)
    expect(res.ok).toBe(true)
  })

  it("skips notifications when no client is provided", async () => {
    const res = await notifyThirdPartyAgentCreated({
      ...baseInput(),
      client: undefined,
    })

    expect(getRecipients).not.toHaveBeenCalled()
    expect(createBulk).not.toHaveBeenCalled()
    expect(res.staffNotifications).toBe(0)
    expect(res.ok).toBe(true)
  })
})

describe("notifyThirdPartyAgentUpdated", () => {
  it("fans out to view_third_party_agents holders excluding the actor", async () => {
    const res = await notifyThirdPartyAgentUpdated({
      ...baseInput(),
      updatedFields: ["status", "phone"],
    })

    expect(getRecipients.mock.calls[0][3]).toEqual({ excludeUserId: "staff-1" })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch[0].type).toBe("third_party_agent_updated")
    expect(staffBatch[0].metadata.updated_fields).toEqual(["status", "phone"])
    expect(res.staffNotifications).toBe(1)
    expect(res.ok).toBe(true)
  })
})

describe("notifyThirdPartyAgentUpdated", () => {
  it("fans out to view_third_party_agents holders excluding the actor", async () => {
    const res = await notifyThirdPartyAgentUpdated({
      ...baseInput(),
      updatedFields: ["status", "phone"],
    })

    expect(getRecipients.mock.calls[0][3]).toEqual({ excludeUserId: "staff-1" })

    const staffBatch = createBulk.mock.calls[0][0]
    expect(staffBatch[0].type).toBe("third_party_agent_updated")
    expect(staffBatch[0].metadata.updated_fields).toEqual(["status", "phone"])
    expect(res.staffNotifications).toBe(1)
    expect(res.ok).toBe(true)
  })
})
