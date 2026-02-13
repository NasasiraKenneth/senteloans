### **Product Requirements Document: Sente Loans**

**Version:** 3.0   
**Date:** September 5, 2025   
**Author:** David Okwii, with strategic guidance from a Senior PM (FANG background)   
**Status:** Revised Draft for Review

### 1\. Introduction & Strategic Overview

**1.1. Product Vision** To become the most trusted and efficient digital backbone for **SACCOs, Credit Cooperatives, MFIs, and Money Lenders in Uganda**, empowering them to provide seamless financial services, drive client growth, and foster economic resilience in their communities. This includes both institutional management tools and client-facing self-service portals.

**1.2. Problem Statement** Ugandan financial institutions, including SACCOs and MFIs, currently rely on cumbersome, often manual or legacy systems (like spreadsheets and paper files) to manage clients, loans, and savings. Additionally, individual members and borrowers face challenges accessing their financial information and services. This leads to:

* **Operational Inefficiency:** High administrative overhead, slow loan processing, and error-prone record keeping.  
* **Poor Client Experience:** Delays in accessing statements, applying for loans, and updating information. Clients often need to physically visit offices for simple inquiries.
* **Limited Transparency:** Clients lack real-time access to their balances, loan statuses, or transaction histories.
* **Limited Data Insights:** Inability to leverage client data for risk assessment, product personalization, and strategic decision-making.  
* **Compliance Risks:** Difficulty in maintaining accurate audit trails and generating necessary reports for regulatory bodies.

**1.3. Target Audience & Configurability**

The system will be configurable to serve different institutional models:

*   **SACCO Model:** Membership-based, with a focus on savings and loans for members.
*   **MFI/Money Lender Model:** Client-based, primarily focused on lending to the public, with optional savings components.

**Personas:**

0.  **Alex, the SenteLoans System Administrator (Platform User):** Responsible for onboarding new institutions, configuring system settings, and managing the overall platform. Ensures each institution gets the right configuration based on their operational model.
1.  **Samuel, the Manager (Primary User):** Tech-comfortable, concerned with portfolio health, operational efficiency, and regulatory compliance. His goal is to grow the institution securely.
2.  **Annet, the Loan Officer (Power User):** Manages client relationships. Needs quick access to client data, a smooth application process, and tools for collections. Often on the move.
3.  **David, the SACCO Member / MFI Client (End-User):** A farmer/teacher/small business owner. Uses a smartphone. Wants a transparent, fast way to manage their finances (save, check balances, apply for loans) without unnecessary trips to the office.
4.  **Grace, the Treasurer/Auditor (Occasional User):** Needs robust, clear, and downloadable reports for reconciliation, financial reporting, and audits.

### 2\. Goals & Objectives (OKRs)

* **Objective 1:** Dramatically improve operational efficiency for financial institutions.
  * **KR1:** Reduce average loan application processing time from 7 days to 48 hours within 6 months of launch.
  * **KR2:** Reduce data entry errors in client records by 95% year-over-year.
* **Objective 2:** Enhance the financial client experience.
  * **KR1:** Achieve a client satisfaction (CSAT) score of over 4.5/5 on ease of use.
  * **KR2:** Have 60% of eligible clients initiate a loan application through the portal within the first year.
* **Objective 3:** Ensure system reliability and security.
  * **KR1:** Maintain 99.9% system uptime.
  * **KR2:** Achieve 100% compliance with Ugandan data protection and financial regulations.

### 3\. User Stories & Feature Requirements (Prioritized - MoSCoW Method)

#### **Epic 0: System Administration & Institution Management (Must Have)**

*   **US0.1:** As a SenteLoans System Administrator, I want to onboard new institutions (SACCOs, MFIs, Money Lenders) through a step-by-step wizard, so that each institution gets properly configured based on their operational model.
    *   **Flow:** Institution Details -> Institution Type Selection -> Module Configuration -> Admin User Creation -> Confirmation
    *   **Fields:** Institution Name, Type, Contact Information, Address, Registration Details, Module Enablement (Loans, Savings, Shares), Client Terminology Configuration
*   **US0.2:** As a System Administrator, I want to view and manage all registered institutions from a centralized dashboard, so I can monitor platform usage and provide support.
    *   **Features:** Institution list, status monitoring, edit capabilities, user management, configuration updates
