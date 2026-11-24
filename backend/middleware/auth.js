const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { errorResponse } = require('../utils/responseHelper');

/**
 * Verify JWT Token Middleware
 */
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 'Authentication required. No token provided.', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'queueless_ai_jwt_secret_mca_production_grade_token_2026');

    // Fetch user from DB to verify active status
    const [rows] = await pool.query(
      'SELECT id, email, full_name, role, status FROM users WHERE id = ?',
      [decoded.id]
    );

    if (rows.length === 0) {
      return errorResponse(res, 'User no longer exists.', 401);
    }

    const user = rows[0];
    if (user.status !== 'active') {
      return errorResponse(res, 'Account is inactive or suspended. Please contact administrator.', 403);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return errorResponse(res, 'Session token expired. Please log in again.', 401);
    }
    return errorResponse(res, 'Invalid authentication token.', 401);
  }
};

/**
 * Role-Based Access Control Middleware
 */
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return errorResponse(
        res,
        `Access denied. Requires one of roles: [${roles.join(', ')}]. Current role: ${req.user ? req.user.role : 'none'}`,
        403
      );
    }
    next();
  };
};

/**
 * Multi-Tenant Organization Data Isolation Guard
 * Ensures org_admin and staff can only access resources belonging to their registered organization.
 * super_admin has platform-wide access.
 */
const checkOrgAccess = async (req, res, next) => {
  try {
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Determine target orgId from params, query, or body
    const targetOrgId = parseInt(req.params.orgId || req.params.organizationId || req.params.id || req.body.organization_id || req.query.organization_id, 10);

    // Get user's organization memberships
    const [memberships] = await pool.query(
      'SELECT organization_id, role, status FROM organization_members WHERE user_id = ? AND status = "active"',
      [req.user.id]
    );

    if (memberships.length === 0) {
      return errorResponse(res, 'You are not assigned to any active organization.', 403);
    }

    req.userOrganizations = memberships.map(m => m.organization_id);
    req.userPrimaryOrgId = memberships[0].organization_id;

    if (targetOrgId && !req.userOrganizations.includes(targetOrgId)) {
      return errorResponse(res, 'Unauthorized: Access to another organization\'s data is strictly prohibited.', 403);
    }

    next();
  } catch (error) {
    console.error('[AUTH_ORG_GUARD] Error:', error);
    return errorResponse(res, 'Failed to verify organization authorization.', 500);
  }
};

/**
 * Audit Logging Helper
 */
const recordAuditLog = async (orgId, userId, action, entity, entityId, ipAddress = null, details = null) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, action, entity, entity_id, ip_address, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orgId || null, userId || null, action, entity, String(entityId || ''), ipAddress, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('[AUDIT_LOG_ERROR]', err.message);
  }
};

module.exports = {
  verifyToken,
  authorizeRoles,
  checkOrgAccess,
  recordAuditLog
};
