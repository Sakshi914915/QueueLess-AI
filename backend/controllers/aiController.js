const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { generateQueueAssistantResponse, generateAdminAssistantResponse } = require('../services/geminiService');

/**
 * AI Queue Assistant (Customer)
 */
const askQueueAssistant = async (req, res, next) => {
  try {
    const { question, language = 'en' } = req.body;

    if (!question || question.trim() === '') {
      return errorResponse(res, 'Please provide a question.', 400);
    }

    // 1. Fetch verified customer context from MySQL
    let userContext = {
      userId: req.user?.id || null,
      userName: req.user?.full_name || 'Guest User',
      activeTokens: [],
      recentAppointments: []
    };

    if (req.user?.id) {
      const [tokens] = await pool.query(
        `SELECT t.id, t.token_number, t.display_code, t.status, t.queue_position, 
                t.estimated_wait_minutes, t.priority_type,
                s.name as service_name, s.avg_service_duration_min,
                b.name as branch_name, o.name as organization_name
         FROM tokens t
         JOIN services s ON t.service_id = s.id
         JOIN branches b ON t.branch_id = b.id
         JOIN organizations o ON t.organization_id = o.id
         WHERE t.customer_id = ? AND t.status IN ('waiting', 'called', 'serving')
         ORDER BY t.created_at DESC`,
        [req.user.id]
      );
      userContext.activeTokens = tokens;

      const [appointments] = await pool.query(
        `SELECT a.id, a.appointment_date, a.time_slot, a.status, s.name as service_name, b.name as branch_name
         FROM appointments a
         JOIN services s ON a.service_id = s.id
         JOIN branches b ON a.branch_id = b.id
         WHERE a.user_id = ? AND a.appointment_date >= CURDATE() AND a.status = 'booked'
         ORDER BY a.appointment_date ASC LIMIT 3`,
        [req.user.id]
      );
      userContext.recentAppointments = appointments;
    }

    // 2. Call AI service with verified context only
    const aiResult = await generateQueueAssistantResponse({
      userQuery: question.trim(),
      userContext,
      language
    });

    return successResponse(res, 'AI response generated.', aiResult);
  } catch (error) {
    next(error);
  }
};

/**
 * AI Admin Assistant (Organization Administrator)
 */
const askAdminAssistant = async (req, res, next) => {
  try {
    const { question } = req.body;
    const orgId = req.query.organization_id || req.userPrimaryOrgId;

    if (!question || question.trim() === '') {
      return errorResponse(res, 'Please provide an analytical question.', 400);
    }

    if (!orgId) {
      return errorResponse(res, 'Organization context is required.', 400);
    }

    // 1. Fetch authorized organization details
    const [orgRows] = await pool.query('SELECT name FROM organizations WHERE id = ?', [orgId]);
    const orgName = orgRows.length > 0 ? orgRows[0].name : 'Your Organization';

    // 2. Fetch verified authorized MySQL metrics
    const [summary] = await pool.query(
      `SELECT 
         COUNT(*) as total_tokens,
         COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_tokens,
         COUNT(CASE WHEN status = 'completed' AND DATE(completed_at) = CURDATE() THEN 1 END) as completed_today,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_all_time,
         COUNT(CASE WHEN status = 'waiting' THEN 1 END) as waiting_tokens,
         COUNT(CASE WHEN status = 'no_show' AND DATE(created_at) = CURDATE() THEN 1 END) as no_show_today,
         COUNT(CASE WHEN status = 'cancelled' AND DATE(created_at) = CURDATE() THEN 1 END) as cancelled_today,
         ROUND(AVG(CASE WHEN called_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, created_at, called_at) END), 1) as avg_wait_min
       FROM tokens
       WHERE organization_id = ?`,
      [orgId]
    );

    const s = summary[0] || {};
    const totalToday = s.today_tokens || 0;
    const noShowRate = totalToday > 0 ? parseFloat(((s.no_show_today / totalToday) * 100).toFixed(1)) : 0.0;

    const [serviceStats] = await pool.query(
      `SELECT s.id, s.name as service_name, s.avg_service_duration_min,
              COUNT(CASE WHEN t.status = 'waiting' THEN 1 END) as waiting_count,
              COUNT(CASE WHEN t.status = 'completed' AND DATE(t.completed_at) = CURDATE() THEN 1 END) as completed_today
       FROM services s
       LEFT JOIN tokens t ON s.id = t.service_id
       WHERE s.organization_id = ?
       GROUP BY s.id`,
      [orgId]
    );

    const [counterStats] = await pool.query(
      `SELECT c.id, c.name as counter_name, c.status,
              COUNT(t.id) as served_today
       FROM counters c
       JOIN branches b ON c.branch_id = b.id
       LEFT JOIN tokens t ON c.id = t.counter_id AND t.status = 'completed' AND DATE(t.completed_at) = CURDATE()
       WHERE b.organization_id = ?
       GROUP BY c.id`,
      [orgId]
    );

    const metricsContext = {
      summary: {
        totalTokens: totalToday,
        completedTokens: s.completed_today || 0,
        waitingTokens: s.waiting_tokens || 0,
        noShowTokens: s.no_show_today || 0,
        cancelledTokens: s.cancelled_today || 0,
        avgWaitTimeMinutes: s.avg_wait_min || 0,
        noShowRatePercent: noShowRate
      },
      serviceStats,
      counterStats
    };

    // 3. Pass safe summary to AI service
    const aiResult = await generateAdminAssistantResponse({
      adminQuery: question.trim(),
      metricsContext,
      orgName
    });

    return successResponse(res, 'AI Admin analysis generated.', aiResult);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  askQueueAssistant,
  askAdminAssistant
};
