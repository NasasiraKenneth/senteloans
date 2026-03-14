-- Migration: create institution clients directory table.
-- Mirrors definition introduced in 01-create-schema.sql for existing databases.

CREATE TABLE IF NOT EXISTS senteloans_clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    address VARCHAR(250),
    phone VARCHAR(20),
    created_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_institution_branch ON senteloans_clients(institution_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON senteloans_clients(status);
