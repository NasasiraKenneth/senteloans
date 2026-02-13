# Security Policy

## Reporting a Vulnerability

The SenteLoans team takes security seriously. We appreciate your efforts to responsibly disclose your findings and will make every effort to acknowledge your contributions.

### How to Report a Security Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via:

1. **GitHub Security Advisories** (Preferred)
   - Go to the repository's Security tab
   - Click "Report a vulnerability"
   - Fill out the form with details

2. **Email** (Alternative)
   - Send an email describing the vulnerability
   - Include steps to reproduce if possible
   - We'll respond within 48 hours

### What to Include in Your Report

To help us better understand and address the issue, please include:

- Type of vulnerability (e.g., SQL injection, XSS, authentication bypass)
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

### What to Expect

- **Acknowledgment**: We'll acknowledge receipt within 48 hours
- **Updates**: We'll keep you informed about the progress of fixing the issue
- **Disclosure**: We'll coordinate with you on public disclosure timing
- **Credit**: With your permission, we'll publicly acknowledge your responsible disclosure

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |
| < 1.0   | :x:                |

Currently, we support security updates for the main branch. Once we release v1.0, we'll provide more detailed version support information.

## Security Best Practices for Deployment

### Environment Variables

**Critical**: Never commit these to version control:

```bash
# Sensitive - Keep Secret
SUPABASE_SERVICE_ROLE_KEY=...
MAILGUN_API_KEY=...
SESSION_SECRET=...
```

**Safe for client exposure** (protected by RLS):
```bash
# Safe - Public
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### Database Security

1. **Row Level Security (RLS)**
   - All tables MUST have RLS enabled
   - Policies defined in `scripts/02-row-level-security.sql`
   - Never bypass RLS except for admin operations using service role

2. **Service Role Key**
   - Only use server-side in Next.js server actions/API routes
   - Used for audit logging and admin operations
   - Never expose to client-side code
   - Rotate regularly (every 90 days recommended)

3. **Data Isolation**
   - Multi-tenant architecture ensures institution data isolation
   - All queries filtered by `institution_id`
   - Test RLS policies regularly using `scripts/03-test-rls-policies.sql`

### Authentication & Authorization

1. **Supabase Auth**
   - Handles user authentication
   - JWT tokens with short expiration
   - Secure session management via cookies

2. **Role-Based Access Control**
   - Defined in `senteloans_users.role` column
   - Roles: SUPER_ADMIN, ADMIN, MANAGER, LOAN_OFFICER, TREASURER, CLIENT
   - Enforce permissions on both client and server side

3. **Password Requirements**
   - Minimum 8 characters (enforced by Supabase)
   - Consider implementing stronger requirements for production

### API Security

1. **Input Validation**
   - All API routes validate input using Zod schemas
   - Client-side validation prevents unnecessary API calls
   - Server-side validation is the final enforcement

2. **Rate Limiting**
   - Consider implementing rate limiting for production
   - Protect against brute force attacks
   - Monitor API usage patterns

3. **CORS Configuration**
   - Configure CORS appropriately in production
   - Restrict origins to your domain only

### File Upload Security

1. **KYC Documents**
   - Stored in Supabase Storage with RLS policies
   - Only accessible by institution admins and document owner
   - File type validation on upload
   - Size limits enforced

2. **Best Practices**
   - Scan uploads for malware (consider ClamAV)
   - Validate file extensions and MIME types
   - Store in Supabase Storage, not filesystem
   - Use signed URLs for temporary access

### Audit Logging

1. **Audit Trail**
   - Critical operations logged in `senteloans_audit_logs`
   - Immutable records (no updates/deletes)
   - Includes: user, action, timestamp, changes, IP address

2. **What to Log**
   - Authentication events
   - Authorization failures
   - Data modifications (loans, transactions, KYC)
   - Admin actions
   - Security events

### Production Deployment

1. **HTTPS Only**
   - Enforce HTTPS in production
   - Set secure cookie flags
   - Use HSTS headers

2. **Environment Separation**
   - Use separate Supabase projects for dev/staging/prod
   - Never use production credentials in development
   - Test migrations on staging first

3. **Dependency Management**
   - Regularly update dependencies
   - Monitor for security advisories
   - Use `pnpm audit` to check for vulnerabilities
   - Review dependency changes before updating

4. **Monitoring & Alerting**
   - Set up error monitoring (e.g., Sentry)
   - Monitor authentication failures
   - Alert on suspicious activities
   - Regular security audits

### Secure Coding Practices

1. **Prevent SQL Injection**
   - Use Supabase client methods (parameterized)
   - Never concatenate user input into queries
   - Validate and sanitize all inputs

2. **Prevent XSS**
   - React automatically escapes content
   - Be careful with `dangerouslySetInnerHTML`
   - Sanitize user-generated content
   - Use Content Security Policy headers

3. **Prevent CSRF**
   - Use Supabase's built-in CSRF protection
   - Verify origin on state-changing operations
   - Use SameSite cookie attribute

4. **Sensitive Data**
   - Never log sensitive data (passwords, keys, PII)
   - Mask sensitive data in logs and error messages
   - Use environment variables for secrets

### Mobile Money Integration Security

*Note: Mobile money features are planned for future releases*

When implementing:
- Use official SDK/APIs from providers (MTN, Airtel)
- Store API keys securely
- Implement webhook signature verification
- Log all transactions with audit trail
- Handle failed transactions gracefully
- Comply with PCI DSS if applicable

### Compliance & Regulations

1. **Uganda Financial Regulations**
   - Comply with Bank of Uganda regulations
   - Maintain proper KYC documentation
   - Implement anti-money laundering (AML) checks
   - Follow data protection guidelines

2. **Data Protection**
   - Respect user privacy
   - Implement data retention policies
   - Allow users to request data deletion
   - Secure personal identifiable information (PII)

3. **GDPR Considerations**
   - Though primarily for Uganda, consider GDPR principles
   - Implement data portability
   - Clear consent mechanisms
   - Right to be forgotten

## Security Checklist for Contributors

Before submitting code, ensure:

- [ ] No hardcoded secrets or credentials
- [ ] Input validation on all user inputs
- [ ] RLS policies tested for new tables
- [ ] Authentication checked on protected routes
- [ ] Authorization enforced for sensitive operations
- [ ] Error messages don't leak sensitive information
- [ ] Dependencies are up to date
- [ ] No SQL injection vulnerabilities
- [ ] XSS prevention in place
- [ ] CSRF protection maintained
- [ ] Audit logging for sensitive operations

## Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/going-into-prod)
- [Next.js Security Headers](https://nextjs.org/docs/app/api-reference/next-config-js/headers)
- [Uganda Bank Regulations](https://www.bou.or.ug/)

## Disclosure Policy

When a security vulnerability is reported:

1. We'll confirm the issue and determine its severity
2. We'll develop and test a fix
3. We'll release a security patch
4. We'll publish a security advisory
5. We'll credit the reporter (with their permission)

We follow responsible disclosure and will not publicly disclose vulnerabilities until a fix is available.

## Contact

For security concerns, please use the reporting methods described above rather than public channels.

---

**Thank you for helping keep SenteLoans and its users safe!** 🔒
