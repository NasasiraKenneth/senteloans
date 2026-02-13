# Impact Analysis: PRD Changes on User Onboarding Module

The recent revisions to the Product Requirements Document (PRD) for SenteLoans, aimed at accommodating Money Lenders and MFIs alongside SACCOs, have a significant and positive impact on the user onboarding module. The shift from a purely "Member Onboarding" to a more flexible "Client Onboarding" model necessitates changes in terminology, workflow, and underlying data structures.

## 1. Original PRD's Onboarding Focus (SACCO-Centric)

In the initial PRD, the onboarding process was explicitly designed around the SACCO model. Key aspects included:

*   **Terminology:** Exclusively used "Member" (e.g., US1.1: "register a new member").
*   **Implicit Membership:** Assumed that every individual onboarded would become a "member" of the SACCO, often implying a shareholding or savings relationship.
*   **Mandatory Savings Account:** US3.1 stated, "As the System, I must create a default savings account for every new member upon registration," making savings account creation an integral part of onboarding.
*   **KYC for Membership:** KYC (US1.3) was framed within the context of verifying a SACCO member.

This approach, while suitable for SACCOs, would create friction and unnecessary steps for Money Lenders and MFIs that operate on a client-lending model without mandatory membership or savings.

## 2. Changes Introduced in the Revised PRD

The revised PRD introduces critical changes to broaden the scope of onboarding:

*   **Expanded Product Vision (1.1):** The vision now explicitly includes "MFIs, and Money Lenders," indicating a broader target audience.
*   **Target Audience & Configurability (1.3):** A new section clearly defines the "SACCO Model" and "MFI/Money Lender Model," emphasizing that the system will be "configurable." This is the foundational change.
*   **Generalized Terminology (Epic 1, 2, 3, 4, 5, 7):** The term "Member" has been largely replaced with "Client" across all relevant user stories (US1.1, US1.2, US1.3, US2.1, US2.4, US2.5, US3.1, US3.2, US3.3, US4.1, US4.2, US5.1, US5.2, and Success Metrics). Crucially, US1.1 now states: "As a Loan Officer, I want to register a new **client** (configurable as 'member' for SACCOs)." This allows for dynamic labeling based on institution type.
*   **Conditional Savings Module (Epic 3):** US3.1, US3.2, and US3.3 now include the condition "if the Savings Module is enabled." This makes the creation of a default savings account and the management of savings/shares optional during onboarding, depending on the institution's configuration.
*   **Configurable UI (4. UX & Design Considerations):** A new point emphasizes that "The user interface must adapt based on the institution's configuration. For example, if the Savings Module is disabled, all savings-related navigation and fields should be hidden."

## 3. Impact on the User Onboarding Module

These changes have a profound impact on the design, development, and user experience of the onboarding module:

### a. **Flexibility in Terminology and Workflow:**

*   **Dynamic Labels:** The UI for onboarding will need to dynamically display "Register New Member" or "Register New Client" based on the institution's configured type. This ensures the language resonates with the specific user base.
*   **Streamlined Process for Non-Depositing Institutions:** For Money Lenders, the onboarding flow can now be significantly shorter. The system will skip or hide steps related to savings account creation, share allocation, and potentially certain membership-specific data points. This directly addresses the need for non-depositing institutions.
*   **Reduced Friction:** By removing irrelevant steps, the onboarding process becomes faster and more intuitive for institutions that don't operate on a SACCO model, improving operational efficiency (Objective 1).

### b. **Modular Functionality:**

*   **Conditional Logic:** The backend and frontend of the onboarding module must incorporate conditional logic. When a new client is being onboarded, the system will check the institution's configuration (e.g., `is_savings_enabled`). If `false`, the system will not attempt to create a default savings account (US3.1) and will not present savings-related fields in the UI.
*   **Decoupling of Savings:** The savings module is now effectively decoupled from the core client onboarding process. A client can exist in the system purely for loan purposes without needing a savings account, which is essential for Money Lenders.

### c. **UI/UX Adaptations:**

*   **Adaptive Forms:** Onboarding forms will need to be adaptive. Fields or sections related to savings and shares (e.g., "Initial Deposit," "Share Capital Contribution") will only appear if the savings module is enabled for that institution.
*   **Navigation Changes:** Post-onboarding, the client's profile view will also adapt. For Money Lender clients, the "Savings" tab or section would be absent, providing a cleaner interface focused on their loan portfolio.
*   **Clearer User Journeys:** The user journeys for Loan Officers and Managers will be clearer and less cluttered, as they will only see options relevant to their institution's operational model.

### d. **Data Model Implications:**

*   **Central `Client` Entity:** The core data model should revolve around a central `Client` entity, with `Membership` and `SavingsAccount` entities being optional and linked. This means a `Client` record can exist independently of a `Membership` or `SavingsAccount` record.
*   **Configuration Table:** A new configuration table or mechanism is needed to store institution-specific settings (e.g., `institution_type`, `default_client_term`, `savings_module_enabled`). This configuration will drive the dynamic behavior of the onboarding module.

## Conclusion

The PRD changes represent a crucial evolution for SenteLoans, transforming it from a niche SACCO solution into a versatile platform for a broader range of financial institutions. The impact on the user onboarding module is significant, requiring a shift towards highly configurable and modular design. This will enable SenteLoans to cater to the distinct operational models of Money Lenders and MFIs, ultimately expanding its market reach and strengthening its value proposition as a flexible digital backbone for Uganda's financial sector.
