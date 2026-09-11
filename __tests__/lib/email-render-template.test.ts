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

  it("renders member shares invoice template", () => {
    const out = renderEmailTemplate("member.shares_invoice", {
      institutionName: "Test SACCO",
      memberName: "Jane Doe",
      memberNumber: "M-001",
      invoiceNumber: "INV-SHARES-001",
      amount: 100000,
      currency: "UGX",
      dueDate: "2026-10-01",
    })
    expect(out.html).toContain("Initial shares purchase invoice")
    expect(out.html).toContain("INV-SHARES-001")
    expect(out.html).toContain("minimum shares purchase holding")
    expect(out.html).toContain("100,000")
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

  it("renders loan payment received with receipt attachment note", () => {
    const out = renderEmailTemplate("loan.payment_received", {
      institutionName: "Test SACCO",
      memberName: "Jane",
      memberNumber: "M-1",
      applicationId: "LN-2024-001",
      amount: 150_000,
      balanceAfter: 850_000,
      paymentDate: "2026-06-17",
      currency: "UGX",
      transactionNumber: "TXN-300",
    })
    expect(out.html).toContain("LN-2024-001")
    expect(out.html).toContain("150,000")
    expect(out.html).toContain("850,000")
    expect(out.html).toContain("TXN-300")
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

  it("renders loan application submitted for member", () => {
    const out = renderEmailTemplate("loan.application_submitted", {
      institutionName: "Test SACCO",
      memberName: "Jane Doe",
      memberNumber: "M-001",
      applicationId: "LN-1001",
      principalAmount: 500000,
      loanType: "Normal",
      productName: "Salary Loan",
      currency: "UGX",
    })
    expect(out.html).toContain("LN-1001")
    expect(out.html).toContain("Salary Loan")
    expect(out.text).toContain("Loan application submitted")
  })

  it("renders pending loan approval for staff", () => {
    const out = renderEmailTemplate("loan.pending_approval", {
      institutionName: "Test SACCO",
      staffName: "Alex",
      memberName: "Jane Doe",
      memberNumber: "M-001",
      applicationId: "LN-1001",
      principalAmount: 500000,
      loanType: "Top-up",
      productName: "Salary Loan",
      currency: "UGX",
    })
    expect(out.html).toContain("Alex")
    expect(out.html).toContain("Jane Doe")
    expect(out.html).toContain("Top-up")
    expect(out.text).toContain("New loan application")
  })

  it("renders loan under review for member", () => {
    const out = renderEmailTemplate("loan.under_review", {
      institutionName: "Test SACCO",
      memberName: "Jane Doe",
      memberNumber: "M-001",
      applicationId: "LN-1001",
      principalAmount: 500000,
      currency: "UGX",
    })
    expect(out.html).toContain("under review")
    expect(out.html).toContain("LN-1001")
    expect(out.text).toContain("Loan under review")
  })

  it("renders loan reviewed for member", () => {
    const out = renderEmailTemplate("loan.reviewed", {
      institutionName: "Test SACCO",
      memberName: "Jane Doe",
      memberNumber: "M-001",
      applicationId: "LN-1001",
      principalAmount: 500000,
      currency: "UGX",
    })
    expect(out.html).toContain("has been reviewed")
    expect(out.text).toContain("Loan review complete")
  })

  it("renders loan status change for member", () => {
    const out = renderEmailTemplate("loan.status_change", {
      institutionName: "Test SACCO",
      memberName: "Jane Doe",
      memberNumber: "M-001",
      applicationId: "LN-1001",
      principalAmount: 500000,
      statusLabel: "Under Review",
      currency: "UGX",
    })
    expect(out.html).toContain("Under Review")
    expect(out.html).toContain("LN-1001")
    expect(out.text).toContain("Loan status update")
  })

  it("renders loan partially disbursed for member", () => {
    const out = renderEmailTemplate("loan.partially_disbursed", {
      institutionName: "Test SACCO",
      memberName: "Jane Doe",
      memberNumber: "M-001",
      applicationId: "LN-1001",
      principalAmount: 500000,
      currency: "UGX",
    })
    expect(out.html).toContain("partial disbursement")
    expect(out.text).toContain("Loan partially disbursed")
  })

  it("renders loan approved for member", () => {
    const out = renderEmailTemplate("loan.approved", {
      institutionName: "Test SACCO",
      memberName: "Jane Doe",
      memberNumber: "M-001",
      applicationId: "LN-1001",
      principalAmount: 500000,
      currency: "UGX",
    })
    expect(out.html).toContain("approved")
    expect(out.text).toContain("Loan application approved")
  })

  it("renders loan rejected for member", () => {
    const out = renderEmailTemplate("loan.rejected", {
      institutionName: "Test SACCO",
      memberName: "Jane Doe",
      memberNumber: "M-001",
      applicationId: "LN-1001",
      principalAmount: 500000,
      currency: "UGX",
    })
    expect(out.html).toContain("not approved")
  })

  it("renders loan disbursed for member", () => {
    const out = renderEmailTemplate("loan.disbursed", {
      institutionName: "Test SACCO",
      memberName: "Jane Doe",
      memberNumber: "M-001",
      applicationId: "LN-1001",
      principalAmount: 500000,
      currency: "UGX",
    })
    expect(out.html).toContain("fully disbursed")
  })

  it("renders loan ready for approval for staff", () => {
    const out = renderEmailTemplate("loan.ready_for_approval", {
      institutionName: "Test SACCO",
      staffName: "Alex",
      memberName: "Jane Doe",
      memberNumber: "M-001",
      applicationId: "LN-1001",
      principalAmount: 500000,
      currency: "UGX",
    })
    expect(out.html).toContain("Alex")
    expect(out.html).toContain("reviewed")
    expect(out.text).toContain("Loan ready for approval")
  })

  it("renders loan under review for staff", () => {
    const out = renderEmailTemplate("loan.under_review_staff", {
      institutionName: "Test SACCO",
      staffName: "Alex",
      memberName: "Jane Doe",
      memberNumber: "M-001",
      applicationId: "LN-1001",
      principalAmount: 500000,
      currency: "UGX",
    })
    expect(out.html).toContain("under review")
    expect(out.html).toContain("Alex")
  })

  it("renders loan fully disbursed for staff", () => {
    const out = renderEmailTemplate("loan.fully_disbursed_staff", {
      institutionName: "Test SACCO",
      staffName: "Alex",
      memberName: "Jane Doe",
      memberNumber: "M-001",
      applicationId: "LN-1001",
      principalAmount: 500000,
      currency: "UGX",
    })
    expect(out.html).toContain("fully disbursed")
    expect(out.html).toContain("Alex")
  })

  it("renders institution logo image when logo url is provided", () => {
    const out = renderEmailTemplate("member.welcome", {
      institutionName: "Kabalagala SACCO",
      institutionLogo: "https://example.com/logo.png",
      memberName: "Jane Doe",
      memberNumber: "M-001",
    })
    expect(out.html).toContain('<img src="https://example.com/logo.png"')
    expect(out.html).toContain('alt="Kabalagala SACCO"')
  })

  it("renders fallback monogram when institution logo is null or empty", () => {
    const out = renderEmailTemplate("member.welcome", {
      institutionName: "Kabalagala SACCO",
      institutionLogo: null,
      memberName: "Jane Doe",
      memberNumber: "M-001",
    })
    expect(out.html).not.toContain("<img")
    expect(out.html).toContain("K")
  })
})
