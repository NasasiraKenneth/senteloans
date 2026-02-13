### **Product Requirements Document: SenteLoans Member/Borrower Portal**

**Version:** 1.0   
**Date:** September 3, 2025   
**Author:** Manus AI   
**Status:** Draft for Review

### 1\. Introduction & Strategic Overview

**1.1. Product Vision** To empower individual SACCO members and Money Lender borrowers in Uganda with transparent, convenient, and secure digital access to their financial information and services, fostering financial literacy and inclusion.

**1.2. Problem Statement** Individual members of SACCOs and borrowers from Money Lenders often face challenges in accessing their financial information, applying for services, and managing their accounts. These include:

*   **Lack of Transparency:** Difficulty in knowing their real-time balances, loan statuses, or transaction histories without physically visiting the institution.
*   **Inconvenience:** Time-consuming and costly trips to the SACCO/Money Lender office for simple inquiries or applications.
*   **Limited Access:** Inability to access services outside of business hours or from remote locations.
*   **Information Asymmetry:** Members/borrowers may not fully understand their loan terms, repayment schedules, or savings growth.

**1.3. Target Audience (Personas)**

*   **David, the SACCO Member / MFI Client (End-User):** A farmer/teacher/small business owner. Uses a smartphone. Wants a transparent, fast way to save, check balances, and apply for loans without unnecessary trips to the SACCO office.
    *   **Needs:** Easy access to account info, ability to apply for loans, view statements, make payments, update personal details.
    *   **Constraints:** May have limited data, older smartphones, varying levels of digital literacy.

### 2\. Goals & Objectives (OKRs)

*   **Objective 1:** Enhance client self-service capabilities.
    *   **KR1:** Achieve 70% reduction in client inquiries to SACCO/MFI staff for balance checks and statement requests within 6 months of launch.
    *   **KR2:** Achieve 60% of eligible clients initiating loan applications through the portal within the first year.
*   **Objective 2:** Improve client financial transparency and literacy.
    *   **KR1:** Achieve a client satisfaction (CSAT) score of over 4.5/5 on ease of understanding financial information.
    *   **KR2:** 80% of active clients view their repayment schedule or savings statement at least once a month.
*   **Objective 3:** Ensure secure and reliable access.
    *   **KR1:** Maintain 99.9% system uptime for the client portal.
    *   **KR2:** Zero reported security breaches related to client data access.

### 3\. User Stories & Feature Requirements (Prioritized - MoSCoW Method)

#### **Epic 1: Secure Account Access & Profile Management (Must Have)**

*   **US1.1:** As a Client, I want to securely log in to my portal using my registered phone number/email and a password, so I can access my financial information.
*   **US1.2:** As a Client, I want to be able to reset my password if I forget it, so I can regain access to my account.
*   **US1.3:** As a Client, I want to view my basic profile information (name, contact details) and update my contact information (phone, email, physical address), so my institution always has my correct details.
*   **US1.4:** As a Client, I want to complete my KYC profile by uploading photos of my ID and other documents through my phone, so that my application can be verified faster (aligns with main PRD US1.3).
*   **US1.5:** As a Client, I want to link my mobile money/bank details for disbursements and repayments, so that I can receive funds and make payments conveniently (aligns with main PRD US5.1).

#### **Epic 2: Financial Overview & History (Must Have)**

*   **US2.1:** As a Client, I want to see a clear dashboard summary of my financial standing with the institution, including:
    *   **For SACCO Members:** Total Savings Balance, Total Outstanding Loan Balance, Total Shares Value.
    *   **For Money Lender Borrowers:** Total Outstanding Loan Balance.
*   **US2.2:** As a Client, I want to view a list of all my loans, their current status (e.g., Active, Paid Off, Defaulted), next payment due date, and outstanding balance (aligns with main PRD US2.5).
*   **US2.3:** As a Client, I want to view my detailed loan repayment schedule, showing principal, interest, and due dates for each installment.
*   **US2.4 (Conditional - For SACCO Members/MFIs with Savings):** As a Client, I want to see my savings account summary, including available balance, and a history of all deposits and withdrawals (aligns with main PRD US3.2).
*   **US2.5 (Conditional - For SACCO Members):** As a Client, I want to view my shares summary, including the number of shares held and their total value.
*   **US2.6:** As a Client, I want to generate a statement of account for any date range and download it as a PDF for my records (aligns with main PRD US4.2).

#### **Epic 3: Loan Application & Management (Must Have)**

*   **US3.1:** As a Client, I want to view available loan products that I am eligible for, including their terms and conditions.
*   **US3.2:** As a Client, I want to apply for a new loan directly through the portal, providing necessary details (e.g., requested amount, purpose, tenure).
*   **US3.3:** As a Client, I want to track the status of my loan application (e.g., Submitted, Under Review, Approved, Rejected, Disbursed).
*   **US3.4:** As a Client, I want to receive notifications (in-app, SMS) about my loan application status changes, upcoming payment due dates, and successful payments.

#### **Epic 4: Repayments & Payments (Should Have - for V1.1)**

*   **US4.1:** As a Client, I want to make a loan repayment directly through the portal using mobile money (e.g., MTN Mobile Money, Airtel Money) or linked bank account.
*   **US4.2 (Conditional - For SACCO Members/MFIs with Savings):** As a Client, I want to initiate a deposit to my savings account through the portal using mobile money or linked bank account.

### 4\. UX & Design Considerations (Ugandan Context)

*   **Mobile-First Design:** The portal MUST be optimized for low-cost Android smartphones and variable network speeds (2G/3G). This includes:
    *   Lightweight pages with minimal data usage.
    *   Offline capabilities for viewing cached data (if feasible).
    *   Large, clear buttons and readable fonts.
*   **Intuitive Navigation:** Simple, clear navigation that is easy for users with varying digital literacy levels.
*   **Language:** Support English and Luganda (and potentially other local languages) as configurable options.
*   **Data Transparency:** Clearly present financial data in an easy-to-understand format (e.g., simple charts for loan progress, clear tables for transactions).
*   **Security:** Implement strong authentication (MFA consideration), clear privacy policy, and secure data transmission.
*   **Conditional UI:** The portal MUST dynamically adapt its interface based on the institution type (SACCO vs. Money Lender) and the client type (Member vs. Borrower). This means hiding/showing modules and terminology.

### 5\. Non-Functional Requirements

*   **Security:** All client data encrypted in transit (HTTPS) and at rest. Strong password policies. Session management.
*   **Performance:** Critical pages (login, dashboard, loan application) should load in <3 seconds on a typical Ugandan mobile connection.
*   **Scalability:** The architecture should support thousands of concurrent users.
*   **Reliability:** High availability to ensure clients can access their information whenever needed.

### 6\. Out-of-Scope (For V1)

*   **Peer-to-Peer Lending Features.**
*   **Investment Products (beyond basic shares).**
*   **Complex Financial Planning Tools.**
*   **Direct Chat with Loan Officer (beyond basic inquiry forms).**

### 7\. Success Metrics

*   **Activation:** % of onboarded clients who successfully log in and view their dashboard.
*   **Engagement:** Daily/Weekly Active Users (DAU/WAU) of the portal.
*   **Self-Service Rate:** % of loan applications initiated via the portal; % of balance inquiries handled via the portal.
*   **Transaction Completion Rate:** (Post V1.1) % of successful repayments/deposits made via the portal.

---
