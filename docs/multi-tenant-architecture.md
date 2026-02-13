# SenteLoans Multi-Tenant Architecture Plan

## Overview
SenteLoans implements a **shared database, shared schema** multi-tenancy model with **Row-Level Security (RLS)** for data isolation. This approach provides strong data separation while maintaining operational efficiency and cost-effectiveness.

## Architecture Components

### 1. Tenant Identification
- **Primary Tenant Key**: `institution_id` (UUID)
- **Tenant Root Entity**: `senteloans_institutions` table
- **Tenant Types**: SACCO, MFI (Microfinance Institution), Money Lender
- **Isolation Level**: Complete data separation between institutions

### 2. Data Isolation Strategy

#### Row-Level Security (RLS) Implementation
\`\`\`sql
-- Example RLS Policy
CREATE POLICY clients_access_policy ON senteloans_clients
    FOR ALL
    USING (
        is_system_admin() OR 
        institution_id = get_current_institution_id()
    );
\`\`\`

#### Session Context Management
- **Session Variables**: Set per database connection
- **Context Functions**: `get_current_institution_id()`, `get_current_user_id()`
- **Application Integration**: Context set during authentication

### 3. User Hierarchy and Access Control

#### System-Level Users
- **System Administrator**: Cross-tenant access, platform management
- **Access Pattern**: `is_system_admin() = true` bypasses RLS
- **Responsibilities**: Institution onboarding, system monitoring

#### Institution-Level Users
- **Institution Administrator**: Full access within institution
- **Manager**: Departmental access within institution
- **Loan Officer**: Client and loan management within institution
- **Teller**: Transaction processing within institution
- **Access Pattern**: Filtered by `institution_id`

#### Client-Level Users
- **Client Portal Access**: Self-service access to own data only
- **Access Pattern**: Filtered by `client_id`
- **Data Scope**: Own loans, accounts, transactions

### 4. Configuration Management

#### Institution-Specific Settings
\`\`\`json
{
  "modules_enabled": {
    "savings": true,
    "loans": true,
    "shares": false  // Only for SACCOs
  },
  "terminology": {
    "client_term": "Member",  // Member/Client/Borrower
    "currency": "UGX",
    "date_format": "DD/MM/YYYY"
  },
  "business_rules": {
    "min_loan_amount": 50000,
    "max_loan_tenure": 60,
    "kyc_required": true
  }
}
\`\`\`

#### Dynamic Module Enablement
- **SACCO**: Savings + Loans + Shares
- **MFI**: Savings + Loans (no shares)
- **Money Lender**: Loans only (no savings/shares)

### 5. Security Implementation

#### Authentication Flow
\`\`\`
1. User Login → Validate Credentials
2. Retrieve User Institution → Set Session Context
3. Apply RLS Policies → Filter Data Access
4. Generate JWT Token → Include Institution Claims
\`\`\`

#### Authorization Layers
1. **Network Security**: HTTPS, VPN access
2. **Application Authentication**: JWT tokens, session management
3. **Database RLS**: Row-level data filtering
4. **Application Authorization**: Role-based feature access

#### Data Encryption
- **At Rest**: Database encryption (Supabase managed)
- **In Transit**: TLS 1.3 for all connections
- **Application Level**: Sensitive field encryption (PII)

### 6. Performance Considerations

#### Indexing Strategy
\`\`\`sql
-- Multi-tenant indexes (institution_id first)
CREATE INDEX idx_clients_institution_status ON senteloans_clients(institution_id, status);
CREATE INDEX idx_loans_institution_status ON senteloans_loans(institution_id, status);
CREATE INDEX idx_transactions_institution_date ON senteloans_transactions(institution_id, transaction_date DESC);
\`\`\`

#### Query Optimization
- **Partition Key**: All queries include `institution_id`
- **Index Selectivity**: Institution-scoped indexes for better performance
- **Connection Pooling**: Per-institution connection pools

#### Scaling Considerations
- **Horizontal Scaling**: Read replicas for reporting
- **Vertical Scaling**: Compute scaling based on tenant load
- **Data Archival**: Institution-specific data retention policies

### 7. Backup and Recovery

#### Tenant-Specific Backups
- **Full Database Backup**: Daily automated backups
- **Point-in-Time Recovery**: Per-institution recovery capability
- **Data Export**: Institution-specific data export functionality

#### Disaster Recovery
- **RTO (Recovery Time Objective)**: 4 hours
- **RPO (Recovery Point Objective)**: 1 hour
- **Cross-Region Replication**: Automated failover capability

### 8. Monitoring and Auditing

#### Tenant Isolation Monitoring
\`\`\`sql
-- Monitor cross-tenant access attempts
SELECT 
    institution_id,
    user_id,
    table_name,
    operation,
    created_at
FROM senteloans_audit_logs
WHERE old_values->>'institution_id' != new_values->>'institution_id';
\`\`\`

#### Performance Monitoring
- **Per-Tenant Metrics**: Query performance, resource usage
- **Alerting**: Unusual access patterns, performance degradation
- **Compliance**: Audit trail for all data access

### 9. Development and Testing

#### Test Data Isolation
- **Separate Test Institutions**: Isolated test data per environment
- **Data Seeding**: Institution-specific test data generation
- **Integration Testing**: Multi-tenant scenario testing

#### Development Workflow
\`\`\`
1. Local Development → Single institution context
2. Staging Environment → Multi-institution testing
3. Production Deployment → Full tenant isolation
\`\`\`

### 10. Migration Strategy

#### Tenant Onboarding
\`\`\`sql
-- New institution setup
INSERT INTO senteloans_institutions (name, type, registration_number, modules_enabled)
VALUES ('New SACCO', 'SACCO', 'REG123', '{"savings": true, "loans": true, "shares": true}');

-- Create default admin user
INSERT INTO senteloans_users (institution_id, email, role, full_name)
VALUES (new_institution_id, 'admin@newsacco.com', 'institution_admin', 'Admin User');
\`\`\`

#### Data Migration Process
1. **Institution Setup**: Create institution record
2. **User Migration**: Import existing users with proper roles
3. **Client Data**: Migrate customer records with validation
4. **Financial Data**: Import loans, accounts, transactions
5. **Validation**: Verify data integrity and access controls

### 11. Compliance and Regulations

#### Data Privacy (GDPR/Local Laws)
- **Data Minimization**: Only collect necessary data
- **Right to Erasure**: Soft delete with audit trail
- **Data Portability**: Export functionality per institution
- **Consent Management**: KYC and data processing consent

#### Financial Regulations
- **Audit Trail**: Complete transaction history
- **Regulatory Reporting**: Institution-specific reports
- **Data Retention**: Configurable retention policies
- **Access Logging**: All data access logged and monitored

## Implementation Checklist

### Phase 1: Foundation ✅
- [x] Database schema with RLS policies
- [x] Multi-tenant data model design
- [x] Entity relationships and constraints
- [x] Performance indexes and optimization

### Phase 2: Authentication & Authorization
- [ ] Supabase authentication integration
- [ ] JWT token management with institution claims
- [ ] Role-based access control implementation
- [ ] Session context management

### Phase 3: Application Integration
- [ ] Supabase client configuration
- [ ] RLS policy testing and validation
- [ ] Multi-tenant query patterns
- [ ] Error handling and logging

### Phase 4: Security Hardening
- [ ] Security audit and penetration testing
- [ ] Data encryption implementation
- [ ] Access control validation
- [ ] Compliance verification

## Best Practices

### Development Guidelines
1. **Always Filter by Institution**: Every query must include institution context
2. **Test Multi-Tenancy**: Validate data isolation in all features
3. **Monitor Performance**: Track query performance across tenants
4. **Audit Everything**: Log all data access and modifications

### Security Guidelines
1. **Principle of Least Privilege**: Minimal required permissions
2. **Defense in Depth**: Multiple security layers
3. **Regular Audits**: Periodic security assessments
4. **Incident Response**: Defined procedures for security incidents

### Operational Guidelines
1. **Monitoring**: Comprehensive tenant-aware monitoring
2. **Backup Strategy**: Regular, tested backups per tenant
3. **Capacity Planning**: Scale based on tenant growth
4. **Documentation**: Maintain up-to-date architecture docs
