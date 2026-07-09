import {
  assertThirdPartyAgentActiveRow,
  assertThirdPartyAgentEditableForUpdates,
} from "@/lib/third-party-agents/agent-status"

describe("third-party-agent-status", () => {
  const activeAgent = {
    id: "agent-1",
    institution_id: "inst-1",
    branch_id: "branch-1",
    name: "Acme Finance",
    status: "Active" as const,
  }

  it("assertThirdPartyAgentActiveRow rejects inactive agents", () => {
    const res = assertThirdPartyAgentActiveRow({ ...activeAgent, status: "Inactive" })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe("third_party_agent_inactive")
      expect(res.status).toBe("Inactive")
    }
  })

  it("allows status-only PATCH on inactive agents for reactivation", () => {
    const res = assertThirdPartyAgentEditableForUpdates(
      { status: "Inactive" },
      { status: "Active" },
    )
    expect(res.ok).toBe(true)
  })

  it("blocks non-status PATCH on inactive agents", () => {
    const res = assertThirdPartyAgentEditableForUpdates(
      { status: "Suspended" },
      { phone: "+256700000001" },
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe("third_party_agent_inactive")
  })
})
