-- ========================================================
-- QueueLess AI: Development Seed Data (MySQL 8.0)
-- Default pass for all seeded users: Password@123
-- Bcrypt Hash: $2a$10$wT8K8U17r7k4e7OQW7CgqOcfGzC.M1sXqV14zB8Ue6s2K2jZlH5tG
-- ========================================================

USE queueless_ai_db;

-- 1. Subscription Plans
INSERT INTO subscription_plans (name, code, price_monthly, max_branches, max_services, max_staff, max_tokens_per_month, features_json)
VALUES 
  ('Starter Trial', 'trial', 0.00, 2, 5, 5, 2000, '{"ai_assistant": true, "analytics": "basic"}'),
  ('Professional', 'pro', 2499.00, 10, 30, 50, 50000, '{"ai_assistant": true, "analytics": "advanced", "priority_queues": true}'),
  ('Enterprise', 'enterprise', 8999.00, 50, 150, 300, 500000, '{"ai_assistant": true, "custom_branding": true, "priority_queues": true, "api_access": true}')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 2. Users (Password: Password@123)
INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
VALUES
  (1, 'superadmin@queueless.ai', '$2a$10$tZ2yYq11Yk9yU931fE6k..b13zTfhZt/Pqv4dkhT7Cq8R0rE/c6i2', 'System Administrator', '+91 9999900000', 'super_admin', 'active'),
  (2, 'admin@citycare.org', '$2a$10$tZ2yYq11Yk9yU931fE6k..b13zTfhZt/Pqv4dkhT7Cq8R0rE/c6i2', 'Dr. Rajiv Menon (CityCare Admin)', '+91 9888811111', 'org_admin', 'active'),
  (3, 'staff.drsharma@citycare.org', '$2a$10$tZ2yYq11Yk9yU931fE6k..b13zTfhZt/Pqv4dkhT7Cq8R0rE/c6i2', 'Dr. Ananya Sharma', '+91 9888822222', 'staff', 'active'),
  (4, 'staff.rajesh@citycare.org', '$2a$10$tZ2yYq11Yk9yU931fE6k..b13zTfhZt/Pqv4dkhT7Cq8R0rE/c6i2', 'Rajesh Kumar (Lab Tech)', '+91 9888833333', 'staff', 'active'),
  (5, 'admin@apexbank.com', '$2a$10$tZ2yYq11Yk9yU931fE6k..b13zTfhZt/Pqv4dkhT7Cq8R0rE/c6i2', 'Vikram Singhania (Apex Bank Admin)', '+91 9777711111', 'org_admin', 'active'),
  (6, 'staff.priya@apexbank.com', '$2a$10$tZ2yYq11Yk9yU931fE6k..b13zTfhZt/Pqv4dkhT7Cq8R0rE/c6i2', 'Priya Nair (Senior Teller)', '+91 9777722222', 'staff', 'active'),
  (7, 'customer@gmail.com', '$2a$10$tZ2yYq11Yk9yU931fE6k..b13zTfhZt/Pqv4dkhT7Cq8R0rE/c6i2', 'Aarav Mehta', '+91 9876543210', 'customer', 'active')
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name);

-- 3. Organizations
INSERT INTO organizations (id, name, slug, category, description, contact_email, contact_phone, address, status, created_by)
VALUES
  (1, 'CityCare Multispeciality Hospital', 'citycare-hospital', 'hospital', 'NABH accredited 500-bed hospital offering world-class healthcare with smart queue management.', 'contact@citycare.org', '+91 22 2456 7890', '12 Marine Drive, Nariman Point, Mumbai, Maharashtra 400021', 'approved', 2),
  (2, 'Apex Union Bank', 'apex-union-bank', 'bank', 'Premier commercial bank offering digital banking, retail counters, and corporate financial solutions.', 'support@apexbank.com', '+91 22 2890 1234', '88 MG Road, Fort Commercial District, Mumbai, Maharashtra 400001', 'approved', 5)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 4. Organization Members
