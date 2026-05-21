# SenteLoans Entity Relationship Diagram

## Visual ERD Representation

\`\`\`mermaid
erDiagram
    INSTITUTIONS ||--o{ USERS : "employs"
    INSTITUTIONS ||--o{ CLIENTS : "serves"
    INSTITUTIONS ||--o{ LOAN_PRODUCTS : "offers"
    
    CLIENTS ||--o{ CLIENT_SHARES : "owns"
    CLIENTS ||--o{ LOANS : "applies_for"
    CLIENTS ||--o{ SAVINGS_ACCOUNTS : "holds"
    CLIENTS ||--o{ TRANSACTIONS : "performs"
    
    LOAN_PRODUCTS ||--o{ LOANS : "defines"
    
    LOANS ||--o{ LOAN_REPAYMENTS : "has"
    LOANS ||--o{ TRANSACTIONS : "generates"
    
    SAVINGS_ACCOUNTS ||--o{ TRANSACTIONS : "records"
    
    USERS ||--o{ TRANSACTIONS : "processes"
    USERS ||--o{ AUDIT_LOGS : "creates"

    INSTITUTIONS {
        uuid id PK
        varchar name
        enum type
        varchar registration_number UK
        varchar contact_email
        varchar contact_phone
        text address
        jsonb modules_enabled
        jsonb settings
        enum status
        timestamptz created_at
        timestamptz updated_at
    }

    USERS {
        uuid id PK
        uuid institution_id FK
        varchar email UK
        varchar password_hash
        varchar full_name
        enum role
        jsonb permissions
        enum status
        timestamptz last_login
        timestamptz created_at
        timestamptz updated_at
    }

    CLIENTS {
        uuid id PK
        uuid institution_id FK
        varchar client_number
        varchar full_name
        date date_of_birth
        enum gender
        enum marital_status
        enum client_type
        varchar phone_number
        varchar email
        varchar national_id
        varchar district
        varchar village
        varchar occupation
        decimal monthly_income
        varchar loan_officer
        varchar next_of_kin_name
        varchar next_of_kin_relationship
        varchar next_of_kin_phone
        varchar passport_photo
        varchar national_id_front
        varchar national_id_back
        enum kyc_status
        enum status
        date join_date
        timestamptz created_at
        timestamptz updated_at
    }

    CLIENT_SHARES {
        uuid id PK
        uuid client_id FK
        integer number_of_shares
        decimal share_value
        decimal total_value
        date purchase_date
        timestamptz created_at
        timestamptz updated_at
    }

    LOAN_PRODUCTS {
        uuid id PK
        uuid institution_id FK
        varchar name
        text description
        decimal min_amount
        decimal max_amount
        decimal interest_rate
        integer min_tenure
        integer max_tenure
        boolean requires_collateral
        enum status
        timestamptz created_at
        timestamptz updated_at
    }

    LOANS {
        uuid id PK
        uuid institution_id FK
        uuid client_id FK
        uuid loan_product_id FK
        varchar application_id
        decimal principal_amount
        decimal interest_rate
        integer tenure
        decimal monthly_payment
        decimal total_amount
        decimal outstanding_balance
        enum status
        text purpose
        text collateral
        date application_date
        date approval_date
        date disbursement_date
        date maturity_date
        date next_payment_date
        integer overdue_days
        timestamptz created_at
        timestamptz updated_at
    }

    SAVINGS_ACCOUNTS {
        uuid id PK
        uuid institution_id FK
        uuid client_id FK
        varchar account_number
        enum account_type
        decimal available_balance
        decimal total_balance
        decimal minimum_balance
        decimal interest_rate
        enum status
        date open_date
        date last_transaction_date
        timestamptz created_at
        timestamptz updated_at
    }

    TRANSACTIONS {
        uuid id PK
        uuid institution_id FK
        uuid client_id FK
        uuid account_id FK
        uuid loan_id FK
        varchar transaction_number
        enum type
        decimal amount
        enum mode
        text description
        varchar reference_number
        decimal balance_before
        decimal balance_after
        uuid processed_by FK
        timestamptz transaction_date
        enum status
        timestamptz created_at
        timestamptz updated_at
    }

    LOAN_REPAYMENTS {
        uuid id PK
        uuid loan_id FK
        decimal amount_due
        decimal amount_paid
        decimal principal_portion
        decimal interest_portion
        date due_date
        date payment_date
        enum status
        timestamptz created_at
        timestamptz updated_at
    }

    AUDIT_LOGS {
        uuid id PK
        uuid institution_id FK
        uuid user_id FK
        varchar table_name
        varchar operation
        jsonb old_values
        jsonb new_values
        timestamptz created_at
    }
\`\`\`

## Relationship Details

### 1. Institution-Centric Relationships

#### INSTITUTIONS → USERS (1:Many)
- **Relationship**: One institution employs many users
- **Foreign Key**: users.institution_id → institutions.id
- **Cascade**: RESTRICT (cannot delete institution with active users)
- **Business Rule**: Users can only belong to one institution

#### INSTITUTIONS → CLIENTS (1:Many)
- **Relationship**: One institution serves many clients
- **Foreign Key**: clients.institution_id → institutions.id
- **Cascade**: RESTRICT (cannot delete institution with clients)
- **Business Rule**: Clients are isolated per institution

#### INSTITUTIONS → LOAN_PRODUCTS (1:Many)
- **Relationship**: One institution offers many loan products
- **Foreign Key**: loan_products.institution_id → institutions.id
- **Cascade**: CASCADE (delete products when institution is deleted)
- **Business Rule**: Loan products are institution-specific

### 2. Client-Centric Relationships

#### CLIENTS → CLIENT_SHARES (1:Many)
- **Relationship**: One client can own multiple share purchases
- **Foreign Key**: client_shares.client_id → clients.id
- **Cascade**: CASCADE (delete shares when client is deleted)
- **Business Rule**: Only applicable for SACCO institutions

#### CLIENTS → LOANS (1:Many)
- **Relationship**: One client can have multiple loans
- **Foreign Key**: loans.client_id → clients.id
- **Cascade**: RESTRICT (cannot delete client with active loans)
- **Business Rule**: Loan history must be preserved

#### CLIENTS → SAVINGS_ACCOUNTS (1:Many)
- **Relationship**: One client can have multiple savings accounts
- **Foreign Key**: savings_accounts.client_id → clients.id
- **Cascade**: RESTRICT (cannot delete client with active accounts)
- **Business Rule**: Not applicable for Money Lender institutions

#### CLIENTS → TRANSACTIONS (1:Many)
- **Relationship**: One client performs many transactions
- **Foreign Key**: transactions.client_id → clients.id
- **Cascade**: RESTRICT (preserve transaction history)
- **Business Rule**: All transactions must be linked to a client

### 3. Product and Service Relationships

#### LOAN_PRODUCTS → LOANS (1:Many)
- **Relationship**: One loan product can be used for many loans
- **Foreign Key**: loans.loan_product_id → loan_products.id
- **Cascade**: RESTRICT (cannot delete product with active loans)
- **Business Rule**: Loan terms are copied from product at application time

#### LOANS → LOAN_REPAYMENTS (1:Many)
- **Relationship**: One loan has many repayment schedules/records
- **Foreign Key**: loan_repayments.loan_id → loans.id
- **Cascade**: CASCADE (delete repayments when loan is deleted)
- **Business Rule**: Repayment schedule generated at loan disbursement

#### LOANS → TRANSACTIONS (1:Many)
- **Relationship**: One loan generates many transactions (disbursement, repayments)
- **Foreign Key**: transactions.loan_id → loans.id
- **Cascade**: RESTRICT (preserve transaction history)
- **Business Rule**: Loan-related transactions must reference the loan

#### SAVINGS_ACCOUNTS → TRANSACTIONS (1:Many)
- **Relationship**: One savings account has many transactions
- **Foreign Key**: transactions.account_id → savings_accounts.id
- **Cascade**: RESTRICT (preserve transaction history)
- **Business Rule**: Account transactions must reference the account

### 4. Operational Relationships

#### USERS → TRANSACTIONS (1:Many)
- **Relationship**: One user processes many transactions
- **Foreign Key**: transactions.processed_by → users.id
- **Cascade**: RESTRICT (preserve audit trail)
- **Business Rule**: All transactions must have a processing user

#### USERS → AUDIT_LOGS (1:Many)
- **Relationship**: One user creates many audit log entries
- **Foreign Key**: audit_logs.user_id → users.id
- **Cascade**: RESTRICT (preserve audit trail)
- **Business Rule**: All system changes must be logged

## Referential Integrity Rules

### Primary Key Constraints
- All tables use UUID primary keys for global uniqueness
- UUIDs prevent ID collision in multi-tenant environment
- Enable distributed system scalability

### Foreign Key Constraints
\`\`\`sql
-- Institution relationships
ALTER TABLE senteloans_users ADD CONSTRAINT fk_users_institution 
    FOREIGN KEY (institution_id) REFERENCES senteloans_institutions(id) ON DELETE RESTRICT;

ALTER TABLE senteloans_clients ADD CONSTRAINT fk_clients_institution 
    FOREIGN KEY (institution_id) REFERENCES senteloans_institutions(id) ON DELETE RESTRICT;

ALTER TABLE senteloans_loan_products ADD CONSTRAINT fk_loan_products_institution 
    FOREIGN KEY (institution_id) REFERENCES senteloans_institutions(id) ON DELETE CASCADE;

-- Client relationships
ALTER TABLE senteloans_client_shares ADD CONSTRAINT fk_client_shares_client 
    FOREIGN KEY (client_id) REFERENCES senteloans_clients(id) ON DELETE CASCADE;

ALTER TABLE senteloans_loans ADD CONSTRAINT fk_loans_client 
    FOREIGN KEY (client_id) REFERENCES senteloans_clients(id) ON DELETE RESTRICT;

ALTER TABLE senteloans_savings_accounts ADD CONSTRAINT fk_savings_accounts_client 
    FOREIGN KEY (client_id) REFERENCES senteloans_clients(id) ON DELETE RESTRICT;

-- Product relationships
ALTER TABLE senteloans_loans ADD CONSTRAINT fk_loans_product 
    FOREIGN KEY (loan_product_id) REFERENCES senteloans_loan_products(id) ON DELETE RESTRICT;

-- Transaction relationships
ALTER TABLE senteloans_transactions ADD CONSTRAINT fk_transactions_client 
    FOREIGN KEY (client_id) REFERENCES senteloans_clients(id) ON DELETE RESTRICT;

ALTER TABLE senteloans_transactions ADD CONSTRAINT fk_transactions_account 
    FOREIGN KEY (account_id) REFERENCES senteloans_savings_accounts(id) ON DELETE RESTRICT;

ALTER TABLE senteloans_transactions ADD CONSTRAINT fk_transactions_loan 
    FOREIGN KEY (loan_id) REFERENCES senteloans_loans(id) ON DELETE RESTRICT;

ALTER TABLE senteloans_transactions ADD CONSTRAINT fk_transactions_processed_by 
    FOREIGN KEY (processed_by) REFERENCES senteloans_users(id) ON DELETE RESTRICT;

-- Repayment relationships
ALTER TABLE senteloans_loan_repayments ADD CONSTRAINT fk_loan_repayments_loan 
    FOREIGN KEY (loan_id) REFERENCES senteloans_loans(id) ON DELETE CASCADE;

-- Audit relationships
ALTER TABLE senteloans_audit_logs ADD CONSTRAINT fk_audit_logs_institution 
    FOREIGN KEY (institution_id) REFERENCES senteloans_institutions(id) ON DELETE RESTRICT;

ALTER TABLE senteloans_audit_logs ADD CONSTRAINT fk_audit_logs_user 
    FOREIGN KEY (user_id) REFERENCES senteloans_users(id) ON DELETE RESTRICT;
\`\`\`

### Unique Constraints
\`\`\`sql
-- Business unique constraints
ALTER TABLE senteloans_institutions ADD CONSTRAINT uk_institutions_registration 
    UNIQUE (registration_number);

ALTER TABLE senteloans_users ADD CONSTRAINT uk_users_email 
    UNIQUE (email);

ALTER TABLE senteloans_clients ADD CONSTRAINT uk_clients_number 
    UNIQUE (institution_id, client_number);

ALTER TABLE senteloans_clients ADD CONSTRAINT uk_clients_national_id 
    UNIQUE (institution_id, national_id);

ALTER TABLE senteloans_loans ADD CONSTRAINT uk_loans_application 
    UNIQUE (institution_id, application_id);

ALTER TABLE senteloans_savings_accounts ADD CONSTRAINT uk_accounts_number 
    UNIQUE (institution_id, account_number);

ALTER TABLE senteloans_transactions ADD CONSTRAINT uk_transactions_number 
    UNIQUE (institution_id, transaction_number);
\`\`\`

## Data Flow Patterns

### 1. Client Onboarding Flow
\`\`\`
Institution → Client → KYC Verification → Account Creation → Share Purchase (SACCO only)
\`\`\`

### 2. Loan Application Flow
\`\`\`
Client → Loan Application → Product Selection → Approval → Disbursement → Repayment Schedule
\`\`\`

### 3. Transaction Flow
\`\`\`
User → Transaction Entry → Account/Loan Update → Balance Calculation → Audit Log
\`\`\`

### 4. Multi-Tenant Data Access
\`\`\`
User Login → Institution Context → RLS Filter → Entity Access → Business Logic
\`\`\`

## Performance Considerations

### Query Optimization
- All multi-tenant queries filtered by institution_id first
- Composite indexes on (institution_id, status) for common filters
- Separate indexes for date-based queries on transactions

### Data Partitioning Strategy
- Consider partitioning transactions table by institution_id for large deployments
- Archive old transaction data to separate tables
- Implement soft deletes for audit trail preservation

### Caching Strategy
- Cache institution settings and configurations
- Cache user permissions and roles
- Cache dashboard statistics with appropriate TTL
\`\`\`
