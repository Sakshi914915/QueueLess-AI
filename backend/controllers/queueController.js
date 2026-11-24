const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const {
  refreshQueuePositions,
  sendNotificationInternal,
  syncBranchDisplay
} = require('../services/queueService');
const {
  broadcastQueueUpdate,
  broadcastTokenUpdate
} = require('../sockets/socketManager');
const { recordAuditLog } = require('../middleware/auth');

/**
 * Get Live Queue Status for Branch & Service
 */
const getLiveQueue = async (req, res, next) => {
  try {
    const { branchId, serviceId } = req.params;

    // Get current serving tokens at this branch/service
    const [servingTokens] = await pool.query(
      `SELECT t.id, t.token_number, t.display_code, t.status, t.called_at, t.served_at,
              c.id as counter_id, c.counter_number, c.name as counter_name,
              s.name as service_name, u.full_name as customer_name
       FROM tokens t
       JOIN counters c ON t.counter_id = c.id
       JOIN services s ON t.service_id = s.id
       LEFT JOIN users u ON t.customer_id = u.id
       WHERE t.branch_id = ? AND (? IS NULL OR t.service_id = ?) AND t.status IN ('called', 'serving')
       ORDER BY t.called_at DESC`,
      [branchId, serviceId === 'all' ? null : serviceId, serviceId === 'all' ? null : serviceId]
    );

    // Get waiting queue ordered by priority and creation time
    const [waitingQueue] = await pool.query(
      `SELECT t.id, t.token_number, t.display_code, t.queue_position, t.estimated_wait_minutes,
              t.priority_type, t.priority_reason, t.created_at, t.walkin_name,
              s.id as service_id, s.name as service_name, s.avg_service_duration_min,
              u.full_name as customer_name, u.phone as customer_phone
       FROM tokens t
       JOIN services s ON t.service_id = s.id
       LEFT JOIN users u ON t.customer_id = u.id
       WHERE t.branch_id = ? AND (? IS NULL OR t.service_id = ?) AND t.status = 'waiting'
       ORDER BY t.queue_position ASC`,
      [branchId, serviceId === 'all' ? null : serviceId, serviceId === 'all' ? null : serviceId]
    );

    return successResponse(res, 'Live queue status retrieved.', {
      branchId: parseInt(branchId, 10),
      serviceId: serviceId === 'all' ? null : parseInt(serviceId, 10),
      servingTokens,
      waitingQueue,
      totalWaiting: waitingQueue.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Staff Action: Call Next Token
 */
const callNextToken = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { counter_id, service_id, branch_id } = req.body;

    if (!counter_id || !branch_id) {
      return errorResponse(res, 'Counter ID and Branch ID are required.', 400);
    }

    await conn.beginTransaction();

    // 1. Verify counter status
    const [counters] = await conn.query(
      `SELECT c.id, c.status, c.counter_number, c.name as counter_name, b.organization_id 
       FROM counters c 
       JOIN branches b ON c.branch_id = b.id 
       WHERE c.id = ? FOR UPDATE`,
      [counter_id]
    );

    if (counters.length === 0 || counters[0].status !== 'active') {
      await conn.rollback();
      return errorResponse(res, 'Counter is not active or not found.', 400);
    }

    const counter = counters[0];

    // Check if counter is currently serving another token
    const [currentlyServing] = await conn.query(
      `SELECT id, token_number FROM tokens 
       WHERE counter_id = ? AND status IN ('called', 'serving')`,
      [counter_id]
    );

    if (currentlyServing.length > 0) {
      await conn.rollback();
      return errorResponse(
        res,
        `Counter is already attending token ${currentlyServing[0].token_number}. Please complete or skip it first.`,
        400
      );
    }

    // 2. Find top eligible waiting token
    let query = `
      SELECT t.id, t.token_number, t.customer_id, t.service_id, t.branch_id, s.name as service_name
      FROM tokens t
      JOIN services s ON t.service_id = s.id
      WHERE t.branch_id = ? AND t.status = 'waiting'
    `;
    const params = [branch_id];

    if (service_id) {
      query += ' AND t.service_id = ?';
      params.push(service_id);
    }

    query += `
      ORDER BY 
        CASE t.priority_type
          WHEN 'emergency' THEN 10
          WHEN 'disability' THEN 5
          WHEN 'senior' THEN 3
          ELSE 1
        END DESC,
        t.created_at ASC
      LIMIT 1 FOR UPDATE
    `;

    const [nextTokens] = await conn.query(query, params);

    if (nextTokens.length === 0) {
      await conn.rollback();
      return errorResponse(res, 'No customers currently waiting in this queue.', 404);
    }

    const token = nextTokens[0];

    // 3. Update token to 'called'
    await conn.query(
      `UPDATE tokens 
       SET status = 'called', counter_id = ?, called_at = NOW(), queue_position = 0, estimated_wait_minutes = 0
       WHERE id = ?`,
      [counter_id, token.id]
    );

    // 4. Record queue history
    await conn.query(
      `INSERT INTO queue_history (token_id, previous_status, new_status, changed_by_user_id, notes)
       VALUES (?, 'waiting', 'called', ?, ?)`,
      [token.id, req.user.id, `Called to ${counter.counter_name}`]
    );

    // 5. Recalculate remaining waiting positions
    await refreshQueuePositions(conn, token.branch_id, token.service_id);

    // 6. Notify customer
    if (token.customer_id) {
      await sendNotificationInternal(
        conn,
        token.customer_id,
        token.id,
        'token_called',
        'Your Token Has Been Called!',
        `Token ${token.token_number}: Please proceed to ${counter.counter_name} immediately.`
      );
    }

    await conn.commit();

    broadcastQueueUpdate(token.branch_id, token.service_id, {
      action: 'token_called',
      tokenId: token.id,
      tokenNumber: token.token_number,
      counterName: counter.counter_name
    });
    broadcastTokenUpdate(token.id, {
      status: 'called',
      counterName: counter.counter_name,
      counterNumber: counter.counter_number
    });
    await syncBranchDisplay(token.branch_id);

    await recordAuditLog(counter.organization_id, req.user.id, 'CALL_TOKEN', 'tokens', token.id, req.ip, {
      tokenNumber: token.token_number,
      counter: counter.counter_name
    });

    return successResponse(res, `Token ${token.token_number} called to ${counter.counter_name}!`, {
      token: {
        id: token.id,
        token_number: token.token_number,
        service_name: token.service_name,
        counter_id,
        counter_name: counter.counter_name
      }
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

/**
 * Staff Action: Mark Serving
 */
const markServing = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { tokenId } = req.params;

    await conn.beginTransaction();

    const [tokens] = await conn.query('SELECT * FROM tokens WHERE id = ? FOR UPDATE', [tokenId]);
    if (tokens.length === 0) {
      await conn.rollback();
      return errorResponse(res, 'Token not found.', 404);
    }

    const token = tokens[0];
    if (token.status !== 'called') {
      await conn.rollback();
      return errorResponse(res, `Cannot mark serving: Token is in '${token.status}' state.`, 400);
    }

    await conn.query(
      `UPDATE tokens SET status = 'serving', served_at = NOW() WHERE id = ?`,
      [tokenId]
    );

    await conn.query(
      `INSERT INTO queue_history (token_id, previous_status, new_status, changed_by_user_id, notes)
       VALUES (?, 'called', 'serving', ?, 'Customer at desk, service initiated')`,
      [tokenId, req.user.id]
    );

    await conn.commit();

    broadcastTokenUpdate(tokenId, { status: 'serving' });
    await syncBranchDisplay(token.branch_id);

    return successResponse(res, `Token ${token.token_number} is now being served.`);
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

/**
 * Staff Action: Complete Service
 */
const completeToken = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { tokenId } = req.params;
    const { internal_notes } = req.body;

    await conn.beginTransaction();

    const [tokens] = await conn.query('SELECT * FROM tokens WHERE id = ? FOR UPDATE', [tokenId]);
    if (tokens.length === 0) {
      await conn.rollback();
      return errorResponse(res, 'Token not found.', 404);
    }

    const token = tokens[0];
    if (!['called', 'serving'].includes(token.status)) {
      await conn.rollback();
      return errorResponse(res, `Cannot complete token in '${token.status}' status.`, 400);
    }

    await conn.query(
      `UPDATE tokens 
       SET status = 'completed', completed_at = NOW(), internal_notes = COALESCE(?, internal_notes) 
       WHERE id = ?`,
      [internal_notes || null, tokenId]
    );

    await conn.query(
      `INSERT INTO queue_history (token_id, previous_status, new_status, changed_by_user_id, notes)
       VALUES (?, ?, 'completed', ?, ?)`,
      [tokenId, token.status, req.user.id, internal_notes || 'Service successfully completed']
    );

    if (token.customer_id) {
      await sendNotificationInternal(
        conn,
        token.customer_id,
        tokenId,
        'service_completed',
        'Service Completed - Rate Your Experience',
        `Your visit for token ${token.token_number} is completed. Please take a moment to submit your feedback.`
      );
    }

    await conn.commit();

    broadcastQueueUpdate(token.branch_id, token.service_id, {
      action: 'service_completed',
      tokenId: token.id,
      tokenNumber: token.token_number
    });
    broadcastTokenUpdate(tokenId, { status: 'completed' });
    await syncBranchDisplay(token.branch_id);

    return successResponse(res, `Token ${token.token_number} completed successfully.`);
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

/**
 * Staff Action: Skip Token
 */
const skipToken = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { tokenId } = req.params;
    const { notes = 'Customer not present at call' } = req.body;

    await conn.beginTransaction();

    const [tokens] = await conn.query('SELECT * FROM tokens WHERE id = ? FOR UPDATE', [tokenId]);
    if (tokens.length === 0) {
      await conn.rollback();
      return errorResponse(res, 'Token not found.', 404);
    }

    const token = tokens[0];

    await conn.query(
      `UPDATE tokens SET status = 'skipped', counter_id = NULL WHERE id = ?`,
      [tokenId]
    );

    await conn.query(
      `INSERT INTO queue_history (token_id, previous_status, new_status, changed_by_user_id, notes)
       VALUES (?, ?, 'skipped', ?, ?)`,
      [tokenId, token.status, req.user.id, notes]
    );

    await refreshQueuePositions(conn, token.branch_id, token.service_id);

    if (token.customer_id) {
      await sendNotificationInternal(
        conn,
        token.customer_id,
        tokenId,
        'token_skipped',
        'Token Skipped',
        `Your token ${token.token_number} was skipped because you were not at the desk. Please approach the desk to recall.`
      );
    }

    await conn.commit();

    broadcastTokenUpdate(tokenId, { status: 'skipped' });
    await syncBranchDisplay(token.branch_id);

    return successResponse(res, `Token ${token.token_number} marked as skipped.`);
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

/**
 * Staff Action: Recall Token
 */
const recallToken = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { tokenId } = req.params;
    const { counter_id } = req.body;

    await conn.beginTransaction();

    const [tokens] = await conn.query('SELECT * FROM tokens WHERE id = ? FOR UPDATE', [tokenId]);
    if (tokens.length === 0) {
      await conn.rollback();
      return errorResponse(res, 'Token not found.', 404);
    }

    const token = tokens[0];

    await conn.query(
      `UPDATE tokens SET status = 'called', counter_id = COALESCE(?, counter_id), called_at = NOW() WHERE id = ?`,
      [counter_id || null, tokenId]
    );

    await conn.query(
      `INSERT INTO queue_history (token_id, previous_status, new_status, changed_by_user_id, notes)
       VALUES (?, ?, 'called', ?, 'Token recalled by staff')`,
      [tokenId, token.status, req.user.id]
    );

    if (token.customer_id) {
      await sendNotificationInternal(
        conn,
        token.customer_id,
        tokenId,
        'token_recalled',
        'Token Recalled!',
        `Your token ${token.token_number} has been recalled. Please proceed to the counter immediately.`
      );
    }

    await conn.commit();

    broadcastTokenUpdate(tokenId, { status: 'called' });
    await syncBranchDisplay(token.branch_id);

    return successResponse(res, `Token ${token.token_number} recalled.`);
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

/**
 * Staff Action: Mark No-Show
 */
const markNoShow = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { tokenId } = req.params;

    await conn.beginTransaction();

    const [tokens] = await conn.query('SELECT * FROM tokens WHERE id = ? FOR UPDATE', [tokenId]);
    if (tokens.length === 0) {
      await conn.rollback();
      return errorResponse(res, 'Token not found.', 404);
    }

    const token = tokens[0];

    await conn.query(
      `UPDATE tokens SET status = 'no_show', counter_id = NULL WHERE id = ?`,
      [tokenId]
    );

    await conn.query(
      `INSERT INTO queue_history (token_id, previous_status, new_status, changed_by_user_id, notes)
       VALUES (?, ?, 'no_show', ?, 'Marked as no-show after repeated calls')`,
      [tokenId, token.status, req.user.id]
    );

    await conn.commit();

    broadcastTokenUpdate(tokenId, { status: 'no_show' });
    await syncBranchDisplay(token.branch_id);

    return successResponse(res, `Token ${token.token_number} marked as no-show.`);
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

/**
 * Staff Action: Transfer Token to Another Service / Counter
 */
const transferToken = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { tokenId } = req.params;
    const { target_service_id, target_counter_id, transfer_notes } = req.body;

    if (!target_service_id) {
      return errorResponse(res, 'Target service ID is required for transfer.', 400);
    }

    await conn.beginTransaction();

    const [tokens] = await conn.query('SELECT * FROM tokens WHERE id = ? FOR UPDATE', [tokenId]);
    if (tokens.length === 0) {
      await conn.rollback();
      return errorResponse(res, 'Token not found.', 404);
    }

    const token = tokens[0];

    // Transfer puts token back into 'waiting' queue of target service with high priority
    await conn.query(
      `UPDATE tokens 
       SET service_id = ?, counter_id = ?, status = 'waiting',
           internal_notes = CONCAT(COALESCE(internal_notes, ''), '\nTransferred: ', ?)
       WHERE id = ?`,
      [target_service_id, target_counter_id || null, transfer_notes || 'Transferred by staff', tokenId]
    );

    await conn.query(
      `INSERT INTO queue_history (token_id, previous_status, new_status, changed_by_user_id, notes)
       VALUES (?, ?, 'transferred', ?, ?)`,
      [tokenId, token.status, req.user.id, `Transferred to service ID ${target_service_id}`]
    );

    // Refresh both origin and target queues
    await refreshQueuePositions(conn, token.branch_id, token.service_id);
    await refreshQueuePositions(conn, token.branch_id, target_service_id);

    if (token.customer_id) {
      await sendNotificationInternal(
        conn,
        token.customer_id,
        tokenId,
        'token_transferred',
        'Token Transferred',
        `Your token ${token.token_number} has been transferred to another service desk.`
      );
    }

    await conn.commit();

    broadcastTokenUpdate(tokenId, { status: 'transferred', serviceId: target_service_id });
    await syncBranchDisplay(token.branch_id);

    return successResponse(res, `Token ${token.token_number} transferred successfully.`);
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

module.exports = {
  getLiveQueue,
  callNextToken,
  markServing,
  completeToken,
  skipToken,
  recallToken,
  markNoShow,
  transferToken
};
