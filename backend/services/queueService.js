const crypto = require('crypto');
const { pool } = require('../config/db');
const {
  broadcastQueueUpdate,
  broadcastTokenUpdate,
  broadcastUserNotification,
  broadcastPublicDisplay
} = require('../sockets/socketManager');

/**
 * Priority Weights Mapping
 */
const PRIORITY_WEIGHTS = {
  emergency: 10,
  disability: 5,
  senior: 3,
  normal: 1
};

/**
 * Transparent rule-based waiting time calculation
 * Formula: Estimated Wait = ceil((peopleAhead * avgServiceDuration) / max(1, activeCounters))
 */
async function calculateWaitTime(branchId, serviceId, peopleAhead, avgDurationMin) {
  try {
    // Find number of active, non-paused counters assigned to this service or open
    const [counters] = await pool.query(
      `SELECT COUNT(*) as active_count 
       FROM counters 
       WHERE branch_id = ? 
         AND (service_id = ? OR service_id IS NULL) 
         AND status = 'active'`,
      [branchId, serviceId]
    );

    const activeCounters = Math.max(1, counters[0].active_count || 1);
    const estimatedMinutes = Math.ceil((peopleAhead * avgDurationMin) / activeCounters);

    return {
      estimatedMinutes,
      activeCounters,
      peopleAhead,
      avgServiceDuration: avgDurationMin,
      formulaExplanation: `Rule-based: (${peopleAhead} ahead * ${avgDurationMin} min avg) / ${activeCounters} active counter(s) = ${estimatedMinutes} min`
    };
  } catch (err) {
    console.error('[CALC_WAIT_TIME_ERROR]', err);
    return {
      estimatedMinutes: peopleAhead * avgDurationMin,
      activeCounters: 1,
      peopleAhead,
      avgServiceDuration: avgDurationMin,
      formulaExplanation: `Default: ${peopleAhead} ahead * ${avgDurationMin} min`
    };
  }
}

/**
 * Recalculate and update queue positions for all waiting tokens in a service
 * Maintains fair priority ordering (Priority Weight DESC, Created At ASC)
 */
async function refreshQueuePositions(connection, branchId, serviceId) {
  // Query waiting tokens ordered by priority weight then creation time
  const [waitingTokens] = await connection.query(
    `SELECT t.id, t.customer_id, t.token_number, t.priority_type, t.created_at, s.avg_service_duration_min
     FROM tokens t
     JOIN services s ON t.service_id = s.id
     WHERE t.branch_id = ? AND t.service_id = ? AND t.status = 'waiting'
     ORDER BY 
       CASE t.priority_type
         WHEN 'emergency' THEN 10
         WHEN 'disability' THEN 5
         WHEN 'senior' THEN 3
         ELSE 1
       END DESC,
       t.created_at ASC
     FOR UPDATE`,
    [branchId, serviceId]
  );

  // Get active counters for rule-based wait time
  const [counterRows] = await connection.query(
    `SELECT COUNT(*) as active_count 
     FROM counters 
     WHERE branch_id = ? AND (service_id = ? OR service_id IS NULL) AND status = 'active'`,
    [branchId, serviceId]
  );
  const activeCounters = Math.max(1, counterRows[0]?.active_count || 1);

  for (let idx = 0; idx < waitingTokens.length; idx++) {
    const token = waitingTokens[idx];
    const newPosition = idx + 1; // 1-based position
    const peopleAhead = idx;
    const avgDuration = token.avg_service_duration_min || 15;
    const estWait = Math.ceil((peopleAhead * avgDuration) / activeCounters);

    await connection.query(
      `UPDATE tokens 
       SET queue_position = ?, estimated_wait_minutes = ? 
       WHERE id = ?`,
      [newPosition, estWait, token.id]
    );

    // Send targeted position notifications if customer is close
    if (token.customer_id) {
      if (newPosition === 3) {
        await sendNotificationInternal(
          connection,
          token.customer_id,
          token.id,
          'token_near',
          'Queue Update: 3 People Ahead',
          `Your token ${token.token_number} is now #3 in line. Please proceed near the counter.`
        );
      } else if (newPosition === 1) {
        await sendNotificationInternal(
          connection,
          token.customer_id,
          token.id,
          'token_next',
          'Queue Update: You Are Next!',
          `Your token ${token.token_number} is next in line. Please be ready at the counter.`
        );
      }
    }

    // Broadcast individual token status update
    broadcastTokenUpdate(token.id, {
      queuePosition: newPosition,
      estimatedWaitMinutes: estWait,
      peopleAhead
    });
  }

  return waitingTokens.length;
}

/**
 * Internal Notification Generator
 */
async function sendNotificationInternal(connection, userId, tokenId, type, title, message) {
  try {
    const [res] = await connection.query(
      `INSERT INTO notifications (user_id, token_id, type, title, message, is_read, channel)
       VALUES (?, ?, ?, ?, ?, 0, 'in_app')`,
      [userId, tokenId, type, title, message]
    );

    broadcastUserNotification(userId, {
      id: res.insertId,
      tokenId,
      type,
      title,
      message,
      isRead: false,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[SEND_NOTIFICATION_ERROR]', err.message);
  }
}

/**
 * Trigger Public Display and Queue Broadcasts
 */
async function syncBranchDisplay(branchId) {
  try {
    // Current serving tokens at each counter
    const [nowServing] = await pool.query(
      `SELECT c.counter_number, c.name as counter_name, t.token_number, t.display_code, 
              s.name as service_name, t.called_at, t.served_at, t.status
       FROM counters c
       LEFT JOIN tokens t ON c.id = t.counter_id AND t.status IN ('called', 'serving')
       LEFT JOIN services s ON t.service_id = s.id
       WHERE c.branch_id = ? AND c.status = 'active'
       ORDER BY c.counter_number ASC`,
      [branchId]
    );

    // Next waiting tokens
    const [nextWaiting] = await pool.query(
      `SELECT t.id, t.token_number, t.display_code, s.name as service_name, t.queue_position, t.priority_type
       FROM tokens t
       JOIN services s ON t.service_id = s.id
       WHERE t.branch_id = ? AND t.status = 'waiting'
       ORDER BY t.queue_position ASC
       LIMIT 8`,
      [branchId]
    );

    broadcastPublicDisplay(branchId, {
      nowServing,
      nextWaiting
    });
  } catch (err) {
    console.error('[SYNC_BRANCH_DISPLAY_ERROR]', err);
  }
}

module.exports = {
  PRIORITY_WEIGHTS,
  calculateWaitTime,
  refreshQueuePositions,
  sendNotificationInternal,
  syncBranchDisplay
};
