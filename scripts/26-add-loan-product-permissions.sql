-- Migration: add loan product permissions and branch role grants.
-- Ensures existing databases get loan-product permissions.

INSERT INTO senteloans_permissions (name, module)
VALUES
  ('view_loan_products', 'loan_products'),
  ('create_loan_product', 'loan_products'),
  ('edit_loan_product', 'loan_products')
ON CONFLICT (name) DO NOTHING;

WITH role_permission_map(role_name, permission_name) AS (
  VALUES
    ('Loan Officer', 'view_loan_products'),
    ('Manager', 'view_loan_products'),
    ('Manager', 'create_loan_product'),
    ('Manager', 'edit_loan_product'),
    ('Admin', 'view_loan_products'),
    ('Admin', 'create_loan_product'),
    ('Admin', 'edit_loan_product')
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
