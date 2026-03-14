-- Migration: add savings view permissions and branch role grants.
-- Ensures existing databases get view_savings/view_account.

INSERT INTO senteloans_permissions (name, module)
VALUES
  ('view_savings', 'savings'),
  ('view_account', 'savings')
ON CONFLICT (name) DO NOTHING;

WITH role_permission_map(role_name, permission_name) AS (
  VALUES
    ('Loan Officer', 'view_savings'),
    ('Loan Officer', 'view_account'),
    ('Manager', 'view_savings'),
    ('Manager', 'view_account'),
    ('Admin', 'view_savings'),
    ('Admin', 'view_account')
)
INSERT INTO senteloans_role_permissions (branch_id, role_id, permission_id)
SELECT
  b.id,
  r.id,
  p.id
FROM senteloans_branches b
JOIN role_permission_map rpm ON TRUE
JOIN senteloans_roles r ON r.name = rpm.role_name
JOIN senteloans_permissions p ON p.name = rpm.permission_name
ON CONFLICT (branch_id, role_id, permission_id) DO NOTHING;
