-- ========================================================
-- QueueLess AI: Database Schema (MySQL 8.0)
-- 20 Normalized Relational Tables with Indexes, Constraints & FKs
-- ========================================================

CREATE DATABASE IF NOT EXISTS queueless_ai_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE queueless_ai_db;

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NULL,
  role ENUM('super_admin', 'org_admin', 'staff', 'customer') NOT NULL DEFAULT 'customer',
  status ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_status (status)
) ENGINE=InnoDB;

-- 2. ORGANIZATIONS
CREATE TABLE IF NOT EXISTS organizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  category ENUM('hospital', 'bank', 'college', 'government', 'diagnostic', 'customer_service', 'other') NOT NULL,
  description TEXT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(50) NULL,
  address TEXT NULL,
  status ENUM('pending', 'approved', 'rejected', 'suspended') NOT NULL DEFAULT 'pending',
  logo_url VARCHAR(500) NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_org_status (status),
  INDEX idx_org_category (category)
) ENGINE=InnoDB;

-- 3. ORGANIZATION MEMBERS
CREATE TABLE IF NOT EXISTS organization_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('org_admin', 'staff') NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_org_user (organization_id, user_id),
  INDEX idx_org_member (organization_id, role)
) ENGINE=InnoDB;

-- 4. BRANCHES
CREATE TABLE IF NOT EXISTS branches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NULL,
  postal_code VARCHAR(20) NULL,
  latitude DECIMAL(10, 7) NULL,
  longitude DECIMAL(10, 7) NULL,
  contact_phone VARCHAR(50) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_org_branch_code (organization_id, code),
  INDEX idx_branches_city (city),
  INDEX idx_branches_status (status)
) ENGINE=InnoDB;

-- 5. SERVICES
CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  branch_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(20) NOT NULL,
  description TEXT NULL,
  avg_service_duration_min INT NOT NULL DEFAULT 15,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_branch_service_code (branch_id, code),
  INDEX idx_services_branch_active (branch_id, is_active)
) ENGINE=InnoDB;

-- 6. COUNTERS
CREATE TABLE IF NOT EXISTS counters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  counter_number INT NOT NULL,
  service_id INT NULL,
  status ENUM('active', 'closed', 'paused') NOT NULL DEFAULT 'active',
  pause_reason VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_branch_counter (branch_id, counter_number),
  INDEX idx_counters_branch_status (branch_id, status)
) ENGINE=InnoDB;

-- 7. STAFF ASSIGNMENTS
CREATE TABLE IF NOT EXISTS staff_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  branch_id INT NOT NULL,
  counter_id INT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (counter_id) REFERENCES counters(id) ON DELETE SET NULL,
  INDEX idx_staff_assignment (user_id, branch_id, is_active)
) ENGINE=InnoDB;

-- 8. TOKENS
CREATE TABLE IF NOT EXISTS tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token_number VARCHAR(50) NOT NULL,
  display_code VARCHAR(50) NOT NULL,
  customer_id INT NULL,
  walkin_name VARCHAR(150) NULL,
  walkin_phone VARCHAR(50) NULL,
  organization_id INT NOT NULL,
  branch_id INT NOT NULL,
  service_id INT NOT NULL,
  counter_id INT NULL,
  queue_position INT NOT NULL DEFAULT 0,
  priority_type ENUM('normal', 'senior', 'emergency', 'disability') NOT NULL DEFAULT 'normal',
  priority_reason VARCHAR(255) NULL,
  status ENUM('waiting', 'called', 'serving', 'completed', 'skipped', 'cancelled', 'no_show', 'transferred') NOT NULL DEFAULT 'waiting',
  estimated_wait_minutes INT NOT NULL DEFAULT 0,
  qr_code_hash VARCHAR(100) NOT NULL UNIQUE,
  internal_notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  called_at TIMESTAMP NULL,
  served_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (counter_id) REFERENCES counters(id) ON DELETE SET NULL,
  INDEX idx_tokens_branch_service_status (branch_id, service_id, status),
  INDEX idx_tokens_customer (customer_id),
  INDEX idx_tokens_created_at (created_at),
  INDEX idx_tokens_status (status)
) ENGINE=InnoDB;

