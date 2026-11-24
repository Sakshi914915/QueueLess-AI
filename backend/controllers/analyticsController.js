const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHelper');

/**
 * Organization Queue Analytics Overview
 * All data computed directly from live MySQL records
 */
const getOrgOverview = async (req, res, next) => {
  try {
    const orgId = req.query.organization_id || req.userPrimaryOrgId;

    if (!orgId) {
      return errorResponse(res, 'Organization ID is required.', 400);
    }

    // 1. Core Summary Metrics (Today & Overall)
    const [summaryRows] = await pool.query(
      `SELECT 
         COUNT(*) as total_tokens,
         COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_tokens,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tokens,
         COUNT(CASE WHEN status = 'waiting' THEN 1 END) as waiting_tokens,
         COUNT(CASE WHEN status = 'called' THEN 1 END) as called_tokens,
         COUNT(CASE WHEN status = 'serving' THEN 1 END) as serving_tokens,
         COUNT(CASE WHEN status = 'no_show' THEN 1 END) as no_show_tokens,
         COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_tokens,
         COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped_tokens,
         ROUND(AVG(CASE WHEN called_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, created_at, called_at) END), 1) as avg_wait_time_minutes,
         ROUND(AVG(CASE WHEN completed_at IS NOT NULL AND served_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, served_at, completed_at) END), 1) as avg_service_duration_minutes
       FROM tokens
       WHERE organization_id = ?`,
      [orgId]
    );

    const s = summaryRows[0] || {};
    const total = s.total_tokens || 0;
    const noShowCount = s.no_show_tokens || 0;
    const noShowRate = total > 0 ? parseFloat(((noShowCount / total) * 100).toFixed(1)) : 0.0;

    // 2. 7-Day Trend for Chart.js
    const [trendRows] = await pool.query(
      `SELECT 
         DATE(created_at) as date_val,
         DATE_FORMAT(created_at, '%b %d') as date_label,
         COUNT(*) as total_tokens,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tokens,
         COUNT(CASE WHEN status = 'no_show' THEN 1 END) as no_show_tokens
       FROM tokens
       WHERE organization_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE(created_at), DATE_FORMAT(created_at, '%b %d')
       ORDER BY DATE(created_at) ASC`,
      [orgId]
    );

    // 3. Counter Utilization
    const [counterUtilization] = await pool.query(
      `SELECT c.id, c.name as counter_name, c.counter_number, c.status,
              b.name as branch_name,
              COUNT(t.id) as served_count
       FROM counters c
       JOIN branches b ON c.branch_id = b.id
       LEFT JOIN tokens t ON c.id = t.counter_id AND t.status = 'completed' AND DATE(t.completed_at) = CURDATE()
       WHERE b.organization_id = ?
       GROUP BY c.id
       ORDER BY c.counter_number ASC`,
      [orgId]
    );

    // 4. Service Breakdown
    const [serviceBreakdown] = await pool.query(
      `SELECT s.id, s.name as service_name, s.code as service_code, s.avg_service_duration_min,
              COUNT(t.id) as total_tokens,
              COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tokens,
              COUNT(CASE WHEN t.status = 'waiting' THEN 1 END) as waiting_tokens,
              ROUND(AVG(CASE WHEN t.called_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, t.created_at, t.called_at) END), 1) as avg_wait_min
       FROM services s
       LEFT JOIN tokens t ON s.id = t.service_id
       WHERE s.organization_id = ?
       GROUP BY s.id
       ORDER BY total_tokens DESC`,
      [orgId]
    );

    return successResponse(res, 'Analytics overview retrieved.', {
      summary: {
        totalTokens: total,
        todayTokens: s.today_tokens || 0,
        completedTokens: s.completed_tokens || 0,
        waitingTokens: s.waiting_tokens || 0,
        calledTokens: s.called_tokens || 0,
        servingTokens: s.serving_tokens || 0,
        noShowTokens: noShowCount,
        cancelledTokens: s.cancelled_tokens || 0,
        skippedTokens: s.skipped_tokens || 0,
        noShowRatePercent: noShowRate,
        avgWaitTimeMinutes: s.avg_wait_time_minutes || 0,
        avgServiceDurationMinutes: s.avg_service_duration_minutes || 0
      },
      trends: trendRows,
      counterUtilization,
      serviceBreakdown
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Export Queue Report to CSV
 */
const exportCSV = async (req, res, next) => {
  try {
    const orgId = req.query.organization_id || req.userPrimaryOrgId;

    const [tokens] = await pool.query(
      `SELECT t.token_number, t.display_code, t.status, t.priority_type,
              s.name as service_name, b.name as branch_name, c.name as counter_name,
              u.full_name as customer_name,
              t.created_at, t.called_at, t.served_at, t.completed_at
       FROM tokens t
       JOIN services s ON t.service_id = s.id
       JOIN branches b ON t.branch_id = b.id
       LEFT JOIN counters c ON t.counter_id = c.id
       LEFT JOIN users u ON t.customer_id = u.id
       WHERE t.organization_id = ?
       ORDER BY t.created_at DESC`,
      [orgId]
    );

    let csv = 'Token Number,Display Code,Service,Branch,Counter,Customer,Priority,Status,Created At,Called At,Served At,Completed At\n';

    for (const t of tokens) {
      csv += `"${t.token_number}","${t.display_code}","${t.service_name || ''}","${t.branch_name || ''}","${t.counter_name || ''}","${t.customer_name || 'Walk-in'}","${t.priority_type}","${t.status}","${t.created_at || ''}","${t.called_at || ''}","${t.served_at || ''}","${t.completed_at || ''}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="queueless_tokens_${Date.now()}.csv"`);
    return res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrgOverview,
  exportCSV
};
