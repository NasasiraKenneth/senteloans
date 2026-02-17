-- Fix existing Fee Payment transactions to use remaining-balance format
-- Old format: balance_before = cumulative paid before, balance_after = cumulative paid after
-- New format: balance_before = remaining before payment, balance_after = remaining after payment
--   i.e. balance_before = membershipFee - (paid before this tx)
--        balance_after  = membershipFee - (paid after this tx)

SET search_path = public;

UPDATE senteloans_transactions t
SET
  balance_before = COALESCE(
    (SELECT (i.settings->>'membershipFee')::DECIMAL
     FROM senteloans_institutions i
     JOIN senteloans_users u ON u.institution_id = i.id
     WHERE i.id = t.institution_id
     LIMIT 1), 0
  ) - t.balance_before,
  balance_after = COALESCE(
    (SELECT (i.settings->>'membershipFee')::DECIMAL
     FROM senteloans_institutions i
     WHERE i.id = t.institution_id
     LIMIT 1), 0
  ) - t.balance_after
WHERE t.type = 'Fee Payment';
