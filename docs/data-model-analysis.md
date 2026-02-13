# SenteLoans Data Model Analysis - Phase 1

## Executive Summary
This document provides a comprehensive analysis of the current mock data structure and defines the core entities for the Supabase migration. All tables will use the `senteloans_` prefix for proper namespacing.

## Current Mock Data Analysis

### Core Entities Identified

#### 1. **Institutions** (Multi-Tenant Root)
- **Purpose**: Root entity for multi-tenancy
- **Current State**: Hardcoded in session management
- **Fields Needed**: 
  - Institution ID, name, type (SACCO/MFI/Money Lender)
  - Configuration settings, modules enabled
  - Contact information, registration details

#### 2. **Clients** (Previously Members)
- **Current Interface**: `Client` 
- **Key Fields**: 
  - Personal info (name, DOB, gender, marital status)
  - Contact details (phone, email, address)
  - KYC data (national ID, documents, verification status)
  - Financial info (income, occupation)
  - Relationship data (next of kin)
  - Institution-specific fields (shares for SACCOs)
- **Multi-Tenant**: Belongs to institution

#### 3. **Loans**
- **Current Interface**: `Loan`
- **Key Fields**:
  - Application tracking (application ID, dates)
  - Financial terms (principal, interest rate, tenure)
  - Status management (Applied → Approved → Disbursed → Closed/Defaulted)
  - Repayment tracking (outstanding balance, next payment, overdue days)
  - Risk management (purpose, collateral)
- **Multi-Tenant**: Belongs to institution via client

#### 4. **Savings Accounts**
- **Current Interface**: `SavingsAccount`
- **Key Fields**:
  - Account identification (account number, type)
  - Balance tracking (available, total)
  - Status and dates
- **Multi-Tenant**: Belongs to institution via client
- **Conditional**: Not applicable for Money Lenders

#### 5. **Transactions**
- **Current Interface**: `Transaction`
- **Key Fields**:
  - Transaction identification and linking
  - Financial details (amount, type, mode)
  - Audit trail (date, description, balance)
- **Multi-Tenant**: Belongs to institution via client/account

#### 6. **Users** (Authentication & Authorization)
- **Current State**: Missing - using localStorage
- **Required Fields**:
  - Authentication (email, password hash, tokens)
  - Profile (name, role, status)
  - Institution association
  - Permissions and access levels

## Entity Relationships

### Primary Relationships
\`\`\`
Institution (1) → (Many) Users
Institution (1) → (Many) Clients
Institution (1) → (Many) Loan_Products
Client (1) → (Many) Loans
Client (1) → (Many) Savings_Accounts
Client (1) → (Many) Transactions
Savings_Account (1) → (Many) Transactions
Loan (1) → (Many) Loan_Repayments
\`\`\`

### Cross-Entity Dependencies
- **Clients** depend on **Institution** for configuration
- **Loans** depend on **Clients** and **Loan_Products**
- **Transactions** can relate to **Savings_Accounts** or **Loans**
- **Users** have institution-scoped access to all entities

## Data Integrity Requirements

### Referential Integrity
- All child entities must reference valid parent entities
- Soft deletes for historical data preservation
- Cascade rules for data cleanup

### Business Logic Constraints
- Client numbers must be unique within institution
- Account numbers must be unique within institution
- Loan application IDs must be unique within institution
- Transaction amounts must be positive
- Loan balances cannot exceed principal + interest

### Audit Requirements
- Created/updated timestamps on all entities
- User tracking for all modifications
- Transaction logs for financial operations
- Status change history for loans and clients

## Multi-Tenant Considerations

### Data Isolation
- All entities scoped to institution_id
- Row-Level Security (RLS) policies required
- No cross-institution data access

### Configuration Flexibility
- Module enablement per institution type
- Custom fields per institution
- Terminology customization (Member/Client/Borrower)

### Performance Considerations
- Indexes on institution_id for all tables
- Partitioning for large transaction tables
- Optimized queries for dashboard statistics

## Next Steps
1. Create detailed entity relationship diagram
2. Design normalized database schema
3. Plan Row-Level Security policies
4. Define migration scripts structure