*   **US0.3:** As a System Administrator, I want to create initial admin accounts for new institutions with auto-generated secure passwords, so institution managers can immediately access their tailored dashboard.
*   **US0.4:** As a System Administrator, I want to configure which modules (Savings, Shares, Loans) are enabled for each institution type, so the UI adapts to show only relevant features.
*   **US0.5:** As a System Administrator, I want to edit institution details and configurations after onboarding, so I can update settings as institutions evolve their operations.

#### **Epic 1: Client Management & Onboarding (Must Have)**

*   **US1.1:** As a Loan Officer, I want to register a new **client** (configurable as 'member' for SACCOs) with their core biodata (name, phone, NIN), so that we can quickly onboard them and assign a unique client ID.
    *   **Fields:** Client Full Names, Phone Number (Primary Identifier), Email Address, National ID Number (NIN), Status (Active, Dormant, Closed), KYC Status (Pending, Verified, Rejected).
*   **US1.2:** As a Manager, I want to view and filter all **clients** based on status, KYC status, or loan officer, so that I can manage the portfolio effectively.
*   **US1.3:** As a **Client** (David), I want to complete my KYC profile by uploading photos of my ID and other documents through my phone, so that my application can be verified faster.

#### **Epic 2: Loan Lifecycle Management (Must Have)**

*   **US2.1:** As a Loan Officer (Annet), I want to create a new loan application for a **client**, selecting from pre-configured loan products, so I can start the approval process.
    *   **Fields:** Application ID, Client Name (auto-linked), Loan Product (dropdown), Requested Amount, Tenure (months), Purpose.
*   **US2.2:** As a Manager (Samuel), I want to see a dashboard of all loans with their status (Applied, Approved, Disbursed, Rejected, Closed, Defaulted), outstanding principal, and overdue days for risk management.
*   **US2.3:** As a System, I must automatically calculate interest (e.g., reducing balance) and generate a repayment schedule upon loan approval.
*   **US2.4:** As a Treasurer (Grace), I want to record a loan repayment (via cash, bank, or mobile money) against a specific loan, which updates the **client's** balance and transaction history.
*   **US2.5:** As a **Client** (David), I want to see a list of all my loans, their current status, next payment due date, and outstanding balance.

#### **Epic 3: Savings & Shares Management (Configurable Module - Must Have for SACCOs)**

*   **US3.1:** As the System, if the Savings Module is enabled, I must create a default savings account for every new **client** upon registration.
*   **US3.2:** As a **Client**, if the Savings Module is enabled, I want to see my savings account summary, including available balance, and a history of all deposits and withdrawals.
    *   **Fields:** Account Number, Saving Product, Type (e.g., Voluntary, Fixed), Balance (Available, Reserved, Total), Status.
*   **US3.3:** As a Manager, if the Savings Module is enabled, I want to manage **client** shares, including assigning shares from savings, tracking share value, and calculating dividends.
    *   **Fields:** Share Name, Number of Shares, Value per Share, Total Value, Profit Allocation.

#### **Epic 4: Transactions & Reporting (Must Have)**

*   **US4.1:** As a Teller, I want to initiate a new transaction for a **client's** account quickly. The available transaction types will depend on the enabled modules (e.g., loan repayment, savings deposit/withdrawal).
    *   **Flow:** Select Client -> Select Account Type (Loan, Savings) -> Select Transaction Type -> Enter Amount -> Select Mode (Cash, Mobile Money, Bank Transfer) -> Confirm.
*   **US4.2:** As a **Client** or Manager, I want to generate a statement of account for any date range and download it as a PDF for my records or for audit purposes.
*   **US4.3:** As a Manager, I want to view a dashboard with key metrics: Total Clients, Total Savings Portfolio (if applicable), Total Loan Portfolio, Non-Performing Loans (NPL) Ratio, Monthly Collection Efficiency.

#### **Epic 5: Client Portal & Self-Service (Must Have)**

