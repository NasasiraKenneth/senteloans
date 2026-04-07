-- Fix existing Fee Payment transactions to use remaining-balance format
-- Old format: balance_before = cumulative paid before, balance_after = cumulative paid after
-- New format: balance_before = remaining before payment, balance_after = remaining after payment
--   i.e. balance_before = membership_fee - (paid before this tx)
--        balance_after  = membership_fee - (paid after this tx)

SET search_path = public;

UPDATE senteloans_transactions t
SET
  balance_before = COALESCE(
    (SELECT c.membership_fee
     FROM senteloans_config c
     JOIN senteloans_branches b ON b.id = c.branch_id
     WHERE b.institution_id = t.institution_id
     LIMIT 1), 0
  ) - t.balance_before,
  balance_after = COALESCE(
    (SELECT c.membership_fee
     FROM senteloans_config c
     JOIN senteloans_branches b ON b.id = c.branch_id
     WHERE b.institution_id = t.institution_id
     LIMIT 1), 0
  ) - t.balance_after
WHERE t.type = 'Fee Payment';
