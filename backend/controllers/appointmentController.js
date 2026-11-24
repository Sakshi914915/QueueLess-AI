const crypto = require('crypto');
const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const { refreshQueuePositions, sendNotificationInternal, syncBranchDisplay } = require('../services/queueService');
const { broadcastQueueUpdate } = require('../sockets/socketManager');
const { recordAuditLog } = require('../middleware/auth');

/**
 * Get Available Appointment Slots for a Date & Service
 */
const getAvailableSlots = async (req, res, next) => {
  try {
    const { branch_id, service_id, date } = req.query;

    if (!branch_id || !service_id || !date) {
      return errorResponse(res, 'Branch ID, Service ID, and Date (YYYY-MM-DD) are required.', 400);
    }

    // Check operating hours for the day of week
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDate = new Date(date);
    const dayName = dayNames[targetDate.getDay()];

    const [hours] = await pool.query(
      'SELECT open_time, close_time, is_closed FROM operating_hours WHERE branch_id = ? AND day_of_week = ?',
      [branch_id, dayName]
    );

    if (hours.length > 0 && hours[0].is_closed) {
      return successResponse(res, 'Branch is closed on this day.', { slots: [], isClosed: true });
    }

    // Check holidays
    const [holidays] = await pool.query(
      'SELECT description FROM holidays WHERE branch_id = ? AND holiday_date = ?',
      [branch_id, date]
    );
    if (holidays.length > 0) {
      return successResponse(res, `Branch is closed for holiday: ${holidays[0].description}`, {
        slots: [],
        holiday: holidays[0].description
      });
    }

    // Generate standard slots between 09:00 and 17:00
    const standardSlots = [
      '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
      '12:00 PM', '12:30 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
      '04:00 PM', '04:30 PM', '05:00 PM'
    ];

    // Query booked appointments for that date and service
    const [booked] = await pool.query(
      `SELECT time_slot FROM appointments 
       WHERE branch_id = ? AND service_id = ? AND appointment_date = ? AND status IN ('booked', 'checked_in')`,
      [branch_id, service_id, date]
    );

    const bookedSet = new Set(booked.map(b => b.time_slot));

    const slotObjects = standardSlots.map(slot => ({
      slot,
      isAvailable: !bookedSet.has(slot)
    }));

    return successResponse(res, 'Available appointment slots retrieved.', {
      date,
      day: dayName,
      slots: slotObjects
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Book Appointment
 */
const bookAppointment = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { branch_id, service_id, appointment_date, time_slot, notes } = req.body;

    if (!branch_id || !service_id || !appointment_date || !time_slot) {
      return errorResponse(res, 'Branch ID, Service ID, appointment date, and time slot are required.', 400);
    }

    await conn.beginTransaction();

    // Check service & organization
    const [services] = await conn.query(
      'SELECT organization_id, name FROM services WHERE id = ? AND branch_id = ?',
      [service_id, branch_id]
    );
    if (services.length === 0) {
      await conn.rollback();
      return errorResponse(res, 'Invalid branch or service selection.', 400);
    }

    const orgId = services[0].organization_id;

    // Check double-booking slot under lock
    const [existingSlot] = await conn.query(
      `SELECT id FROM appointments 
       WHERE branch_id = ? AND service_id = ? AND appointment_date = ? AND time_slot = ? AND status IN ('booked', 'checked_in')
       FOR UPDATE`,
      [branch_id, service_id, appointment_date, time_slot]
    );

    if (existingSlot.length > 0) {
      await conn.rollback();
      return errorResponse(res, 'This appointment slot is already reserved. Please choose another time slot.', 409);
    }

    const [result] = await conn.query(
      `INSERT INTO appointments (user_id, organization_id, branch_id, service_id, appointment_date, time_slot, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'booked', ?)`,
      [req.user.id, orgId, branch_id, service_id, appointment_date, time_slot, notes || null]
    );

    const appointmentId = result.insertId;

    await sendNotificationInternal(
      conn,
      req.user.id,
      null,
      'appointment_booked',
      'Appointment Confirmed',
      `Your appointment for ${services[0].name} on ${appointment_date} at ${time_slot} is confirmed.`
    );

    await conn.commit();
    await recordAuditLog(orgId, req.user.id, 'BOOK_APPOINTMENT', 'appointments', appointmentId, req.ip);

    return successResponse(res, 'Appointment booked successfully!', { id: appointmentId }, 201);
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

/**
 * Get User Appointments
 */
const getMyAppointments = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*, s.name as service_name, s.code as service_code,
              b.name as branch_name, b.address as branch_address,
              o.name as organization_name, o.category,
              t.token_number as checked_in_token_number
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       JOIN branches b ON a.branch_id = b.id
       JOIN organizations o ON a.organization_id = o.id
       LEFT JOIN tokens t ON a.checked_in_token_id = t.id
       WHERE a.user_id = ?
       ORDER BY a.appointment_date DESC, a.time_slot ASC`,
      [req.user.id]
    );

    return successResponse(res, 'My appointments retrieved.', rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Digital QR Check-In: Converts Appointment to Active Queue Token on Arrival
 */
const checkInAppointment = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { appointmentId } = req.params;

    await conn.beginTransaction();

    const [appointments] = await conn.query(
      `SELECT a.*, s.code as service_code, s.name as service_name 
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       WHERE a.id = ? FOR UPDATE`,
      [appointmentId]
    );

    if (appointments.length === 0) {
      await conn.rollback();
      return errorResponse(res, 'Appointment not found.', 404);
    }

    const appt = appointments[0];
    if (appt.status !== 'booked') {
      await conn.rollback();
      return errorResponse(res, `Appointment is already ${appt.status}.`, 400);
    }

    // Generate token under lock
    const [countResult] = await conn.query(
      `SELECT COUNT(*) as total_today 
       FROM tokens 
       WHERE branch_id = ? AND service_id = ? AND DATE(created_at) = CURDATE()`,
      [appt.branch_id, appt.service_id]
    );

    const sequenceNumber = (countResult[0]?.total_today || 0) + 1;
    const tokenNumber = `${appt.service_code}-${String(sequenceNumber).padStart(3, '0')}`;
    const displayCode = `${appt.service_code} #${sequenceNumber}`;
    const qrCodeHash = crypto.randomBytes(20).toString('hex');

    const [insertResult] = await conn.query(
      `INSERT INTO tokens 
       (token_number, display_code, customer_id, organization_id, branch_id, service_id, queue_position, priority_type, status, qr_code_hash, notes)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'normal', 'waiting', ?, 'Checked-in from appointment')`,
      [tokenNumber, displayCode, appt.user_id, appt.organization_id, appt.branch_id, appt.service_id, qrCodeHash]
    );

    const tokenId = insertResult.insertId;

    await conn.query(
      `UPDATE appointments SET status = 'checked_in', checked_in_token_id = ? WHERE id = ?`,
      [tokenId, appointmentId]
    );

    await conn.query(
      `INSERT INTO queue_history (token_id, previous_status, new_status, changed_by_user_id, notes)
       VALUES (?, NULL, 'waiting', ?, 'Digital Check-in from scheduled appointment')`,
      [tokenId, req.user.id]
    );

    await refreshQueuePositions(conn, appt.branch_id, appt.service_id);

    await sendNotificationInternal(
      conn,
      appt.user_id,
      tokenId,
      'appointment_checked_in',
      'Check-in Complete: Token Generated',
      `You are checked in! Your live queue token is ${tokenNumber}.`
    );

    await conn.commit();

    broadcastQueueUpdate(appt.branch_id, appt.service_id, {
      action: 'appointment_checked_in',
      tokenNumber
    });
    await syncBranchDisplay(appt.branch_id);

    return successResponse(res, `Checked in successfully! Token: ${tokenNumber}`, {
      tokenId,
      tokenNumber,
      displayCode,
      qrCodeHash
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

/**
 * Cancel Appointment
 */
const cancelAppointment = async (req, res, next) => {
  try {
    const { appointmentId } = req.params;

    const [rows] = await pool.query('SELECT * FROM appointments WHERE id = ?', [appointmentId]);
    if (rows.length === 0) return errorResponse(res, 'Appointment not found.', 404);

    const appt = rows[0];
    if (req.user.role === 'customer' && appt.user_id !== req.user.id) {
      return errorResponse(res, 'Unauthorized.', 403);
    }

    await pool.query('UPDATE appointments SET status = "cancelled" WHERE id = ?', [appointmentId]);
    return successResponse(res, 'Appointment cancelled.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAvailableSlots,
  bookAppointment,
  getMyAppointments,
  checkInAppointment,
  cancelAppointment
};
