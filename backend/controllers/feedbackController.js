const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { recordAuditLog } = require('../middleware/auth');

/**
 * Submit Feedback for Completed Visit
 */
const submitFeedback = async (req, res, next) => {
  try {
    const { token_id, rating, comments, issue_reported } = req.body;

    if (!token_id || !rating) {
      return errorResponse(res, 'Token ID and Rating (1-5) are required.', 400);
    }

    const ratingInt = parseInt(rating, 10);
    if (isNaN(ratingInt) || ratingInt < 1 || ratingInt > 5) {
      return errorResponse(res, 'Rating must be an integer between 1 and 5.', 400);
    }

    // 1. Verify token is completed and belongs to user
    const [tokens] = await pool.query(
      `SELECT id, customer_id, organization_id, service_id, status 
       FROM tokens WHERE id = ?`,
      [token_id]
    );

    if (tokens.length === 0) {
      return errorResponse(res, 'Token not found.', 404);
    }

    const token = tokens[0];

    // Only allow feedback on completed tokens
    if (token.status !== 'completed') {
      return errorResponse(
        res,
        `Feedback can only be submitted for completed visits. Current status: ${token.status}.`,
        400
      );
    }

    if (req.user.role === 'customer' && token.customer_id !== req.user.id) {
      return errorResponse(res, 'You can only review your own completed visits.', 403);
    }

    // Check if feedback already submitted
    const [existing] = await pool.query('SELECT id FROM feedback WHERE token_id = ?', [token_id]);
    if (existing.length > 0) {
      return errorResponse(res, 'Feedback has already been submitted for this token.', 409);
    }

    const [result] = await pool.query(
      `INSERT INTO feedback (token_id, organization_id, service_id, user_id, rating, comments, issue_reported)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [token_id, token.organization_id, token.service_id, req.user.id, ratingInt, comments || null, issue_reported || null]
    );

    await recordAuditLog(token.organization_id, req.user.id, 'SUBMIT_FEEDBACK', 'feedback', result.insertId, req.ip, {
      rating: ratingInt
    });

    return successResponse(res, 'Thank you! Your feedback has been recorded.', { id: result.insertId }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Get Feedback for Organization (Org Admin)
 */
const getOrgFeedback = async (req, res, next) => {
  try {
    const orgId = req.query.organization_id || req.userPrimaryOrgId;

    if (!orgId) {
      return errorResponse(res, 'Organization ID is required.', 400);
    }

    const [rows] = await pool.query(
      `SELECT f.*, t.token_number, s.name as service_name, u.full_name as customer_name
       FROM feedback f
       JOIN tokens t ON f.token_id = t.id
       JOIN services s ON f.service_id = s.id
       JOIN users u ON f.user_id = u.id
       WHERE f.organization_id = ?
       ORDER BY f.created_at DESC`,
      [orgId]
    );

    // Calculate rating averages
    const [ratingSummary] = await pool.query(
      `SELECT 
         COUNT(*) as total_feedback,
         ROUND(AVG(rating), 2) as average_rating,
         COUNT(CASE WHEN rating = 5 THEN 1 END) as star_5,
         COUNT(CASE WHEN rating = 4 THEN 1 END) as star_4,
         COUNT(CASE WHEN rating = 3 THEN 1 END) as star_3,
         COUNT(CASE WHEN rating = 2 THEN 1 END) as star_2,
         COUNT(CASE WHEN rating = 1 THEN 1 END) as star_1
       FROM feedback
       WHERE organization_id = ?`,
      [orgId]
    );

    return successResponse(res, 'Feedback retrieved.', {
      summary: ratingSummary[0] || {},
      feedbackList: rows
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitFeedback,
  getOrgFeedback
};
