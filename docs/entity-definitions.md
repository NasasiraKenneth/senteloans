# SenteLoans Core Entity Definitions

## Table Naming Convention
All tables use the prefix `senteloans_` followed by the entity name in snake_case.

## Core Entities

### 1. senteloans_institutions
**Purpose**: Multi-tenant root entity for financial institutions

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique institution identifier |
| name | VARCHAR(255) | NOT NULL | Institution name |
| type | ENUM | NOT NULL | 'SACCO', 'MFI', 'Money Lender' |
| registration_number | VARCHAR(100) | UNIQUE | Official registration number |
| contact_email | VARCHAR(255) | | Primary contact email |
| contact_phone | VARCHAR(20) | | Primary contact phone |
| address | TEXT | | Physical address |
| modules_enabled | JSONB | | Enabled modules configuration |
| settings | JSONB | | Institution-specific settings |
| status | ENUM | DEFAULT 'Active' | 'Active', 'Suspended', 'Closed' |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

### 2. senteloans_users
**Purpose**: Authentication and authorization for system users

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique user identifier |
| institution_id | UUID | FOREIGN KEY | Reference to institution |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Login email |
| password_hash | VARCHAR(255) | NOT NULL | Hashed password |
| full_name | VARCHAR(255) | NOT NULL | User's full name |
| role | ENUM | NOT NULL | User role within institution |
| permissions | JSONB | | Specific permissions |
| status | ENUM | DEFAULT 'Active' | 'Active', 'Suspended', 'Inactive' |
| last_login | TIMESTAMPTZ | | Last login timestamp |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Roles**: 'system_admin', 'institution_admin', 'manager', 'loan_officer', 'teller', 'client'

### 3. senteloans_clients
**Purpose**: Customer/member records for each institution

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique client identifier |
| institution_id | UUID | FOREIGN KEY | Reference to institution |
| client_number | VARCHAR(50) | NOT NULL | Institution-specific client number |
| full_name | VARCHAR(255) | NOT NULL | Client's full name |
| date_of_birth | DATE | NOT NULL | Date of birth |
| gender | ENUM | NOT NULL | 'Male', 'Female', 'Other' |
| marital_status | ENUM | | 'Single', 'Married', 'Divorced', 'Widowed' |
| client_type | ENUM | NOT NULL | 'Individual', 'Group', 'Corporate' |
| phone_number | VARCHAR(20) | NOT NULL | Primary phone number |
| email | VARCHAR(255) | | Email address |
| national_id | VARCHAR(50) | NOT NULL | National ID number |
| district | VARCHAR(100) | | District/region |
| village | VARCHAR(100) | | Village/area |
| occupation | VARCHAR(100) | | Primary occupation |
| monthly_income | DECIMAL(15,2) | | Declared monthly income |
| loan_officer | VARCHAR(255) | | Assigned loan officer |
| next_of_kin_name | VARCHAR(255) | | Next of kin name |
| next_of_kin_relationship | VARCHAR(100) | | Relationship to next of kin |
| next_of_kin_phone | VARCHAR(20) | | Next of kin phone |
| passport_photo | VARCHAR(500) | | Photo file path/URL |
| national_id_front | VARCHAR(500) | | ID front image path/URL |
| national_id_back | VARCHAR(500) | | ID back image path/URL |
| kyc_status | ENUM | DEFAULT 'Pending' | 'Pending', 'Verified', 'Rejected' |
| status | ENUM | DEFAULT 'Active' | 'Active', 'Dormant', 'Closed' |
| join_date | DATE | NOT NULL | Date joined institution |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Unique Constraints**: (institution_id, client_number), (institution_id, national_id)

### 4. senteloans_client_shares
**Purpose**: Share ownership for SACCO clients (conditional table)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique share record identifier |
| member_id | UUID | FOREIGN KEY | Reference to member |
| transaction_id | UUID | FOREIGN KEY | Reference to transaction |
| acquisition_type | VARCHAR(30) | NOT NULL | Acquisition type ('purchase', 'transfer_in', 'transfer_out', 'redemption') |
| transfer_type | VARCHAR(30) | NULL | Transfer direction ('from', 'to') |
| transfer_member_id | UUID | NULL | Counterparty member for transfers |
| number_of_shares | INTEGER | NOT NULL | Number of shares transacted |
| share_value | DECIMAL(15,2) | NOT NULL | Value per share |
| total_value | DECIMAL(15,2) | | Total transaction value |
| remaining_shares | INTEGER | NOT NULL | Cumulative total shares owned |
| date | DATE | NOT NULL | Date of share transaction |
| status | VARCHAR(20) | NOT NULL | Status ('active', etc.) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

### 5. senteloans_loan_products
**Purpose**: Loan product definitions per institution

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique product identifier |
| institution_id | UUID | FOREIGN KEY | Reference to institution |
| name | VARCHAR(255) | NOT NULL | Product name |
| description | TEXT | | Product description |
| min_amount | DECIMAL(15,2) | NOT NULL | Minimum loan amount |
| max_amount | DECIMAL(15,2) | NOT NULL | Maximum loan amount |
| interest_rate | DECIMAL(5,2) | NOT NULL | Annual interest rate (%) |
| min_tenure | INTEGER | NOT NULL | Minimum tenure (months) |
| max_tenure | INTEGER | NOT NULL | Maximum tenure (months) |
| requires_collateral | BOOLEAN | DEFAULT FALSE | Collateral requirement |
| status | ENUM | DEFAULT 'Active' | 'Active', 'Inactive' |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

