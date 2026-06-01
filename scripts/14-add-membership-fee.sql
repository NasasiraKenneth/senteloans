-- Configure per-branch membership fee for seeded institutions and seed historical payments.
-- The per-payment events live in senteloans_membership_fees (created in 01-create-schema.sql).
-- The configured target fee per branch lives in senteloans_config.membership_fee.
-- There is no denormalized cache on senteloans_members; totals are aggregated from senteloans_membership_fees.

-- 1. Configure per-branch membership fee for seeded institutions
UPDATE senteloans_config c
SET membership_fee = 50000
FROM senteloans_branches b
JOIN senteloans_institutions i ON i.id = b.institution_id
WHERE c.branch_id = b.id
  AND i.name = 'Kampala Central SACCO';

UPDATE senteloans_config c
SET membership_fee = 30000
FROM senteloans_branches b
JOIN senteloans_institutions i ON i.id = b.institution_id
WHERE c.branch_id = b.id
  AND i.name = 'Quick Cash Uganda';

UPDATE senteloans_config c
SET membership_fee = 40000
FROM senteloans_branches b
JOIN senteloans_institutions i ON i.id = b.institution_id
WHERE c.branch_id = b.id
  AND i.name = 'Opportunity Microfinance Uganda';

-- 2. Seed per-payment history for demo members. One row per member with paid > 0.
--    Each row represents the cumulative paid amount as a single seed event;
--    transaction_id is NULL because no corresponding senteloans_transactions row is created for seeded fees.
INSERT INTO senteloans_membership_fees (
  institution_id,
  branch_id,
  member_id,
  amount_paid,
  total_membership_fee,
  balance_before,
  balance_after,
  mode,
  description,
  processed_by,
  payment_date
)
SELECT
  m.institution_id,
  m.branch_id,
  m.id,
  v.paid,
  COALESCE(c.membership_fee, 0)                                AS total_membership_fee,
  COALESCE(c.membership_fee, 0)                                AS balance_before,
  GREATEST(COALESCE(c.membership_fee, 0) - v.paid, 0)          AS balance_after,
  'Cash'::payment_mode                                          AS mode,
  'Initial membership fee payment (seed)'                       AS description,
  (
    SELECT u.id
    FROM senteloans_users u
    WHERE u.institution_id = m.institution_id
    ORDER BY u.created_at ASC
    LIMIT 1
  )                                                             AS processed_by,
  (m.join_date::timestamptz)                                    AS payment_date
FROM senteloans_members m
JOIN senteloans_config c ON c.branch_id = m.branch_id
JOIN (
  VALUES
    ('SL001', 50000::numeric),
    ('SL002', 30000::numeric),
    ('SL003', 50000::numeric),
    ('SL004', 10000::numeric),
    ('QC001', 30000::numeric),
    ('QC002', 15000::numeric),
    ('QC003', 30000::numeric),
    ('OM001', 40000::numeric),
    ('OM002', 25000::numeric)
) AS v(member_number, paid) ON v.member_number = m.member_number;