-- 9. QUEUE HISTORY
CREATE TABLE IF NOT EXISTS queue_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token_id INT NOT NULL,
  previous_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NOT NULL,
  changed_by_user_id INT NULL,
  notes TEXT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (token_id) REFERENCES tokens(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_queue_history_token (token_id)
) ENGINE=InnoDB;

-- 10. APPOINTMENTS
CREATE TABLE IF NOT EXISTS appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  organization_id INT NOT NULL,
  branch_id INT NOT NULL,
  service_id INT NOT NULL,
  appointment_date DATE NOT NULL,
  time_slot VARCHAR(20) NOT NULL,
  status ENUM('booked', 'checked_in', 'completed', 'cancelled', 'rescheduled') NOT NULL DEFAULT 'booked',
  checked_in_token_id INT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (checked_in_token_id) REFERENCES tokens(id) ON DELETE SET NULL,
  INDEX idx_appointments_slot (branch_id, service_id, appointment_date, time_slot, status),
  INDEX idx_appointments_user (user_id)
) ENGINE=InnoDB;

-- 11. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_id INT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  channel VARCHAR(30) NOT NULL DEFAULT 'in_app',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (token_id) REFERENCES tokens(id) ON DELETE SET NULL,
  INDEX idx_notifications_user_read (user_id, is_read)
) ENGINE=InnoDB;

-- 12. FEEDBACK
CREATE TABLE IF NOT EXISTS feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token_id INT NOT NULL UNIQUE,
  organization_id INT NOT NULL,
  service_id INT NOT NULL,
  user_id INT NOT NULL,
  rating INT NOT NULL,
  comments TEXT NULL,
  issue_reported VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (token_id) REFERENCES tokens(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_feedback_org_rating (organization_id, rating)
) ENGINE=InnoDB;

-- 13. PRIORITY RULES
CREATE TABLE IF NOT EXISTS priority_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  weight INT NOT NULL DEFAULT 1,
  description TEXT NULL,
  max_per_hour INT NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  INDEX idx_priority_rules_org (organization_id, is_active)
) ENGINE=InnoDB;

-- 14. ORGANIZATION SETTINGS
CREATE TABLE IF NOT EXISTS organization_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_org_setting (organization_id, setting_key)
) ENGINE=InnoDB;

-- 15. OPERATING HOURS
CREATE TABLE IF NOT EXISTS operating_hours (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  day_of_week ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday') NOT NULL,
  open_time TIME NOT NULL DEFAULT '09:00:00',
  close_time TIME NOT NULL DEFAULT '17:00:00',
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_branch_day (branch_id, day_of_week)
) ENGINE=InnoDB;

-- 16. HOLIDAYS
CREATE TABLE IF NOT EXISTS holidays (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  holiday_date DATE NOT NULL,
  description VARCHAR(255) NOT NULL,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_branch_holiday (branch_id, holiday_date)
) ENGINE=InnoDB;

-- 17. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NULL,
  user_id INT NULL,
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100) NULL,
  ip_address VARCHAR(50) NULL,
  details JSON NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_org (organization_id),
  INDEX idx_audit_time (timestamp)
) ENGINE=InnoDB;

-- 18. SUPPORT TICKETS
CREATE TABLE IF NOT EXISTS support_tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  organization_id INT NULL,
  subject VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  status ENUM('open', 'in_progress', 'resolved', 'closed') NOT NULL DEFAULT 'open',
  resolution_notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
  INDEX idx_tickets_user (user_id),
  INDEX idx_tickets_status (status)
) ENGINE=InnoDB;

-- 19. SUBSCRIPTION PLANS
CREATE TABLE IF NOT EXISTS subscription_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  price_monthly DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  max_branches INT NOT NULL DEFAULT 3,
  max_services INT NOT NULL DEFAULT 10,
  max_staff INT NOT NULL DEFAULT 15,
  max_tokens_per_month INT NOT NULL DEFAULT 10000,
  features_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 20. SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  plan_id INT NOT NULL,
  status ENUM('active', 'expired', 'trial', 'cancelled') NOT NULL DEFAULT 'trial',
  starts_at DATE NOT NULL,
  expires_at DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE,
  INDEX idx_sub_org (organization_id, status)
) ENGINE=InnoDB;
