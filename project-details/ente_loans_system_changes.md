# SenteLoans System Changes for Multi-Institutional Support

This document outlines the necessary system-wide adjustments for SenteLoans to effectively cater to SACCOs, Money Lenders, and Microfinance Institutions (MFIs), moving beyond a purely member-based and savings-driven model. The core principle guiding these changes is **configurability and modularity**, allowing each institution type to tailor the application to its specific operational and regulatory needs.

## 1. Core Terminology & UI Adaptation

*   **Dynamic Labeling:** Implement a system-wide configurable setting for the primary client identifier (e.g., "Member," "Client," "Borrower," "Customer"). All UI elements (labels, column headers, dropdowns, system messages) should dynamically reflect this chosen terminology based on the institution's configuration.
*   **Adaptive User Interface:** The UI must dynamically adjust based on the institution's type and enabled modules. This includes hiding irrelevant navigation links, dashboard widgets, and input fields (e.g., savings-related elements for Money Lenders).

## 2. Savings & Shares Management Module

*   **Optional Module:** The entire "Savings & Shares Management" module (Epic 3 in PRD) must become optional. A clear administrative setting should allow institutions to enable or disable this module.
*   **Conditional Visibility:** If disabled, the module should be completely hidden from the main navigation, client profiles, dashboards, and any related forms (e.g., during client onboarding or transaction initiation).
*   **Granular Control:** Specific sub-features within this module, such as "Shares Management" (US3.3), should also be independently configurable if an MFI, for example, offers voluntary savings but not shares.

## 3. Transactions Module

*   **Dynamic Transaction Types:** The "Transaction Initiation Flow" (US4.1) must dynamically adjust the available transaction types based on the enabled modules. For instance, if the Savings module is disabled, options like "Deposit to Savings" and "Withdrawal from Savings" should not appear. Only loan-related transactions (disbursement, repayment) would be available.
*   **Streamlined Account Selection:** The process for selecting an account during a transaction needs to be flexible, potentially bypassing savings account selection entirely for non-depositing institutions.

## 4. Reporting & Analytics Module

*   **Configurable Dashboards:** The main dashboard (US4.3) and detailed reports should dynamically display only relevant metrics. For Money Lenders, "Savings Portfolio" and "Shares Value" metrics would be irrelevant and should be hidden, with focus remaining on "Total Loan Portfolio," "NPL Ratio," "Collection Efficiency," and "Total Clients."
*   **Adaptive Report Generation:** Develop different report templates or configurable options for report generation. A SACCO might need a "Member Statement" that includes savings and shares, while a Money Lender would require a "Client Loan Statement" focused solely on loan transactions.
*   **Regulatory Compliance:** The system must be capable of generating specific compliance reports tailored to the unique regulatory requirements of SACCOs, MFIs, and Money Lenders in Uganda.

## 5. Loan Lifecycle Management Module

*   **Enhanced Loan Product Configuration:** The system needs to support a wider variety of loan products with highly configurable parameters, including different interest calculation methods (e.g., flat rate, reducing balance), various fees, and flexible repayment schedules, to cater to the diverse offerings of all institution types.
*   **Flexible Credit Assessment Data:** While automated credit scoring is out-of-scope for V1, the data points collected for credit assessment (US5.2) should be adaptable. Money Lenders might rely more on external credit bureau data or alternative data points than internal savings history.
*   **Collateral Management (Consideration):** For institutions that frequently use collateral, a dedicated feature for tracking and managing collateral might become a necessary addition.

## 6. Enhanced Client Profile Module

*   **Conditional Fields:** Fields related to "Shares" or "SACCO Membership Number" should be conditional and only appear if the institution is configured as a SACCO. Other universally relevant fields (contact, residence, income source, payout accounts) remain.
*   **Customizable KYC:** Allow for customization of required KYC documents based on the institution type and its specific regulatory and risk assessment needs.

## 7. System Administration & Settings

*   **Centralized Configuration:** Introduce a central administrative section where the institution type (SACCO, MFI, Money Lender) is defined. This setting will drive the dynamic behavior of all other modules.
*   **Module Management:** Provide a dedicated interface for enabling/disabling core modules (e.g., Savings & Shares) and specific sub-features.
*   **Terminology Customization:** Allow administrators to customize key labels (e.g., "Client," "Loan," "Savings Account") to ensure the application's language aligns with their internal operations.

## 8. API Integration Strategy

*   **Diverse Integration Needs:** The strategy for future API integrations (e.g., payment gateways) should account for the varied priorities of different institution types. Money Lenders might prioritize mobile money integrations, while SACCOs might also need integrations with core banking systems or SACCO federations.

These adjustments will ensure SenteLoans is a versatile and robust platform capable of serving the diverse needs of Uganda's financial institutions, maximizing its market appeal and utility.
