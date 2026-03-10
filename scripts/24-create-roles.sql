-- 24-create-roles.sql
-- Adds permissions and role permissions tables

CREATE TABLE roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    module VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE role_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(role_id, permission_id),

    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invoices_institution_id ON senteloans_invoices(institution_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON senteloans_invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON senteloans_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON senteloans_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_type ON senteloans_invoices(invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON senteloans_invoice_items(invoice_id);
