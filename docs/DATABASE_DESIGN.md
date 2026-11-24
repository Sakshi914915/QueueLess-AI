# QueueLess AI: Relational Database Architecture

## 1. Design Philosophy
QueueLess AI is built on **MySQL 8.0** using standard Third Normal Form (3NF) relational design principles. It enforces:
- **Multi-Tenant Data Isolation**: Every resource belongs to an `organization_id` with strict application & query-level partitioning.
- **ACID Transaction Guarantees**: Queue token generation, staff calling, and appointment slot reservations use `SERIALIZABLE` or `FOR UPDATE` row-level locks to strictly prevent race conditions or duplicate sequence numbers.
- **Referential Integrity**: Cascading deletes for dependent records (e.g. services deleted when an organization is purged) and `SET NULL` for audit trails and assigned staff counters.
- **Index Optimization**: Composite indexes on `(branch_id, service_id, status)` and `(organization_id, status)` ensure sub-millisecond query execution even with millions of historical tokens.

---

## 2. Table Specifications (20 Tables)

### 1. `users`
- Stores user credentials, hashed passwords, roles, and account states.
- Columns: `id`, `email`, `password_hash`, `full_name`, `phone`, `role` (`super_admin`, `org_admin`, `staff`, `customer`), `status`, `created_at`, `updated_at`.

### 2. `organizations`
- Independent organizations (Hospitals, Banks, Colleges, Government centers).
- Columns: `id`, `name`, `slug`, `category`, `description`, `contact_email`, `contact_phone`, `address`, `status` (`pending`, `approved`, `rejected`, `suspended`), `logo_url`, `created_by`, timestamps.

### 3. `organization_members`
- Junction table linking staff and admins to their respective organizations.
- Columns: `id`, `organization_id`, `user_id`, `role`, `status`, `created_at`. Unique key on `(organization_id, user_id)`.

### 4. `branches`
- Physical locations belonging to an organization.
- Columns: `id`, `organization_id`, `name`, `code`, `address`, `city`, `state`, `postal_code`, `latitude`, `longitude`, `contact_phone`, `status`.

### 5. `services`
- Distinct services offered at a branch (e.g. General OPD, Cash Deposit, KYC, Ultrasound).
- Columns: `id`, `organization_id`, `branch_id`, `name`, `code`, `description`, `avg_service_duration_min`, `is_active`, `priority_allowed`.

### 6. `counters`
- Physical or digital service windows/desks at a branch.
- Columns: `id`, `branch_id`, `name`, `counter_number`, `service_id`, `status` (`active`, `closed`, `paused`), `pause_reason`.

### 7. `staff_assignments`
- Dynamic binding of staff operators to counters.
- Columns: `id`, `user_id`, `branch_id`, `counter_id`, `is_active`, `assigned_at`.

### 8. `tokens`
- The core digital token record.
- Columns: `id`, `token_number`, `display_code`, `customer_id`, `walkin_name`, `walkin_phone`, `organization_id`, `branch_id`, `service_id`, `counter_id`, `queue_position`, `priority_type`, `priority_reason`, `status` (`waiting`, `called`, `serving`, `completed`, `skipped`, `cancelled`, `no_show`, `transferred`), `estimated_wait_minutes`, `qr_code_hash`, `internal_notes`, timestamps (`created_at`, `called_at`, `served_at`, `completed_at`).

### 9. `queue_history`
- Immutable event log of all token lifecycle transitions.
- Columns: `id`, `token_id`, `previous_status`, `new_status`, `changed_by_user_id`, `notes`, `timestamp`.

### 10. `appointments`
- Pre-scheduled slots booked by users.
- Columns: `id`, `user_id`, `organization_id`, `branch_id`, `service_id`, `appointment_date`, `time_slot`, `status` (`booked`, `checked_in`, `completed`, `cancelled`, `rescheduled`), `checked_in_token_id`, `notes`.

### 11. `notifications`
- In-app alerts delivered to customers.
- Columns: `id`, `user_id`, `token_id`, `type`, `title`, `message`, `is_read`, `channel`, `created_at`.

### 12. `feedback`
- Verified ratings and reviews submitted by customers after completed visits.
- Columns: `id`, `token_id`, `organization_id`, `service_id`, `user_id`, `rating` (1-5), `comments`, `issue_reported`, `created_at`.

### 13. `priority_rules`
- Configurable rules per organization for priority bumping.
- Columns: `id`, `organization_id`, `category_name`, `weight`, `description`, `max_per_hour`, `is_active`.

### 14. `organization_settings`
- Key-value configuration store per organization.
- Columns: `id`, `organization_id`, `setting_key`, `setting_value`.

### 15. `operating_hours`
- Daily operating schedule for branch locations.
- Columns: `id`, `branch_id`, `day_of_week`, `open_time`, `close_time`, `is_closed`.

### 16. `holidays`
- Special scheduled closures per branch.
- Columns: `id`, `branch_id`, `holiday_date`, `description`.

### 17. `audit_logs`
- Security and governance log of all critical actions.
- Columns: `id`, `organization_id`, `user_id`, `action`, `entity`, `entity_id`, `ip_address`, `details`, `timestamp`.

### 18. `support_tickets`
- Platform support and complaint tickets.
- Columns: `id`, `user_id`, `organization_id`, `subject`, `description`, `priority`, `status`, `resolution_notes`.

### 19. `subscription_plans`
- Tiered subscription limits (Trial, Professional, Enterprise).
- Columns: `id`, `name`, `code`, `price_monthly`, `max_branches`, `max_services`, `max_staff`, `max_tokens_per_month`, `features_json`.

### 20. `subscriptions`
- Organization subscription records.
- Columns: `id`, `organization_id`, `plan_id`, `status`, `starts_at`, `expires_at`.
