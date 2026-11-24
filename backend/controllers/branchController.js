const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { recordAuditLog } = require('../middleware/auth');

/**
 * Get Branches
 */
const getBranches = async (req, res, next) => {
  try {
    const { organization_id, status } = req.query;

    let query = `
      SELECT b.id, b.organization_id, b.name, b.code, b.address, b.city, b.state, 
             b.postal_code, b.latitude, b.longitude, b.contact_phone, b.status, b.created_at,
             o.name as organization_name,
             COUNT(DISTINCT s.id) as service_count,
             COUNT(DISTINCT c.id) as counter_count
      FROM branches b
      JOIN organizations o ON b.organization_id = o.id
      LEFT JOIN services s ON b.id = s.branch_id AND s.is_active = 1
      LEFT JOIN counters c ON b.id = c.branch_id AND c.status = 'active'
      WHERE 1=1
    `;
    const params = [];

    if (organization_id) {
      query += ' AND b.organization_id = ?';
      params.push(organization_id);
    }

    if (status) {
      query += ' AND b.status = ?';
      params.push(status);
    }

    query += ' GROUP BY b.id ORDER BY b.name ASC';

    const [rows] = await pool.query(query, params);
    return successResponse(res, 'Branches retrieved successfully.', rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Get Branch By ID
 */
const getBranchById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [branches] = await pool.query(
      `SELECT b.*, o.name as organization_name, o.category
       FROM branches b
       JOIN organizations o ON b.organization_id = o.id
       WHERE b.id = ?`,
      [id]
    );

    if (branches.length === 0) {
      return errorResponse(res, 'Branch not found.', 404);
    }

    const branch = branches[0];

    // Get operating hours
    const [hours] = await pool.query(
      'SELECT day_of_week, open_time, close_time, is_closed FROM operating_hours WHERE branch_id = ?',
      [id]
    );

    // Get services
    const [services] = await pool.query(
      'SELECT id, name, code, description, avg_service_duration_min, is_active FROM services WHERE branch_id = ? AND is_active = 1',
      [id]
    );

    // Get counters
    const [counters] = await pool.query(
      'SELECT id, name, counter_number, service_id, status FROM counters WHERE branch_id = ?',
      [id]
    );

    return successResponse(res, 'Branch details retrieved.', {
      ...branch,
      operating_hours: hours,
      services,
      counters
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create Branch
 */
const createBranch = async (req, res, next) => {
  try {
    const { organization_id, name, code, address, city, state, postal_code, latitude, longitude, contact_phone } = req.body;

    if (!organization_id || !name || !code || !address || !city) {
      return errorResponse(res, 'Organization ID, name, code, address, and city are required.', 400);
    }

    // Check code duplication
    const [exists] = await pool.query(
      'SELECT id FROM branches WHERE organization_id = ? AND code = ?',
      [organization_id, code.toUpperCase().trim()]
    );
    if (exists.length > 0) {
      return errorResponse(res, 'A branch with this code already exists for your organization.', 409);
    }

    const [result] = await pool.query(
      `INSERT INTO branches (organization_id, name, code, address, city, state, postal_code, latitude, longitude, contact_phone, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        organization_id,
        name.trim(),
        code.toUpperCase().trim(),
        address.trim(),
        city.trim(),
        state || null,
        postal_code || null,
        latitude || null,
        longitude || null,
        contact_phone || null
      ]
    );

    const branchId = result.insertId;

    // Seed default operating hours Mon-Sat 09:00 - 18:00
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    for (const d of days) {
      await pool.query(
        `INSERT INTO operating_hours (branch_id, day_of_week, open_time, close_time, is_closed)
         VALUES (?, ?, '09:00:00', '18:00:00', ?)`,
        [branchId, d, d === 'Sunday' ? 1 : 0]
      );
    }

    await recordAuditLog(organization_id, req.user.id, 'CREATE_BRANCH', 'branches', branchId, req.ip);

    return successResponse(res, 'Branch created successfully.', { id: branchId }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Update Branch
 */
const updateBranch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, address, city, state, postal_code, latitude, longitude, contact_phone, status } = req.body;

    const [branch] = await pool.query('SELECT organization_id FROM branches WHERE id = ?', [id]);
    if (branch.length === 0) return errorResponse(res, 'Branch not found.', 404);

    await pool.query(
      `UPDATE branches 
       SET name = COALESCE(?, name),
           code = COALESCE(?, code),
           address = COALESCE(?, address),
           city = COALESCE(?, city),
           state = COALESCE(?, state),
           postal_code = COALESCE(?, postal_code),
           latitude = COALESCE(?, latitude),
           longitude = COALESCE(?, longitude),
           contact_phone = COALESCE(?, contact_phone),
           status = COALESCE(?, status)
       WHERE id = ?`,
      [name, code, address, city, state, postal_code, latitude, longitude, contact_phone, status, id]
    );

    await recordAuditLog(branch[0].organization_id, req.user.id, 'UPDATE_BRANCH', 'branches', id, req.ip);

    return successResponse(res, 'Branch updated successfully.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBranches,
  getBranchById,
  createBranch,
  updateBranch
};
