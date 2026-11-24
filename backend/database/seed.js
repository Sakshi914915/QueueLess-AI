const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

async function seedDatabase() {
  console.log('[SEED] Starting QueueLess AI database seeding...');
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const defaultPasswordHash = await bcrypt.hash('Password@123', 10);

    // 1. Subscription Plans
    console.log('[SEED] Seeding subscription plans...');
    const plans = [
      ['Starter Trial', 'trial', 0.00, 2, 5, 5, 2000, JSON.stringify({ ai_assistant: true, analytics: 'basic' })],
      ['Professional', 'pro', 2499.00, 10, 30, 50, 50000, JSON.stringify({ ai_assistant: true, analytics: 'advanced', priority_queues: true })],
      ['Enterprise', 'enterprise', 8999.00, 50, 150, 300, 500000, JSON.stringify({ ai_assistant: true, custom_branding: true, priority_queues: true, api_access: true })]
    ];

    for (const [name, code, price, maxBranches, maxServices, maxStaff, maxTokens, features] of plans) {
      await conn.query(
        `INSERT INTO subscription_plans (name, code, price_monthly, max_branches, max_services, max_staff, max_tokens_per_month, features_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), price_monthly=VALUES(price_monthly)`,
        [name, code, price, maxBranches, maxServices, maxStaff, maxTokens, features]
      );
    }

    // 2. Users
    console.log('[SEED] Seeding initial users...');
    const users = [
      ['superadmin@queueless.ai', defaultPasswordHash, 'System Administrator', '+91 9999900000', 'super_admin', 'active'],
      ['admin@citycare.org', defaultPasswordHash, 'Dr. Rajiv Menon (CityCare Admin)', '+91 9888811111', 'org_admin', 'active'],
      ['staff.drsharma@citycare.org', defaultPasswordHash, 'Dr. Ananya Sharma', '+91 9888822222', 'staff', 'active'],
      ['staff.rajesh@citycare.org', defaultPasswordHash, 'Rajesh Kumar (Lab Tech)', '+91 9888833333', 'staff', 'active'],
      ['admin@apexbank.com', defaultPasswordHash, 'Vikram Singhania (Apex Bank Admin)', '+91 9777711111', 'org_admin', 'active'],
      ['staff.priya@apexbank.com', defaultPasswordHash, 'Priya Nair (Senior Teller)', '+91 9777722222', 'staff', 'active'],
      ['customer@gmail.com', defaultPasswordHash, 'Aarav Mehta', '+91 9876543210', 'customer', 'active']
    ];

    const userIdMap = {};
    for (const [email, pwd, name, phone, role, status] of users) {
      const [res] = await conn.query(
        `INSERT INTO users (email, password_hash, full_name, phone, role, status)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role=VALUES(role), status=VALUES(status)`,
        [email, pwd, name, phone, role, status]
      );
      
      const [userRow] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
      userIdMap[email] = userRow[0].id;
    }

    // 3. Organizations
    console.log('[SEED] Seeding organizations...');
    // Org 1: Hospital
    await conn.query(
      `INSERT INTO organizations (name, slug, category, description, contact_email, contact_phone, address, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), status=VALUES(status)`,
      [
        'CityCare Multispeciality Hospital',
        'citycare-hospital',
        'hospital',
        'Leading NABH accredited 500-bed hospital offering world-class healthcare with smart queue management.',
        'contact@citycare.org',
        '+91 22 2456 7890',
        '12 Marine Drive, Nariman Point, Mumbai, Maharashtra 400021',
        'approved',
        userIdMap['admin@citycare.org']
      ]
    );

    const [org1Row] = await conn.query('SELECT id FROM organizations WHERE slug = ?', ['citycare-hospital']);
    const org1Id = org1Row[0].id;

    // Org 2: Bank
    await conn.query(
      `INSERT INTO organizations (name, slug, category, description, contact_email, contact_phone, address, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), status=VALUES(status)`,
      [
        'Apex Union Bank',
        'apex-union-bank',
        'bank',
        'Premier commercial bank offering digital banking, retail counters, and corporate financial solutions.',
        'support@apexbank.com',
        '+91 22 2890 1234',
        '88 MG Road, Fort Commercial District, Mumbai, Maharashtra 400001',
        'approved',
        userIdMap['admin@apexbank.com']
      ]
    );

    const [org2Row] = await conn.query('SELECT id FROM organizations WHERE slug = ?', ['apex-union-bank']);
    const org2Id = org2Row[0].id;

    // 4. Organization Members
    console.log('[SEED] Linking organization members...');
    await conn.query(
      `INSERT INTO organization_members (organization_id, user_id, role, status)
       VALUES (?, ?, 'org_admin', 'active')
       ON DUPLICATE KEY UPDATE role=VALUES(role)`,
      [org1Id, userIdMap['admin@citycare.org']]
    );
    await conn.query(
      `INSERT INTO organization_members (organization_id, user_id, role, status)
       VALUES (?, ?, 'staff', 'active')
       ON DUPLICATE KEY UPDATE role=VALUES(role)`,
      [org1Id, userIdMap['staff.drsharma@citycare.org']]
    );
    await conn.query(
      `INSERT INTO organization_members (organization_id, user_id, role, status)
       VALUES (?, ?, 'staff', 'active')
       ON DUPLICATE KEY UPDATE role=VALUES(role)`,
      [org1Id, userIdMap['staff.rajesh@citycare.org']]
    );

    await conn.query(
      `INSERT INTO organization_members (organization_id, user_id, role, status)
       VALUES (?, ?, 'org_admin', 'active')
       ON DUPLICATE KEY UPDATE role=VALUES(role)`,
      [org2Id, userIdMap['admin@apexbank.com']]
    );
    await conn.query(
      `INSERT INTO organization_members (organization_id, user_id, role, status)
       VALUES (?, ?, 'staff', 'active')
       ON DUPLICATE KEY UPDATE role=VALUES(role)`,
      [org2Id, userIdMap['staff.priya@apexbank.com']]
    );

    // 5. Branches
    console.log('[SEED] Seeding branches...');
    // Org 1 Branches
    await conn.query(
      `INSERT INTO branches (organization_id, name, code, address, city, state, postal_code, latitude, longitude, contact_phone, status)
       VALUES (?, 'Downtown Hospital Campus', 'CC-DT', '12 Marine Drive, Mumbai', 'Mumbai', 'Maharashtra', '400021', 18.9438000, 72.8232000, '+91 22 2456 7891', 'active')
       ON DUPLICATE KEY UPDATE name=VALUES(name)`,
      [org1Id]
    );
    const [b1Row] = await conn.query('SELECT id FROM branches WHERE organization_id = ? AND code = ?', [org1Id, 'CC-DT']);
    const b1Id = b1Row[0].id;

    await conn.query(
      `INSERT INTO branches (organization_id, name, code, address, city, state, postal_code, latitude, longitude, contact_phone, status)
       VALUES (?, 'Andheri North Clinic', 'CC-NC', '45 Link Road, Andheri West, Mumbai', 'Mumbai', 'Maharashtra', '400053', 19.1363000, 72.8277000, '+91 22 2456 7892', 'active')
       ON DUPLICATE KEY UPDATE name=VALUES(name)`,
      [org1Id]
    );

    // Org 2 Branches
    await conn.query(
      `INSERT INTO branches (organization_id, name, code, address, city, state, postal_code, latitude, longitude, contact_phone, status)
       VALUES (?, 'Fort Financial Branch', 'AUB-FT', '88 MG Road, Fort, Mumbai', 'Mumbai', 'Maharashtra', '400001', 18.9322000, 72.8335000, '+91 22 2890 1235', 'active')
       ON DUPLICATE KEY UPDATE name=VALUES(name)`,
      [org2Id]
    );
    const [b2Row] = await conn.query('SELECT id FROM branches WHERE organization_id = ? AND code = ?', [org2Id, 'AUB-FT']);
    const b2Id = b2Row[0].id;

    // 6. Services
    console.log('[SEED] Seeding services...');
    // Org 1 Services (Downtown)
    const org1Services = [
      ['OPD General Consultation', 'GEN', 'Outpatient general health consultations with licensed physicians.', 15],
      ['Cardiology Special Desk', 'CARD', 'Heart examinations, ECG review, and specialized cardiologist consults.', 25],
      ['Pathology & Diagnostic Lab', 'LAB', 'Routine blood draws, urine diagnostics, and lab sample collection.', 10],
      ['Billing & Pharmacy Desk', 'PHARM', 'Discharge billing, cashless insurance settlement, and medication dispensing.', 5]
    ];

    const serviceIdMap = {};
    for (const [name, code, desc, duration] of org1Services) {
      await conn.query(
        `INSERT INTO services (organization_id, branch_id, name, code, description, avg_service_duration_min, is_active, priority_allowed)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1)
         ON DUPLICATE KEY UPDATE name=VALUES(name), avg_service_duration_min=VALUES(avg_service_duration_min)`,
        [org1Id, b1Id, name, code, desc, duration]
      );
      const [sRow] = await conn.query('SELECT id FROM services WHERE branch_id = ? AND code = ?', [b1Id, code]);
      serviceIdMap[`b1_${code}`] = sRow[0].id;
    }

    // Org 2 Services (Apex Bank Fort)
    const org2Services = [
      ['Cash Deposits & Withdrawals', 'CASH', 'High value and teller cash deposit and withdrawal operations.', 8],
      ['Account Services & KYC', 'KYC', 'New account opening, address update, re-KYC, and net banking assistance.', 15],
      ['Loan & Credit Consultation', 'LOAN', 'Home loans, auto loans, MSME credit, and investment advisory.', 25]
    ];

    for (const [name, code, desc, duration] of org2Services) {
      await conn.query(
        `INSERT INTO services (organization_id, branch_id, name, code, description, avg_service_duration_min, is_active, priority_allowed)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1)
         ON DUPLICATE KEY UPDATE name=VALUES(name), avg_service_duration_min=VALUES(avg_service_duration_min)`,
        [org2Id, b2Id, name, code, desc, duration]
      );
      const [sRow] = await conn.query('SELECT id FROM services WHERE branch_id = ? AND code = ?', [b2Id, code]);
      serviceIdMap[`b2_${code}`] = sRow[0].id;
    }

    // 7. Counters
    console.log('[SEED] Seeding counters...');
    // Downtown Hospital Counters
    await conn.query(
      `INSERT INTO counters (branch_id, name, counter_number, service_id, status)
       VALUES (?, 'Counter 1 - General OPD', 1, ?, 'active')
       ON DUPLICATE KEY UPDATE name=VALUES(name), service_id=VALUES(service_id)`,
      [b1Id, serviceIdMap['b1_GEN']]
    );
    const [c1Row] = await conn.query('SELECT id FROM counters WHERE branch_id = ? AND counter_number = 1', [b1Id]);
    const c1Id = c1Row[0].id;

    await conn.query(
      `INSERT INTO counters (branch_id, name, counter_number, service_id, status)
       VALUES (?, 'Counter 2 - OPD Fast Track', 2, ?, 'active')
       ON DUPLICATE KEY UPDATE name=VALUES(name), service_id=VALUES(service_id)`,
      [b1Id, serviceIdMap['b1_GEN']]
    );

    await conn.query(
      `INSERT INTO counters (branch_id, name, counter_number, service_id, status)
       VALUES (?, 'Counter 3 - Cardiology Dept', 3, ?, 'active')
       ON DUPLICATE KEY UPDATE name=VALUES(name), service_id=VALUES(service_id)`,
      [b1Id, serviceIdMap['b1_CARD']]
    );

    await conn.query(
      `INSERT INTO counters (branch_id, name, counter_number, service_id, status)
       VALUES (?, 'Counter 4 - Diagnostic Lab Sample Desk', 4, ?, 'active')
       ON DUPLICATE KEY UPDATE name=VALUES(name), service_id=VALUES(service_id)`,
      [b1Id, serviceIdMap['b1_LAB']]
    );
    const [c4Row] = await conn.query('SELECT id FROM counters WHERE branch_id = ? AND counter_number = 4', [b1Id]);
    const c4Id = c4Row[0].id;

    // Apex Bank Counters
    await conn.query(
      `INSERT INTO counters (branch_id, name, counter_number, service_id, status)
       VALUES (?, 'Teller 1 - Cash Window', 1, ?, 'active')
       ON DUPLICATE KEY UPDATE name=VALUES(name), service_id=VALUES(service_id)`,
      [b2Id, serviceIdMap['b2_CASH']]
    );
    const [cBank1Row] = await conn.query('SELECT id FROM counters WHERE branch_id = ? AND counter_number = 1', [b2Id]);
    const cBank1Id = cBank1Row[0].id;

    // 8. Staff Assignments
    console.log('[SEED] Assigning staff to counters...');
    await conn.query(
      `INSERT INTO staff_assignments (user_id, branch_id, counter_id, is_active)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE counter_id=VALUES(counter_id), is_active=1`,
      [userIdMap['staff.drsharma@citycare.org'], b1Id, c1Id]
    );

    await conn.query(
      `INSERT INTO staff_assignments (user_id, branch_id, counter_id, is_active)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE counter_id=VALUES(counter_id), is_active=1`,
      [userIdMap['staff.rajesh@citycare.org'], b1Id, c4Id]
    );

    await conn.query(
      `INSERT INTO staff_assignments (user_id, branch_id, counter_id, is_active)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE counter_id=VALUES(counter_id), is_active=1`,
      [userIdMap['staff.priya@apexbank.com'], b2Id, cBank1Id]
    );

    // 9. Priority Rules
    console.log('[SEED] Seeding priority rules...');
    const priorityRules = [
      [org1Id, 'Emergency / Trauma', 10, 'Immediate priority dispatch for critical trauma or medical emergencies', 15],
      [org1Id, 'Differently Abled (Divyangjan)', 5, 'Dedicated queue fast-track for patients with mobility impairments', 8],
      [org1Id, 'Senior Citizens (60+ yrs)', 3, 'Priority queue bump for senior citizens', 10],
      [org2Id, 'Differently Abled', 5, 'Priority desk attention for customers with disabilities', 6],
      [org2Id, 'Senior Citizens', 3, 'Special banking support for senior citizens', 8]
    ];

    for (const [orgId, cat, weight, desc, maxHr] of priorityRules) {
      await conn.query(
        `INSERT INTO priority_rules (organization_id, category_name, weight, description, max_per_hour, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [orgId, cat, weight, desc, maxHr]
      );
    }

    // 10. Operating Hours
    console.log('[SEED] Seeding operating hours...');
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const d of days) {
      await conn.query(
        `INSERT INTO operating_hours (branch_id, day_of_week, open_time, close_time, is_closed)
         VALUES (?, ?, '08:30:00', '19:00:00', 0)
         ON DUPLICATE KEY UPDATE open_time=VALUES(open_time), close_time=VALUES(close_time)`,
        [b1Id, d]
      );
      await conn.query(
        `INSERT INTO operating_hours (branch_id, day_of_week, open_time, close_time, is_closed)
         VALUES (?, ?, '09:30:00', '16:30:00', 0)
         ON DUPLICATE KEY UPDATE open_time=VALUES(open_time), close_time=VALUES(close_time)`,
        [b2Id, d]
      );
    }
    // Sunday closed
    await conn.query(
      `INSERT INTO operating_hours (branch_id, day_of_week, open_time, close_time, is_closed)
       VALUES (?, 'Sunday', '09:00:00', '13:00:00', 1)
       ON DUPLICATE KEY UPDATE is_closed=1`,
      [b1Id]
    );
    await conn.query(
      `INSERT INTO operating_hours (branch_id, day_of_week, open_time, close_time, is_closed)
       VALUES (?, 'Sunday', '09:00:00', '13:00:00', 1)
       ON DUPLICATE KEY UPDATE is_closed=1`,
      [b2Id]
    );

    await conn.commit();
    console.log('[SEED] Database seeded successfully with Super Admin, 2 independent Orgs, Branches, Services, Staff, and Counters!');
  } catch (error) {
    await conn.rollback();
    console.error('[SEED] Error seeding database:', error);
    throw error;
  } finally {
    conn.release();
  }
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seedDatabase;
