const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { recordAuditLog } = require('../middleware/auth');

/**
 * Super Admin Platform-wide Overview
 */
const getPlatformOverview = async (req, res, next) => {
  try {
    // Total organizations by status
    const [orgCounts] = await pool.query(
      `SELECT 
         COUNT(*) as total_orgs,
         COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_orgs,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orgs,
         COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended_orgs
       FROM organizations`
    );

    // Total users by role
    const [userCounts] = await pool.query(
      `SELECT 
         COUNT(*) as total_users,
         COUNT(CASE WHEN role = 'customer' THEN 1 END) as customer_count,
         COUNT(CASE WHEN role = 'org_admin' THEN 1 END) as org_admin_count,
         COUNT(CASE WHEN role = 'staff' THEN 1 END) as staff_count
       FROM users`
    );

    // Total tokens and activity
    const [tokenCounts] = await pool.query(
      `SELECT 
         COUNT(*) as total_tokens,
         COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_tokens,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tokens,
         COUNT(CASE WHEN status = 'waiting' THEN 1 END) as active_waiting_tokens
       FROM tokens`
    );

    // Total branches and services
    const [infraCounts] = await pool.query(
      `SELECT 
         (SELECT COUNT(*) FROM branches WHERE status = 'active') as active_branches,
         (SELECT COUNT(*) FROM services WHERE is_active = 1) as active_services,
         (SELECT COUNT(*) FROM counters WHERE status = 'active') as active_counters`
    );

    return successResponse(res, 'Super Admin overview retrieved.', {
      organizations: orgCounts[0] || {},
      users: userCounts[0] || {},
      tokens: tokenCounts[0] || {},
      infrastructure: infraCounts[0] || {},
      systemHealth: {
        status: 'Operational',
        database: 'Connected (MySQL 8.0)',
        realtime: 'Active (Socket.IO)',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get All Registered Organizations (Super Admin)
 */
const getAllOrganizations = async (req, res, next) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT o.*, u.full_name as creator_name, u.email as creator_email,
             COUNT(DISTINCT b.id) as branch_count,
             COUNT(DISTINCT s.id) as service_count,
             COUNT(DISTINCT om.user_id) as member_count
      FROM organizations o
      LEFT JOIN users u ON o.created_by = u.id
      LEFT JOIN branches b ON o.id = b.organization_id
      LEFT JOIN services s ON o.id = s.organization_id
      LEFT JOIN organization_members om ON o.id = om.organization_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND o.status = ?';
      params.push(status);
    }

    query += ' GROUP BY o.id ORDER BY o.created_at DESC';

    const [rows] = await pool.query(query, params);
    return successResponse(res, 'All organizations retrieved.', rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Approve, Reject, or Suspend Organization
 */
const updateOrgStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ['approved', 'rejected', 'suspended', 'pending'];
    if (!status || !allowed.includes(status)) {
      return errorResponse(res, `Invalid status. Allowed values: ${allowed.join(', ')}`, 400);
    }

    const [orgs] = await pool.query('SELECT name FROM organizations WHERE id = ?', [id]);
    if (orgs.length === 0) return errorResponse(res, 'Organization not found.', 404);

    await pool.query('UPDATE organizations SET status = ? WHERE id = ?', [status, id]);

    await recordAuditLog(id, req.user.id, `ORG_${status.toUpperCase()}`, 'organizations', id, req.ip, {
      new_status: status
    });

    return successResponse(res, `Organization '${orgs[0].name}' status updated to '${status}'.`);
  } catch (error) {
    next(error);
  }
};

/**
 * Get Audit Logs
 */
const getAuditLogs = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*, u.email as user_email, u.full_name as user_name, o.name as org_name
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       LEFT JOIN organizations o ON a.organization_id = o.id
       ORDER BY a.timestamp DESC
       LIMIT 100`
    );

    return successResponse(res, 'Audit logs retrieved.', rows);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPlatformOverview,
  getAllOrganizations,
  updateOrgStatus,
  getAuditLogs
};
