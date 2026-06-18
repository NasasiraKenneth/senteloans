-- Email settings: one row per branch, backfill inactive defaults, institution-scoped RLS.

-- Remove duplicate rows (keep newest per branch) before adding UNIQUE.
DELETE FROM email_settings es
WHERE es.id NOT IN (
  SELECT DISTINCT ON (branch_id) id
  FROM email_settings
  ORDER BY branch_id, updated_at DESC NULLS LAST, created_at DESC
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uk_email_settings_branch'
  ) THEN
    ALTER TABLE email_settings
      ADD CONSTRAINT uk_email_settings_branch UNIQUE (branch_id);
  END IF;
END $$;

-- Backfill inactive mailgun placeholder for branches without settings.
INSERT INTO email_settings (
  institution_id,
  branch_id,
  provider,
  from_email,
  reply_to_email,
  domain,
  is_active
)
SELECT
  b.institution_id,
  b.id,
  'mailgun',
  NULL,
  NULL,
  NULL,
  false
FROM branches b
WHERE NOT EXISTS (
  SELECT 1 FROM email_settings es WHERE es.branch_id = b.id
);

ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_settings_select ON email_settings;
CREATE POLICY email_settings_select ON email_settings
  FOR SELECT
  USING (
    COALESCE(app.current_role(), '') = 'system_admin'
    OR institution_id = COALESCE(app.current_institution_id(), get_current_institution_id())
  );

DROP POLICY IF EXISTS email_settings_insert ON email_settings;
CREATE POLICY email_settings_insert ON email_settings
  FOR INSERT
  WITH CHECK (
    COALESCE(app.current_role(), '') = 'system_admin'
    OR institution_id = COALESCE(app.current_institution_id(), get_current_institution_id())
  );

DROP POLICY IF EXISTS email_settings_update ON email_settings;
CREATE POLICY email_settings_update ON email_settings
  FOR UPDATE
  USING (
    COALESCE(app.current_role(), '') = 'system_admin'
    OR institution_id = COALESCE(app.current_institution_id(), get_current_institution_id())
  )
  WITH CHECK (
    COALESCE(app.current_role(), '') = 'system_admin'
    OR institution_id = COALESCE(app.current_institution_id(), get_current_institution_id())
  );
