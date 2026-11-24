const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { recordAuditLog } = require('../middleware/auth');

/**
 * Get Services
 */
const getServices = async (req, res, next) => {
  try {
    const { branch_id, organization_id, is_active } = req.query;

    let query = `
      SELECT s.id, s.organization_id, s.branch_id, s.name, s.code, s.description, 
             s.avg_service_duration_min, s.is_active, s.priority_allowed, s.created_at,
             b.name as branch_name, o.name as organization_name,
             COUNT(DISTINCT CASE WHEN t.status = 'waiting' THEN t.id END) as waiting_count,
             COUNT(DISTINCT CASE WHEN c.status = 'active' THEN c.id END) as active_counters
      FROM services s
      JOIN branches b ON s.branch_id = b.id
      JOIN organizations o ON s.organization_id = o.id
      LEFT JOIN counters c ON c.branch_id = s.branch_id AND (c.service_id = s.id OR c.service_id IS NULL) AND c.status = 'active'
      LEFT JOIN tokens t ON t.service_id = s.id AND t.status = 'waiting'
      WHERE 1=1
    `;
    const params = [];

    if (branch_id) {
      query += ' AND s.branch_id = ?';
      params.push(branch_id);
    }

    if (organization_id) {
      query += ' AND s.organization_id = ?';
      params.push(organization_id);
    }

    if (is_active !== undefined) {
      query += ' AND s.is_active = ?';
      params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
    }

    query += ' GROUP BY s.id ORDER BY s.name ASC';

    const [rows] = await pool.query(query, params);
    return successResponse(res, 'Services retrieved successfully.', rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Get Service By ID
 */
const getServiceById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT s.*, b.name as branch_name, o.name as organization_name,
              COUNT(DISTINCT CASE WHEN t.status = 'waiting' THEN t.id END) as waiting_count
       FROM services s
       JOIN branches b ON s.branch_id = b.id
       JOIN organizations o ON s.organization_id = o.id
       LEFT JOIN tokens t ON t.service_id = s.id AND t.status = 'waiting'
       WHERE s.id = ?
       GROUP BY s.id`,
      [id]
    );

    if (rows.length === 0) return errorResponse(res, 'Service not found.', 404);

    return successResponse(res, 'Service details retrieved.', rows[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * Create Service
 */
const createService = async (req, res, next) => {
  try {
    const { organization_id, branch_id, name, code, description, avg_service_duration_min = 15, priority_allowed = true } = req.body;

    if (!organization_id || !branch_id || !name || !code) {
      return errorResponse(res, 'Organization ID, branch ID, name, and service code are required.', 400);
    }

    const cleanCode = code.toUpperCase().trim();

    // Check code duplication in branch
    const [exists] = await pool.query(
      'SELECT id FROM services WHERE branch_id = ? AND code = ?',
      [branch_id, cleanCode]
    );
    if (exists.length > 0) {
      return errorResponse(res, 'A service with this code already exists in this branch.', 409);
    }

    const [result] = await pool.query(
      `INSERT INTO services (organization_id, branch_id, name, code, description, avg_service_duration_min, is_active, priority_allowed)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [organization_id, branch_id, name.trim(), cleanCode, description || null, parseInt(avg_service_duration_min, 10) || 15, priority_allowed ? 1 : 0]
    );

    await recordAuditLog(organization_id, req.user.id, 'CREATE_SERVICE', 'services', result.insertId, req.ip);

    return successResponse(res, 'Service created successfully.', { id: result.insertId }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Update Service
 */
const updateService = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, description, avg_service_duration_min, is_active, priority_allowed } = req.body;

    const [service] = await pool.query('SELECT organization_id FROM services WHERE id = ?', [id]);
    if (service.length === 0) return errorResponse(res, 'Service not found.', 404);

    await pool.query(
      `UPDATE services 
       SET name = COALESCE(?, name),
           code = COALESCE(?, code),
           description = COALESCE(?, description),
           avg_service_duration_min = COALESCE(?, avg_service_duration_min),
           is_active = COALESCE(?, is_active),
           priority_allowed = COALESCE(?, priority_allowed)
       WHERE id = ?`,
      [name, code ? code.toUpperCase().trim() : null, description, avg_service_duration_min, is_active, priority_allowed, id]
    );

    await recordAuditLog(service[0].organization_id, req.user.id, 'UPDATE_SERVICE', 'services', id, req.ip);

    return successResponse(res, 'Service updated successfully.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getServices,
  getServiceById,
  createService,
  updateService
};
