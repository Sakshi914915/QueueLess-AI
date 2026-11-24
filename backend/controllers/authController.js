const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { recordAuditLog } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'queueless_ai_jwt_secret_mca_production_grade_token_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Register User (Customer or Organization Admin)
 */
const register = async (req, res, next) => {
  try {
    const { email, password, full_name, phone, role = 'customer', organization_name, organization_category } = req.body;

    if (!email || !password || !full_name) {
      return errorResponse(res, 'Email, password, and full name are required.', 400);
    }

    if (password.length < 6) {
      return errorResponse(res, 'Password must be at least 6 characters long.', 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse(res, 'Please enter a valid email address.', 400);
    }

    // Role safety: only allow customer or org_admin registration from public endpoint
    const allowedRoles = ['customer', 'org_admin'];
    const assignedRole = allowedRoles.includes(role) ? role : 'customer';

    // Check if user already exists
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return errorResponse(res, 'An account with this email address already exists.', 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [userResult] = await conn.query(
        `INSERT INTO users (email, password_hash, full_name, phone, role, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [email.toLowerCase().trim(), passwordHash, full_name.trim(), phone || null, assignedRole]
      );

      const userId = userResult.insertId;
      let createdOrgId = null;

      // If registering as org_admin with org details, create the organization in 'pending' status
      if (assignedRole === 'org_admin' && organization_name) {
        const slug = organization_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
        const category = organization_category || 'other';

        const [orgResult] = await conn.query(
          `INSERT INTO organizations (name, slug, category, contact_email, contact_phone, status, created_by)
           VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
          [organization_name, slug, category, email.toLowerCase().trim(), phone || null, userId]
        );

        createdOrgId = orgResult.insertId;

        await conn.query(
          `INSERT INTO organization_members (organization_id, user_id, role, status)
           VALUES (?, ?, 'org_admin', 'active')`,
          [createdOrgId, userId]
        );

        // Assign default trial subscription
        const [trialPlan] = await conn.query('SELECT id FROM subscription_plans WHERE code = "trial" LIMIT 1');
        if (trialPlan.length > 0) {
          const startsAt = new Date();
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);

          await conn.query(
            `INSERT INTO subscriptions (organization_id, plan_id, status, starts_at, expires_at)
             VALUES (?, ?, 'trial', ?, ?)`,
            [createdOrgId, trialPlan[0].id, startsAt.toISOString().slice(0, 10), expiresAt.toISOString().slice(0, 10)]
          );
        }
      }

      await conn.commit();

      const token = jwt.sign(
        { id: userId, email: email.toLowerCase().trim(), role: assignedRole },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      await recordAuditLog(createdOrgId, userId, 'REGISTER', 'users', userId, req.ip, { role: assignedRole });

      return successResponse(res, 'Registration successful!', {
        token,
        user: {
          id: userId,
          email: email.toLowerCase().trim(),
          full_name: full_name.trim(),
          phone: phone || null,
          role: assignedRole,
          organization_id: createdOrgId
        }
      }, 201);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    next(error);
  }
};

/**
 * User Login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return errorResponse(res, 'Email and password are required.', 400);
    }

    const [users] = await pool.query(
      `SELECT id, email, password_hash, full_name, phone, role, status 
       FROM users 
       WHERE email = ?`,
      [email.toLowerCase().trim()]
    );

    if (users.length === 0) {
      return errorResponse(res, 'Invalid email or password credentials.', 401);
    }

    const user = users[0];

    if (user.status !== 'active') {
      return errorResponse(res, 'Account is suspended or inactive. Please contact support.', 403);
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return errorResponse(res, 'Invalid email or password credentials.', 401);
    }

    // Check organization membership if staff or org_admin
    let organization = null;
    let branch = null;
    let counter = null;

    if (user.role === 'org_admin' || user.role === 'staff') {
      const [memberships] = await pool.query(
        `SELECT o.id, o.name, o.slug, o.category, o.status, om.role as member_role
         FROM organization_members om
         JOIN organizations o ON om.organization_id = o.id
         WHERE om.user_id = ? AND om.status = 'active'
         LIMIT 1`,
        [user.id]
      );
      if (memberships.length > 0) {
        organization = memberships[0];
      }
    }

    if (user.role === 'staff') {
      // Find active staff assignment
      const [assignments] = await pool.query(
        `SELECT sa.branch_id, b.name as branch_name, sa.counter_id, c.counter_number, c.name as counter_name, c.service_id
         FROM staff_assignments sa
         JOIN branches b ON sa.branch_id = b.id
         LEFT JOIN counters c ON sa.counter_id = c.id
         WHERE sa.user_id = ? AND sa.is_active = 1
         LIMIT 1`,
        [user.id]
      );
      if (assignments.length > 0) {
        branch = { id: assignments[0].branch_id, name: assignments[0].branch_name };
        counter = {
          id: assignments[0].counter_id,
          counter_number: assignments[0].counter_number,
          name: assignments[0].counter_name,
          service_id: assignments[0].service_id
        };
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await recordAuditLog(organization?.id || null, user.id, 'LOGIN', 'users', user.id, req.ip);

    return successResponse(res, 'Login successful!', {
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role,
        organization,
        branch,
        counter
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Authenticated User Details
 */
const getMe = async (req, res, next) => {
  try {
    const [users] = await pool.query(
      `SELECT id, email, full_name, phone, role, status, created_at 
       FROM users 
       WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return errorResponse(res, 'User not found.', 404);
    }

    const user = users[0];
    let organization = null;
    let branch = null;
    let counter = null;

    if (user.role === 'org_admin' || user.role === 'staff') {
      const [memberships] = await pool.query(
        `SELECT o.id, o.name, o.slug, o.category, o.status, om.role as member_role
         FROM organization_members om
         JOIN organizations o ON om.organization_id = o.id
         WHERE om.user_id = ? AND om.status = 'active'
         LIMIT 1`,
        [user.id]
      );
      if (memberships.length > 0) {
        organization = memberships[0];
      }
    }

    if (user.role === 'staff') {
      const [assignments] = await pool.query(
        `SELECT sa.branch_id, b.name as branch_name, sa.counter_id, c.counter_number, c.name as counter_name, c.service_id
         FROM staff_assignments sa
         JOIN branches b ON sa.branch_id = b.id
         LEFT JOIN counters c ON sa.counter_id = c.id
         WHERE sa.user_id = ? AND sa.is_active = 1
         LIMIT 1`,
        [user.id]
      );
      if (assignments.length > 0) {
        branch = { id: assignments[0].branch_id, name: assignments[0].branch_name };
        counter = {
          id: assignments[0].counter_id,
          counter_number: assignments[0].counter_number,
          name: assignments[0].counter_name,
          service_id: assignments[0].service_id
        };
      }
    }

    return successResponse(res, 'Profile retrieved.', {
      user: {
        ...user,
        organization,
        branch,
        counter
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const { full_name, phone, current_password, new_password } = req.body;

    const [userRows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (userRows.length === 0) return errorResponse(res, 'User not found.', 404);

    let updatedHash = userRows[0].password_hash;
    if (new_password) {
      if (!current_password) {
        return errorResponse(res, 'Current password is required to change password.', 400);
      }
      const isMatch = await bcrypt.compare(current_password, userRows[0].password_hash);
      if (!isMatch) {
        return errorResponse(res, 'Current password does not match.', 400);
      }
      if (new_password.length < 6) {
        return errorResponse(res, 'New password must be at least 6 characters.', 400);
      }
      updatedHash = await bcrypt.hash(new_password, 10);
    }

    await pool.query(
      `UPDATE users 
       SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), password_hash = ?
       WHERE id = ?`,
      [full_name ? full_name.trim() : null, phone || null, updatedHash, req.user.id]
    );

    return successResponse(res, 'Profile updated successfully.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile
};