*   **US5.1:** As a Client, I want to securely log in to my portal using my registered phone number/email and a password, so I can access my financial information.
*   **US5.2:** As a Client, I want to be able to reset my password if I forget it, so I can regain access to my account.
*   **US5.3:** As a Client, I want to see a clear dashboard summary of my financial standing with the institution, including:
    *   **For SACCO Members:** Total Savings Balance, Total Outstanding Loan Balance, Total Shares Value.
    *   **For Money Lender Borrowers:** Total Outstanding Loan Balance.
*   **US5.4:** As a Client, I want to view a list of all my loans, their current status (e.g., Active, Paid Off, Defaulted), next payment due date, and outstanding balance.
*   **US5.5:** As a Client, I want to view my detailed loan repayment schedule, showing principal, interest, and due dates for each installment.
*   **US5.6 (Conditional - For SACCO Members/MFIs with Savings):** As a Client, I want to see my savings account summary, including available balance, and a history of all deposits and withdrawals.
*   **US5.7 (Conditional - For SACCO Members):** As a Client, I want to view my shares summary, including the number of shares held and their total value.
*   **US5.8:** As a Client, I want to generate a statement of account for any date range and download it as a PDF for my records.
*   **US5.9:** As a Client, I want to view available loan products that I am eligible for, including their terms and conditions.
*   **US5.10:** As a Client, I want to apply for a new loan directly through the portal, providing necessary details (e.g., requested amount, purpose, tenure).
*   **US5.11:** As a Client, I want to track the status of my loan application (e.g., Submitted, Under Review, Approved, Rejected, Disbursed).
*   **US5.12:** As a Client, I want to receive notifications (in-app, SMS) about my loan application status changes, upcoming payment due dates, and successful payments.
*   **US5.13:** As a Client, I want to view my basic profile information (name, contact details) and update my contact information (phone, email, physical address), so my institution always has my correct details.
*   **US5.14:** As a Client, I want to complete my KYC profile by uploading photos of my ID and other documents through my phone, so that my application can be verified faster.
*   **US5.15:** As a Client, I want to link my mobile money/bank details for disbursements and repayments, so that I can receive funds and make payments conveniently.

#### **Epic 6: Enhanced Client Profile (Should Have)**

*   **US6.1:** As a Client, I want to securely update my residence details, income source information, and link multiple payout accounts for flexible disbursements and repayments.
    *   **Sections:**
        *   **Residence:** House Number, Village/City, District, Region.
        *   **Income Source:** Employment (Company, Monthly Income) **or** Business (Business Name, TIN, License No.).
        *   **Payout Accounts:** Mobile Money (Provider, Phone Number) **and/or** Bank (Bank Name, Account Number, Branch).
*   **US6.2:** As a Loan Officer, I want to view a client's complete profile, including income details and linked accounts, to make a better-informed lending decision.

#### **Epic 7: Payment Integration (Should Have - for V1.1)**

*   **US7.1:** As a Client, I want to make a loan repayment directly through the portal using mobile money (e.g., MTN Mobile Money, Airtel Money) or linked bank account.
*   **US7.2 (Conditional - For SACCO Members/MFIs with Savings):** As a Client, I want to initiate a deposit to my savings account through the portal using mobile money or linked bank account.

### 4\. UX & Design Considerations (Ugandan Context)

*   **Mobile-First Design:** The client portal must be optimized for low-cost Android smartphones and variable network speeds (2G/3G). This includes:
    *   Lightweight pages with minimal data usage.
    *   Offline capabilities for viewing cached data (if feasible).
    *   Large, clear buttons and readable fonts.
