const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { recordAuditLog } = require('../middleware/auth');

/**
 * Get Public Organizations (Approved only)
 */
const getOrganizations = async (req, res, next) => {
  try {
    const { category, search, limit = 50, page = 1 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT o.id, o.name, o.slug, o.category, o.description, o.contact_email, o.contact_phone, 
             o.address, o.logo_url, o.created_at,
             COUNT(DISTINCT b.id) as branch_count,
             COUNT(DISTINCT s.id) as service_count
      FROM organizations o
      LEFT JOIN branches b ON o.id = b.organization_id AND b.status = 'active'
      LEFT JOIN services s ON o.id = s.organization_id AND s.is_active = 1
      WHERE o.status = 'approved'
    `;
    const params = [];

    if (category && category !== 'all') {
      query += ' AND o.category = ?';
      params.push(category);
    }

    if (search && search.trim() !== '') {
      query += ' AND (o.name LIKE ? OR o.description LIKE ? OR o.address LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    query += ' GROUP BY o.id ORDER BY o.name ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const [rows] = await pool.query(query, params);
    return successResponse(res, 'Organizations retrieved successfully.', rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Get Organization Details with Branches and Services
 */
const getOrganizationById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [orgRows] = await pool.query(
      `SELECT id, name, slug, category, description, contact_email, contact_phone, address, status, logo_url, created_at
       FROM organizations 
       WHERE id = ? OR slug = ?`,
      [id, id]
    );

    if (orgRows.length === 0) {
      return errorResponse(res, 'Organization not found.', 404);
    }

    const org = orgRows[0];

    // Fetch active branches
    const [branches] = await pool.query(
      `SELECT id, name, code, address, city, state, postal_code, latitude, longitude, contact_phone, status
       FROM branches 
       WHERE organization_id = ? AND status = 'active'
       ORDER BY name ASC`,
      [org.id]
    );

    // Fetch active services
    const [services] = await pool.query(
      `SELECT s.id, s.branch_id, s.name, s.code, s.description, s.avg_service_duration_min, s.priority_allowed,
              b.name as branch_name
       FROM services s
       JOIN branches b ON s.branch_id = b.id
       WHERE s.organization_id = ? AND s.is_active = 1
       ORDER BY s.name ASC`,
      [org.id]
    );

    return successResponse(res, 'Organization retrieved.', {
      ...org,
      branches,
      services
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Organization Profile (Admin only)
 */
const updateOrganization = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, contact_email, contact_phone, address, logo_url, category } = req.body;

    const [orgs] = await pool.query('SELECT id, name FROM organizations WHERE id = ?', [id]);
    if (orgs.length === 0) return errorResponse(res, 'Organization not found.', 404);

    await pool.query(
      `UPDATE organizations 
       SET name = COALESCE(?, name),
           description = COALESCE(?, description),
           contact_email = COALESCE(?, contact_email),
           contact_phone = COALESCE(?, contact_phone),
           address = COALESCE(?, address),
           logo_url = COALESCE(?, logo_url),
           category = COALESCE(?, category)
       WHERE id = ?`,
      [name, description, contact_email, contact_phone, address, logo_url, category, id]
    );

    await recordAuditLog(id, req.user.id, 'UPDATE_ORG_PROFILE', 'organizations', id, req.ip);

    return successResponse(res, 'Organization updated successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Smart Branch and Service Recommendation
 * Analyzes live queue load, wait times, and optional geo-distance
 */
const getRecommendations = async (req, res, next) => {
  try {
    const { category, service_code, user_lat, user_lng } = req.query;

    let query = `
      SELECT b.id as branch_id, b.name as branch_name, b.code as branch_code, b.address, b.city,
             b.latitude, b.longitude, o.id as organization_id, o.name as organization_name, o.category,
             s.id as service_id, s.name as service_name, s.code as service_code, s.avg_service_duration_min,
             COUNT(DISTINCT CASE WHEN t.status = 'waiting' THEN t.id END) as waiting_tokens,
             COUNT(DISTINCT CASE WHEN c.status = 'active' THEN c.id END) as active_counters
      FROM branches b
      JOIN organizations o ON b.organization_id = o.id
      JOIN services s ON s.branch_id = b.id
      LEFT JOIN counters c ON c.branch_id = b.id AND (c.service_id = s.id OR c.service_id IS NULL) AND c.status = 'active'
      LEFT JOIN tokens t ON t.branch_id = b.id AND t.service_id = s.id AND t.status = 'waiting'
      WHERE o.status = 'approved' AND b.status = 'active' AND s.is_active = 1
    `;
    const params = [];

    if (category && category !== 'all') {
      query += ' AND o.category = ?';
      params.push(category);
    }

    if (service_code) {
      query += ' AND s.code = ?';
      params.push(service_code);
    }

    query += ' GROUP BY b.id, s.id';

    const [rows] = await pool.query(query, params);

    // Compute rule-based estimated wait and geo-distance
    const recommendations = rows.map(item => {
      const activeCounters = Math.max(1, item.active_counters || 1);
      const estWait = Math.ceil((item.waiting_tokens * item.avg_service_duration_min) / activeCounters);

      let distanceKm = null;
      if (user_lat && user_lng && item.latitude && item.longitude) {
        // Haversine formula
        const R = 6371; // km
        const dLat = ((item.latitude - user_lat) * Math.PI) / 180;
        const dLon = ((item.longitude - user_lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((user_lat * Math.PI) / 180) *
            Math.cos((item.latitude * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distanceKm = parseFloat((R * c).toFixed(1));
      }

      // Build clear, transparent recommendation reason
      const reasons = [];
      if (item.waiting_tokens === 0) {
        reasons.push('Zero waiting queue - instant service available');
      } else if (item.waiting_tokens < 3) {
        reasons.push(`Short queue: only ${item.waiting_tokens} customer(s) ahead`);
      } else {
        reasons.push(`Estimated wait time: ~${estWait} mins`);
      }

      if (distanceKm !== null) {
        reasons.push(`Distance: ~${distanceKm} km away`);
      }

      return {
        ...item,
        estimated_wait_minutes: estWait,
        distance_km: distanceKm,
        recommendation_reason: reasons.join(' • ')
      };
    });

    // Sort by shortest wait time, then distance
    recommendations.sort((a, b) => {
      if (a.estimated_wait_minutes !== b.estimated_wait_minutes) {
        return a.estimated_wait_minutes - b.estimated_wait_minutes;
      }
      if (a.distance_km !== null && b.distance_km !== null) {
        return a.distance_km - b.distance_km;
      }
      return 0;
    });

    return successResponse(res, 'Smart recommendations generated.', recommendations);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrganizations,
  getOrganizationById,
  updateOrganization,
  getRecommendations
};
