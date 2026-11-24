const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { syncBranchDisplay } = require('../services/queueService');
const { recordAuditLog } = require('../middleware/auth');

/**
 * Get Counters
 */
const getCounters = async (req, res, next) => {
  try {
    const { branch_id } = req.query;

    if (!branch_id) {
      return errorResponse(res, 'Branch ID is required.', 400);
    }

    const [rows] = await pool.query(
      `SELECT c.id, c.branch_id, c.name, c.counter_number, c.service_id, c.status, c.pause_reason,
              s.name as service_name, s.code as service_code,
              u.id as staff_user_id, u.full_name as staff_name, u.email as staff_email,
              t.id as current_token_id, t.token_number as current_token_number, t.status as token_status
       FROM counters c
       LEFT JOIN services s ON c.service_id = s.id
       LEFT JOIN staff_assignments sa ON c.id = sa.counter_id AND sa.is_active = 1
       LEFT JOIN users u ON sa.user_id = u.id
       LEFT JOIN tokens t ON c.id = t.counter_id AND t.status IN ('called', 'serving')
       WHERE c.branch_id = ?
       ORDER BY c.counter_number ASC`,
      [branch_id]
    );

    return successResponse(res, 'Counters retrieved successfully.', rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Create Counter
 */
const createCounter = async (req, res, next) => {
  try {
    const { branch_id, name, counter_number, service_id } = req.body;

    if (!branch_id || !name || !counter_number) {
      return errorResponse(res, 'Branch ID, counter name, and counter number are required.', 400);
    }

    // Check duplicate counter number in branch
    const [exists] = await pool.query(
      'SELECT id FROM counters WHERE branch_id = ? AND counter_number = ?',
      [branch_id, counter_number]
    );
    if (exists.length > 0) {
      return errorResponse(res, `Counter number ${counter_number} already exists in this branch.`, 409);
    }

    const [branchRow] = await pool.query('SELECT organization_id FROM branches WHERE id = ?', [branch_id]);
    if (branchRow.length === 0) return errorResponse(res, 'Branch not found.', 404);

    const [result] = await pool.query(
      `INSERT INTO counters (branch_id, name, counter_number, service_id, status)
       VALUES (?, ?, ?, ?, 'active')`,
      [branch_id, name.trim(), counter_number, service_id || null]
    );

    await syncBranchDisplay(branch_id);
    await recordAuditLog(branchRow[0].organization_id, req.user.id, 'CREATE_COUNTER', 'counters', result.insertId, req.ip);

    return successResponse(res, 'Counter created successfully.', { id: result.insertId }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Update Counter Status (Pause / Resume / Close)
 */
const updateCounterStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, pause_reason } = req.body;

    const allowed = ['active', 'paused', 'closed'];
    if (!status || !allowed.includes(status)) {
      return errorResponse(res, `Status must be one of: ${allowed.join(', ')}`, 400);
    }

    const [counter] = await pool.query(
      `SELECT c.id, c.branch_id, b.organization_id 
       FROM counters c 
       JOIN branches b ON c.branch_id = b.id 
       WHERE c.id = ?`,
      [id]
    );
    if (counter.length === 0) return errorResponse(res, 'Counter not found.', 404);

    await pool.query(
      `UPDATE counters 
       SET status = ?, pause_reason = ? 
       WHERE id = ?`,
      [status, status === 'paused' ? pause_reason || 'Temporary break' : null, id]
    );

    await syncBranchDisplay(counter[0].branch_id);
    await recordAuditLog(counter[0].organization_id, req.user.id, `COUNTER_${status.toUpperCase()}`, 'counters', id, req.ip, { pause_reason });

    return successResponse(res, `Counter is now ${status}.`);
  } catch (error) {
    next(error);
  }
};

/**
 * Assign Staff to Counter
 */
const assignStaffToCounter = async (req, res, next) => {
  try {
    const { user_id, branch_id, counter_id } = req.body;

    if (!user_id || !branch_id) {
      return errorResponse(res, 'User ID and branch ID are required.', 400);
    }

    const [user] = await pool.query('SELECT id, role FROM users WHERE id = ?', [user_id]);
    if (user.length === 0) return errorResponse(res, 'Staff user not found.', 404);

    await pool.query(
      `INSERT INTO staff_assignments (user_id, branch_id, counter_id, is_active)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE counter_id = VALUES(counter_id), is_active = 1`,
      [user_id, branch_id, counter_id || null]
    );

    return successResponse(res, 'Staff assigned to counter successfully.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCounters,
  createCounter,
  updateCounterStatus,
  assignStaffToCounter
};
