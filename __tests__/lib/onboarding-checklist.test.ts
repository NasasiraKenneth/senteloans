import {
  buildOnboardingChecklistItems,
  isNotesNokOnboardingComplete,
  isPayoutOnboardingComplete,
} from "@/lib/members/onboarding-checklist"

describe("onboarding checklist", () => {
  const baseMember = {
    id: "member-1",
    kycStatus: "Pending",
    kycDocType: "national_id" as const,
    kycDocStatus: "pending_review",
    kycDocComplete: true,
    mobileMoneyProvider: "",
    mobileMoneyNumber: "",
    bankName: "",
    bankAccountNumber: "",
    bankAccountName: "",
    bankBranch: "",
    notes: "",
    nextOfKinName: "",
    nextOfKinRelationship: "",
    nextOfKinPhone: "",
  }

  it("marks KYC complete when doc set is complete or member is verified", () => {
    const pending = buildOnboardingChecklistItems(baseMember)
    expect(pending[0].done).toBe(true)
    expect(pending[0].action).toBe("documents-tab")
    expect(pending[0].hint).toContain("awaiting verification")

    const verified = buildOnboardingChecklistItems({
      ...baseMember,
      kycDocComplete: false,
      kycDocStatus: null,
      kycStatus: "Verified",
    })
    expect(verified[0].done).toBe(true)

    const rejected = buildOnboardingChecklistItems({
      ...baseMember,
      kycDocStatus: "rejected",
      kycDocComplete: true,
      kycStatus: "Rejected",
    })
    expect(rejected[0].done).toBe(false)
  })

  it("uses passport hint for passport doc type", () => {
    const items = buildOnboardingChecklistItems({
      ...baseMember,
      kycDocType: "passport",
      kycDocComplete: false,
      kycDocStatus: null,
    })
    expect(items[0].hint).toContain("biodata")
  })

  it("links payout and notes to edit page anchors", () => {
    const items = buildOnboardingChecklistItems(baseMember)
    expect(items[1].href).toBe("/members/member-1/edit#payout")
    expect(items[2].href).toBe("/members/member-1/edit#nok")
  })

  it("requires next-of-kin relationship for notes step", () => {
    expect(
      isNotesNokOnboardingComplete({
        id: "m1",
        notes: "Note",
        nextOfKinName: "Jane",
        nextOfKinPhone: "+256700",
        nextOfKinRelationship: "",
      }),
    ).toBe(false)
    expect(
      isNotesNokOnboardingComplete({
        id: "m1",
        notes: "Note",
        nextOfKinName: "Jane",
        nextOfKinPhone: "+256700",
        nextOfKinRelationship: "Spouse",
      }),
    ).toBe(true)
  })

  it("accepts mobile money or full bank account for payout", () => {
    expect(isPayoutOnboardingComplete({ id: "m1", mobileMoneyProvider: "MTN", mobileMoneyNumber: "+2567" })).toBe(true)
    expect(
      isPayoutOnboardingComplete({
        id: "m1",
        bankName: "Stanbic",
        bankAccountNumber: "123",
        bankAccountName: "Jane",
        bankBranch: "Kampala",
      }),
    ).toBe(true)
    expect(isPayoutOnboardingComplete({ id: "m1", bankName: "Stanbic", bankAccountNumber: "123" })).toBe(false)
  })
})