*   **Configurable UI:** The user interface must dynamically adapt based on the institution's configuration set during onboarding by the System Administrator. For example, if the Savings Module is disabled for a Money Lender, all savings-related navigation and fields are automatically hidden from their interface.
*   **Multi-Tenant Architecture:** Each institution operates in an isolated environment with their own branding, terminology (Member vs Client), and feature set, while sharing the same underlying platform infrastructure.
*   **USSD Integration (Could Have):** For clients without smartphones, consider a USSD code (e.g., *245*50#) to check balances and mini-statements. This is a key strategic differentiator.
*   **Language:** Support English and Luganda (or other local languages) in the client-facing interface.
*   **Data Sensitivity:** Clearly communicate how client data is used and stored. Design permission levels for officers (e.g., a loan officer can't approve their own loan).
*   **Security:** Implement strong authentication (MFA consideration), clear privacy policy, and secure data transmission for client portal access.

### 5\. Non-Functional Requirements

*   **Security:** All passwords must be hashed. Data encrypted in transit (HTTPS). Role-Based Access Control (RBAC) is mandatory.
*   **Performance:** Critical pages (login, dashboard) should load in <3 seconds on a typical Ugandan mobile connection.
*   **Scalability:** The architecture should support an institution with 10 **clients** scaling to 10,000+ **clients** without a complete redesign.
*   **Compliance:** The system must be able to generate reports required by the Ugandan Cooperatives Society and other financial regulators.
*   **Multi-Tenancy:** The system must support multiple institutions on a single platform with complete data isolation and configurable feature sets per institution.
*   **Admin Portal Security:** System administrator access must be secured with enhanced authentication and audit logging for all configuration changes.

### 6\. Technical Architecture Considerations

*   **Multi-Tenant Database Design:** Institution data must be completely isolated while allowing efficient system administration and reporting across the platform.
*   **Configuration Management:** Dynamic feature toggling based on institution type and admin-configured modules.
*   **Role-Based Access Control:** Hierarchical permissions supporting System Administrators, Institution Managers, and Institution Staff with appropriate access levels.
*   **Audit Trail:** Complete logging of all system administrator actions for compliance and troubleshooting.

### 7. Out-of-Scope (For V1)

*   **Full-Featured Mobile App:** Start with a responsive web app. A native mobile app can be a V2 goal.
*   **Integrated Payment Gateway:** Initial versions will record transactions manually. Integration with MTN Mobile Money API or Airtel Money API is a critical "Should Have" for V1.1.
*   **Complex Accounting:** This is a management system, not a full replacement for accounting software like QuickBooks, though it should export data to them.
*   **Automated Credit Scoring:** Initially, loan decisions will be manual. An algorithm-based scoring system is a great future enhancement.

### 8. Success Metrics

*   **Institutional Metrics:**
    *   **Activation:** % of registered clients who complete their full KYC profile.
    *   **Adoption:** Daily Active Users (DAU) among staff. Number of loan applications processed through the system per week.
    *   **Retention:** Client churn rate.
    *   **Task Success:** Time for a loan officer to process a repayment.
    *   **Platform Growth:** Number of institutions onboarded per month, institution type distribution (SACCO vs MFI vs Money Lender).
    *   **Configuration Effectiveness:** Time to complete institution onboarding, admin user activation rates.

*   **Client Portal Metrics:**
    *   **Client Activation:** % of onboarded clients who successfully log in and view their dashboard.
    *   **Client Engagement:** Daily/Weekly Active Users (DAU/WAU) of the client portal.
    *   **Self-Service Rate:** % of loan applications initiated via the portal; % of balance inquiries handled via the portal.
    *   **Client Satisfaction:** Achieve a client satisfaction (CSAT) score of over 4.5/5 on ease of understanding financial information.
    *   **Service Reduction:** 70% reduction in client inquiries to staff for balance checks and statement requests within 6 months of launch.
    *   **Transaction Completion Rate:** (Post V1.1) % of successful repayments/deposits made via the portal.

---

### **Next Steps & Recommendations**

1.  **Prototype & Validate:** Create wireframes for the key flows (client registration, loan application, repayment) and show them to real managers and officers from SACCOs, MFIs, and Money Lenders in Uganda. Their feedback is gold.
2.  **Technical Architecture:** Decide on the tech stack. Given the context, a robust backend (e.g., Python/Django, Node.js, Java/Spring) with a React frontend is a strong choice for scalability. The architecture must support the modular and configurable design.
3.  **Phased Rollout (MVP):** Build the "Must Haves" first. Your initial sketch is a great MVP blueprint. Launch with one or two pilot institutions (of different types), iron out the kinks, and then scale.
4.  **Monetization Strategy:** Consider a SaaS model: a monthly subscription fee based on the number of active **clients** (e.g., UGX 500 per client per month) or a small fee per loan transaction processed.

This revised PRD provides a more flexible and strategic foundation, catering to a broader market of financial institutions in Uganda. It's focused, user-centric, and built for the specific Ugandan market. Well done on identifying this crucial problem space. I'm excited to see Sente Loan come to life.
