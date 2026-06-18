import { renderEmailTemplate } from "@/lib/email/render-template"

describe("renderEmailTemplate", () => {
  it("renders member welcome template", () => {
    const out = renderEmailTemplate("member.welcome", {
      institutionName: "Test SACCO",
      memberName: "Jane Doe",
      memberNumber: "M-001",
    })
    expect(out.html).toContain("Test SACCO")
    expect(out.html).toContain("Jane Doe")
    expect(out.html).toContain("M-001")
    expect(out.text).toContain("Welcome")
  })

  it("renders member welcome template with savings account details", () => {
    const out = renderEmailTemplate("member.welcome", {
      institutionName: "Test SACCO",
      memberName: "Jane Doe",
      memberNumber: "M-001",
      accountType: "Voluntary",
      accountNumber: "SA-TEST-0001",
    })
    expect(out.html).toContain("Account type")
    expect(out.html).toContain("Voluntary")
    expect(out.html).toContain("SA-TEST-0001")
  })

  it("renders membership fee paid with remaining balance and receipt note", () => {
    const out = renderEmailTemplate("membership_fee.paid", {
      institutionName: "Test SACCO",
      memberName: "Jane",
      memberNumber: "M-1",
      amount: 25000,
      remaining: 25000,
      currency: "UGX",
      transactionNumber: "TXN-100",
    })
    expect(out.html).toContain("Outstanding balance")
    expect(out.html).toContain("25,000")
    expect(out.html).toContain("TXN-100")
    expect(out.html).toContain("receipt is attached")
  })

  it("renders share purchase with invoice, receipt, and attachment note", () => {
    const out = renderEmailTemplate("shares.purchased", {
      institutionName: "Test SACCO",
      memberName: "Jane",
      memberNumber: "M-1",
      numberOfShares: 5,
      amount: 50_000,
      currency: "UGX",
      invoiceNumber: "INV-001",
      transactionNumber: "TXN-200",
    })
    expect(out.html).toContain("5")
    expect(out.html).toContain("INV-001")
    expect(out.html).toContain("TXN-200")
    expect(out.html).toContain("invoice and payment receipt are attached")
  })

  it("renders opening balance with per-account savings and loan details", () => {
    const out = renderEmailTemplate("opening_balance.recorded", {
      institutionName: "Test SACCO",
      memberName: "Jane",
      savingsAccounts: [
        {
          accountNumber: "SA-001",
          accountType: "Voluntary",
          openingBalance: 100000,
        },
        {
          accountNumber: "SA-002",
          accountType: "Shares",
          openingBalance: 250000,
        },
      ],
      loan: {
        applicationId: "OB-2606-ABCD",
        productName: "Business Loan",
        principalAmount: 2_000_000,
        amountPaid: 1_500_000,
        outstanding: 500_000,
      },
      currency: "UGX",
    })
    expect(out.html).toContain("Savings opening balances")
    expect(out.html).toContain("SA-001")
    expect(out.html).toContain("Voluntary")
    expect(out.html).toContain("SA-002")
    expect(out.html).toContain("Shares")
    expect(out.html).toContain("Loan opening balance")
    expect(out.html).toContain("OB-2606-ABCD")
    expect(out.html).toContain("Business Loan")
    expect(out.html).toContain("Original principal")
    expect(out.html).toContain("Amount paid")
    expect(out.html).toContain("Outstanding balance")
  })

  it("renders test email template", () => {
    const out = renderEmailTemplate("email.test", { institutionName: "Demo MFI" })
    expect(out.html).toContain("Test email")
    expect(out.html).toContain("Demo MFI")
  })

  it("renders kyc submitted template", () => {
    const out = renderEmailTemplate("kyc.submitted", {
      institutionName: "Test SACCO",
      memberName: "Jane",
      memberNumber: "M-1",
      docTypeLabel: "National Id Front",
    })
    expect(out.html).toContain("submitted for review")
    expect(out.html).toContain("National Id Front")
  })

  it("renders kyc uploaded template for staff upload", () => {
    const out = renderEmailTemplate("kyc.uploaded", {
      institutionName: "Test SACCO",
      memberName: "Jane",
      memberNumber: "M-1",
      docTypeLabel: "Passport Photo",
    })
    expect(out.html).toContain("submitted successfully")
    expect(out.html).toContain("Passport Photo")
    expect(out.html).not.toContain("submitted for review")
  })

  it("renders kyc approved template", () => {
    const out = renderEmailTemplate("kyc.approved", {
      institutionName: "Test SACCO",
      memberName: "Jane",
      memberNumber: "M-1",
      docTypeLabel: "Passport Photo",
    })
    expect(out.html).toContain("verified successfully")
    expect(out.html).toContain("Passport Photo")
  })

  it("renders kyc rejected template with reason", () => {
    const out = renderEmailTemplate("kyc.rejected", {
      institutionName: "Test SACCO",
      memberName: "Jane",
      memberNumber: "M-1",
      docTypeLabel: "National Id Back",
      reason: "Image is blurry",
    })
    expect(out.html).toContain("not approved")
    expect(out.html).toContain("Image is blurry")
    expect(out.html).toContain("resubmit")
  })
})
