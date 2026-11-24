const crypto = require('crypto');
const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const {
  calculateWaitTime,
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
 * Generate Digital Queue Token (Online Customer or Staff Walk-in)
 * Protected with Database Transactions and Concurrency Locks
 */
const generateToken = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { branch_id, service_id, priority_type = 'normal', priority_reason, walkin_name, walkin_phone } = req.body;

    if (!branch_id || !service_id) {
      return errorResponse(res, 'Branch ID and Service ID are required.', 400);
    }

    const customerId = req.user && req.user.role === 'customer' ? req.user.id : null;

    // Validate customer cannot have multiple active waiting/serving tokens in the same service simultaneously
    if (customerId) {
      const [existingActive] = await conn.query(
        `SELECT id, token_number FROM tokens 
         WHERE customer_id = ? AND branch_id = ? AND service_id = ? AND status IN ('waiting', 'called', 'serving')`,
        [customerId, branch_id, service_id]
      );
      if (existingActive.length > 0) {
        return errorResponse(
          res,
          `You already have an active token (${existingActive[0].token_number}) for this service. Please wait until your turn is completed.`,
          409
        );
      }
    }

    await conn.beginTransaction();

    // 1. Lock service row to serialize token number generation for this service today
    const [serviceRows] = await conn.query(
      `SELECT s.id, s.organization_id, s.branch_id, s.name, s.code, s.avg_service_duration_min, s.is_active,
              b.name as branch_name, o.name as org_name
       FROM services s
       JOIN branches b ON s.branch_id = b.id
       JOIN organizations o ON s.organization_id = o.id
       WHERE s.id = ? AND s.branch_id = ? FOR UPDATE`,
      [service_id, branch_id]
    );

    if (serviceRows.length === 0 || !serviceRows[0].is_active) {
      await conn.rollback();
      return errorResponse(res, 'Requested service is inactive or does not belong to this branch.', 400);
    }

    const service = serviceRows[0];

    // 2. Compute today's sequential count for this service safely under lock
    const [countResult] = await conn.query(
      `SELECT COUNT(*) as total_today 
       FROM tokens 
       WHERE branch_id = ? AND service_id = ? AND DATE(created_at) = CURDATE()`,
      [branch_id, service_id]
    );

    const sequenceNumber = (countResult[0]?.total_today || 0) + 1;
    const paddedSeq = String(sequenceNumber).padStart(3, '0');
    const tokenNumber = `${service.code}-${paddedSeq}`;
    const displayCode = `${service.code} #${sequenceNumber}`;

    // Cryptographic QR verification token
    const qrCodeHash = crypto.randomBytes(20).toString('hex');

    // 3. Insert the new token with initial queue_position 0 (refreshed next)
    const [insertResult] = await conn.query(
      `INSERT INTO tokens 
       (token_number, display_code, customer_id, walkin_name, walkin_phone, organization_id, 
        branch_id, service_id, queue_position, priority_type, priority_reason, status, 
        estimated_wait_minutes, qr_code_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'waiting', 0, ?)`,
      [
        tokenNumber,
        displayCode,
        customerId,
        walkin_name || null,
        walkin_phone || null,
        service.organization_id,
        branch_id,
        service_id,
        priority_type || 'normal',
        priority_reason || null,
        qrCodeHash
      ]
    );

    const tokenId = insertResult.insertId;

    // 4. Log initial queue history
    await conn.query(
      `INSERT INTO queue_history (token_id, previous_status, new_status, changed_by_user_id, notes)
       VALUES (?, NULL, 'waiting', ?, 'Token generated')`,
      [tokenId, req.user?.id || null]
    );

    // 5. Refresh queue positions and rule-based wait times for all waiting tokens in this service
    await refreshQueuePositions(conn, branch_id, service_id);

    // Fetch the calculated position & wait time for this new token
    const [finalTokenRows] = await conn.query(
      `SELECT id, token_number, display_code, queue_position, estimated_wait_minutes, status, priority_type, qr_code_hash, created_at
       FROM tokens WHERE id = ?`,
      [tokenId]
    );
    const finalToken = finalTokenRows[0];

    // 6. Create customer notification
    if (customerId) {
      await sendNotificationInternal(
        conn,
        customerId,
        tokenId,
        'token_created',
        'Token Generated Successfully',
        `Your token ${tokenNumber} has been generated. Position: #${finalToken.queue_position}. Estimated wait: ${finalToken.estimated_wait_minutes} min.`
      );
    }

    await conn.commit();

    // Broadcast queue update to connected clients
    broadcastQueueUpdate(branch_id, service_id, {
      action: 'token_generated',
      tokenNumber,
      serviceId: service_id
    });
    await syncBranchDisplay(branch_id);

    await recordAuditLog(service.organization_id, req.user?.id || null, 'GENERATE_TOKEN', 'tokens', tokenId, req.ip, {
      tokenNumber,
      priority_type
    });

    return successResponse(res, 'Digital token generated successfully!', {
      token: {
        id: finalToken.id,
        token_number: finalToken.token_number,
        display_code: finalToken.display_code,
        queue_position: finalToken.queue_position,
        estimated_wait_minutes: finalToken.estimated_wait_minutes,
        status: finalToken.status,
        priority_type: finalToken.priority_type,
        qr_code_hash: finalToken.qr_code_hash,
        service_name: service.name,
        branch_name: service.branch_name,
        organization_name: service.org_name,
        created_at: finalToken.created_at
      }
    }, 201);
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

/**
 * Get Token Details by ID or Hash
 */
const getTokenById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT t.*, s.name as service_name, s.code as service_code, s.avg_service_duration_min,
              b.name as branch_name, b.code as branch_code, b.address as branch_address,
              o.name as organization_name, o.category,
              c.counter_number, c.name as counter_name,
              u.full_name as customer_name, u.email as customer_email
       FROM tokens t
       JOIN services s ON t.service_id = s.id
       JOIN branches b ON t.branch_id = b.id
       JOIN organizations o ON t.organization_id = o.id
       LEFT JOIN counters c ON t.counter_id = c.id
       LEFT JOIN users u ON t.customer_id = u.id
       WHERE t.id = ? OR t.qr_code_hash = ?`,
      [id, id]
    );

    if (rows.length === 0) {
      return errorResponse(res, 'Token not found.', 404);
    }

    const token = rows[0];

    // Current token being served at this counter/service
    const [servingNow] = await pool.query(
      `SELECT token_number, counter_id, called_at 
       FROM tokens 
       WHERE service_id = ? AND status IN ('called', 'serving')
       ORDER BY called_at DESC LIMIT 1`,
      [token.service_id]
    );

    const peopleAhead = Math.max(0, token.queue_position - 1);

    return successResponse(res, 'Token details retrieved.', {
      ...token,
      people_ahead: peopleAhead,
      current_serving_token: servingNow.length > 0 ? servingNow[0].token_number : 'None',
      rule_based_calculation: {
        formula: `(${peopleAhead} people ahead * ${token.avg_service_duration_min} min avg) / Active Counters`,
        disclaimer: 'Waiting time is a transparent mathematical estimate and may fluctuate based on real service times.'
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Logged-in Customer Tokens (Active & History)
 */
const getMyTokens = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.token_number, t.display_code, t.status, t.queue_position, 
              t.estimated_wait_minutes, t.priority_type, t.qr_code_hash, t.created_at,
              t.called_at, t.served_at, t.completed_at,
              s.id as service_id, s.name as service_name, s.code as service_code, s.avg_service_duration_min,
              b.id as branch_id, b.name as branch_name,
              o.id as organization_id, o.name as organization_name, o.category,
              c.counter_number, c.name as counter_name,
              f.id as feedback_id, f.rating as feedback_rating
       FROM tokens t
       JOIN services s ON t.service_id = s.id
       JOIN branches b ON t.branch_id = b.id
       JOIN organizations o ON t.organization_id = o.id
       LEFT JOIN counters c ON t.counter_id = c.id
       LEFT JOIN feedback f ON t.id = f.token_id
       WHERE t.customer_id = ?
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );

    const activeTokens = rows.filter(t => ['waiting', 'called', 'serving'].includes(t.status));
    const pastTokens = rows.filter(t => ['completed', 'cancelled', 'skipped', 'no_show'].includes(t.status));

    return successResponse(res, 'My tokens retrieved.', {
      activeTokens,
      pastTokens
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel Token by Customer
 */
const cancelToken = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { reason = 'Cancelled by user' } = req.body;

    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT t.*, s.name as service_name FROM tokens t
       JOIN services s ON t.service_id = s.id
       WHERE t.id = ? FOR UPDATE`,
      [id]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return errorResponse(res, 'Token not found.', 404);
    }

    const token = rows[0];

    // Authorization: customer must own the token or be staff/org_admin
    if (req.user.role === 'customer' && token.customer_id !== req.user.id) {
      await conn.rollback();
      return errorResponse(res, 'Unauthorized to cancel this token.', 403);
    }

    if (!['waiting', 'called'].includes(token.status)) {
      await conn.rollback();
      return errorResponse(res, `Cannot cancel token in '${token.status}' state.`, 400);
    }

    await conn.query(
      `UPDATE tokens 
       SET status = 'cancelled', queue_position = 0, estimated_wait_minutes = 0 
       WHERE id = ?`,
      [id]
    );

    await conn.query(
      `INSERT INTO queue_history (token_id, previous_status, new_status, changed_by_user_id, notes)
       VALUES (?, ?, 'cancelled', ?, ?)`,
      [id, token.status, req.user.id, reason]
    );

    // Refresh remaining queue
    await refreshQueuePositions(conn, token.branch_id, token.service_id);

    if (token.customer_id) {
      await sendNotificationInternal(
        conn,
        token.customer_id,
        token.id,
        'token_cancelled',
        'Token Cancelled',
        `Your token ${token.token_number} for ${token.service_name} has been cancelled.`
      );
    }

    await conn.commit();

    broadcastQueueUpdate(token.branch_id, token.service_id, {
      action: 'token_cancelled',
      tokenId: token.id,
      tokenNumber: token.token_number
    });
    broadcastTokenUpdate(token.id, { status: 'cancelled' });
    await syncBranchDisplay(token.branch_id);

    return successResponse(res, 'Token cancelled successfully.');
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

/**
 * Verify Token QR Code (Staff / Security check-in)
 */
const verifyTokenQR = async (req, res, next) => {
  try {
    const { hash } = req.params;

    const [rows] = await pool.query(
      `SELECT t.*, s.name as service_name, s.code as service_code,
              b.name as branch_name, o.name as organization_name,
              u.full_name as customer_name, u.email as customer_email, u.phone as customer_phone
       FROM tokens t
       JOIN services s ON t.service_id = s.id
       JOIN branches b ON t.branch_id = b.id
       JOIN organizations o ON t.organization_id = o.id
       LEFT JOIN users u ON t.customer_id = u.id
       WHERE t.qr_code_hash = ?`,
      [hash]
    );

    if (rows.length === 0) {
      return errorResponse(res, 'Invalid QR code. Token not found in system.', 404);
    }

    return successResponse(res, 'QR Token verified successfully.', rows[0]);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateToken,
  getTokenById,
  getMyTokens,
  cancelToken,
  verifyTokenQR
};