### 6. senteloans_loans
**Purpose**: Individual loan records and tracking

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique loan identifier |
| institution_id | UUID | FOREIGN KEY | Reference to institution |
| client_id | UUID | FOREIGN KEY | Reference to client |
| loan_product_id | UUID | FOREIGN KEY | Reference to loan product |
| application_id | VARCHAR(50) | NOT NULL | Institution-specific application ID |
| principal_amount | DECIMAL(15,2) | NOT NULL | Loan principal amount |
| interest_rate | DECIMAL(5,2) | NOT NULL | Applied interest rate |
| tenure | INTEGER | NOT NULL | Loan tenure in months |
| monthly_payment | DECIMAL(15,2) | | Calculated monthly payment |
| total_amount | DECIMAL(15,2) | | Total amount to be repaid |
| outstanding_balance | DECIMAL(15,2) | NOT NULL | Current outstanding balance |
| status | ENUM | NOT NULL | Loan status |
| purpose | TEXT | | Loan purpose description |
| collateral | TEXT | | Collateral description |
| application_date | DATE | NOT NULL | Application submission date |
| approval_date | DATE | | Loan approval date |
| disbursement_date | DATE | | Loan disbursement date |
| maturity_date | DATE | | Loan maturity date |
| next_payment_date | DATE | | Next payment due date |
| overdue_days | INTEGER | DEFAULT 0 | Days overdue |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Loan Status**: 'Applied', 'Under Review', 'Approved', 'Disbursed', 'Active', 'Closed', 'Defaulted', 'Rejected'
**Unique Constraints**: (institution_id, application_id)

### 7. senteloans_savings_accounts
**Purpose**: Savings account records (not applicable for Money Lenders)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique account identifier |
| institution_id | UUID | FOREIGN KEY | Reference to institution |
| client_id | UUID | FOREIGN KEY | Reference to client |
| account_number | VARCHAR(50) | NOT NULL | Institution-specific account number |
| account_type | ENUM | NOT NULL | Account type |
| available_balance | DECIMAL(15,2) | DEFAULT 0 | Available balance |
| total_balance | DECIMAL(15,2) | DEFAULT 0 | Total balance |
| minimum_balance | DECIMAL(15,2) | DEFAULT 0 | Minimum required balance |
| interest_rate | DECIMAL(5,2) | DEFAULT 0 | Annual interest rate |
| status | ENUM | DEFAULT 'Active' | 'Active', 'Dormant', 'Closed' |
| open_date | DATE | NOT NULL | Account opening date |
| last_transaction_date | DATE | | Last transaction date |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Account Types**: 'Voluntary', 'Fixed', 'Shares', 'Current'
**Unique Constraints**: (institution_id, account_number)

### 8. senteloans_transactions
**Purpose**: All financial transaction records

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique transaction identifier |
| institution_id | UUID | FOREIGN KEY | Reference to institution |
| client_id | UUID | FOREIGN KEY | Reference to client |
| account_id | UUID | FOREIGN KEY | Reference to account (nullable) |
| loan_id | UUID | FOREIGN KEY | Reference to loan (nullable) |
| transaction_number | VARCHAR(50) | NOT NULL | Institution-specific transaction number |
| type | ENUM | NOT NULL | Transaction type |
| amount | DECIMAL(15,2) | NOT NULL | Transaction amount |
| mode | ENUM | NOT NULL | Payment mode |
| description | TEXT | | Transaction description |
| reference_number | VARCHAR(100) | | External reference number |
| balance_before | DECIMAL(15,2) | | Balance before transaction |
| balance_after | DECIMAL(15,2) | | Balance after transaction |
| processed_by | UUID | FOREIGN KEY | User who processed transaction |
| transaction_date | TIMESTAMPTZ | NOT NULL | Transaction date and time |
| status | ENUM | DEFAULT 'Completed' | 'Pending', 'Completed', 'Failed', 'Reversed' |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Transaction Types**: 'Deposit', 'Withdrawal', 'Transfer', 'Loan Disbursement', 'Loan Repayment', 'Interest Payment', 'Fee Payment'
**Payment Modes**: 'Cash', 'Mobile Money', 'Bank Transfer', 'Cheque', 'Card'
**Unique Constraints**: (institution_id, transaction_number)

## Indexes and Performance

### Primary Indexes
- All tables have UUID primary keys with B-tree indexes
- Foreign key columns automatically indexed

### Performance Indexes
\`\`\`sql
-- Multi-tenant access patterns
CREATE INDEX idx_clients_institution_id ON senteloans_clients(institution_id);
CREATE INDEX idx_loans_institution_id ON senteloans_loans(institution_id);
CREATE INDEX idx_transactions_institution_id ON senteloans_transactions(institution_id);

-- Common query patterns
CREATE INDEX idx_clients_status ON senteloans_clients(institution_id, status);
CREATE INDEX idx_loans_status ON senteloans_loans(institution_id, status);
CREATE INDEX idx_transactions_date ON senteloans_transactions(institution_id, transaction_date);
CREATE INDEX idx_loans_client_id ON senteloans_loans(client_id);
CREATE INDEX idx_transactions_client_id ON senteloans_transactions(client_id);

-- Unique business constraints
CREATE UNIQUE INDEX idx_clients_number ON senteloans_clients(institution_id, client_number);
CREATE UNIQUE INDEX idx_loans_application ON senteloans_loans(institution_id, application_id);
CREATE UNIQUE INDEX idx_accounts_number ON senteloans_savings_accounts(institution_id, account_number);
