-- Migration: Add joined_at to users
-- Run this after existing migrations.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS joined_at DATE;

UPDATE users
  SET joined_at = created_at::date
  WHERE joined_at IS NULL;
