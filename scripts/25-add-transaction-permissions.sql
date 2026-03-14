-- Migration: add transaction permissions and branch role grants.
-- Ensures existing databases get view/create transaction permissions.

INSERT INTO senteloans_permissions (name, module)
VALUES
  ('view_transactions', 'transactions'),
  ('create_transaction', 'transactions')
ON CONFLICT (name) DO NOTHING;

WITH role_permission_map(role_name, permission_name) AS (
  VALUES
    ('Loan Officer', 'view_transactions'),
    ('Loan Officer', 'create_transaction'),
    ('Manager', 'view_transactions'),
    ('Manager', 'create_transaction'),
    ('Admin', 'view_transactions'),
    ('Admin', 'create_transaction')
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