INSERT INTO organization_members (organization_id, user_id, role, status)
VALUES
  (1, 2, 'org_admin', 'active'),
  (1, 3, 'staff', 'active'),
  (1, 4, 'staff', 'active'),
  (2, 5, 'org_admin', 'active'),
  (2, 6, 'staff', 'active')
ON DUPLICATE KEY UPDATE role=VALUES(role);

-- 5. Branches
INSERT INTO branches (id, organization_id, name, code, address, city, state, postal_code, latitude, longitude, contact_phone, status)
VALUES
  (1, 1, 'Downtown Hospital Campus', 'CC-DT', '12 Marine Drive, Mumbai', 'Mumbai', 'Maharashtra', '400021', 18.9438000, 72.8232000, '+91 22 2456 7891', 'active'),
  (2, 1, 'Andheri North Clinic', 'CC-NC', '45 Link Road, Andheri West, Mumbai', 'Mumbai', 'Maharashtra', '400053', 19.1363000, 72.8277000, '+91 22 2456 7892', 'active'),
  (3, 2, 'Fort Financial Branch', 'AUB-FT', '88 MG Road, Fort, Mumbai', 'Mumbai', 'Maharashtra', '400001', 18.9322000, 72.8335000, '+91 22 2890 1235', 'active')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 6. Services
INSERT INTO services (id, organization_id, branch_id, name, code, description, avg_service_duration_min, is_active, priority_allowed)
VALUES
  (1, 1, 1, 'OPD General Consultation', 'GEN', 'Outpatient general health consultations with licensed physicians.', 15, 1, 1),
  (2, 1, 1, 'Cardiology Special Desk', 'CARD', 'Heart examinations, ECG review, and specialized cardiologist consults.', 25, 1, 1),
  (3, 1, 1, 'Pathology & Diagnostic Lab', 'LAB', 'Routine blood draws, urine diagnostics, and lab sample collection.', 10, 1, 1),
  (4, 1, 1, 'Billing & Pharmacy Desk', 'PHARM', 'Discharge billing, cashless insurance settlement, and medication dispensing.', 5, 1, 1),
  (5, 2, 3, 'Cash Deposits & Withdrawals', 'CASH', 'High value and teller cash deposit and withdrawal operations.', 8, 1, 1),
  (6, 2, 3, 'Account Services & KYC', 'KYC', 'New account opening, address update, re-KYC, and net banking assistance.', 15, 1, 1),
  (7, 2, 3, 'Loan & Credit Consultation', 'LOAN', 'Home loans, auto loans, MSME credit, and investment advisory.', 25, 1, 1)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 7. Counters
INSERT INTO counters (id, branch_id, name, counter_number, service_id, status)
VALUES
  (1, 1, 'Counter 1 - General OPD', 1, 1, 'active'),
  (2, 1, 'Counter 2 - OPD Fast Track', 2, 1, 'active'),
  (3, 1, 'Counter 3 - Cardiology Dept', 3, 2, 'active'),
  (4, 1, 'Counter 4 - Diagnostic Lab Sample Desk', 4, 3, 'active'),
  (5, 3, 'Teller 1 - Cash Window', 1, 5, 'active')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 8. Staff Assignments
INSERT INTO staff_assignments (user_id, branch_id, counter_id, is_active)
VALUES
  (3, 1, 1, 1),
  (4, 1, 4, 1),
  (6, 3, 5, 1)
ON DUPLICATE KEY UPDATE counter_id=VALUES(counter_id), is_active=1;

-- 9. Priority Rules
INSERT INTO priority_rules (organization_id, category_name, weight, description, max_per_hour, is_active)
VALUES
  (1, 'Emergency / Trauma', 10, 'Immediate priority dispatch for critical trauma or medical emergencies', 15, 1),
  (1, 'Differently Abled (Divyangjan)', 5, 'Dedicated queue fast-track for patients with mobility impairments', 8, 1),
  (1, 'Senior Citizens (60+ yrs)', 3, 'Priority queue bump for senior citizens', 10, 1),
  (2, 'Differently Abled', 5, 'Priority desk attention for customers with disabilities', 6, 1),
  (2, 'Senior Citizens', 3, 'Special banking support for senior citizens', 8, 1);
